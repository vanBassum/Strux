#include "WebServerManager.h"
#include "ReplyBody.h"
#include "ConsoleManager.h"
#include "SettingsManager.h"
#include "CommandManager.h"
#include "JsonHelpers.h"
#include "ResumeTokens.h"

#include <unistd.h>
#include <cstdio>
#include <cstring>
#include <esp_log.h>

static constexpr const char* TAG = "WebServerManager";

// The manager, reachable from a C callback that carries no context of its own.
//
// `httpd_config_t::close_fn` is a plain function pointer with signature
// `(httpd_handle_t, int fd)` — no user pointer, unlike every other callback here,
// which is why this one alone needs a static. Every other callback here takes a
// user pointer; a capturing lambda cannot convert to this one, so the `this` has to
// come from somewhere outside the call.
//
// Safe in practice for the reason a singleton usually is not: there is exactly one
// WebServerManager, it is owned by StruxContext for the life of the process, and
// `Init()` is guarded by an InitState — so the pointer is written once, before the
// server that would call it exists, and never dangles. Checked for null anyway,
// because the httpd task can outlive a failed Init.
static WebServerManager* s_instance_ = nullptr;

WebServerManager::WebServerManager(StruxProvider& strux)
    : strux_(strux)
{
}

void WebServerManager::Init()
{
    auto initAttempt = initState.TryBeginInit();
    if (!initAttempt)
    {
        ESP_LOGW(TAG, "Already initialized or initializing");
        return;
    }

    s_instance_ = this;

    wsHandler_.SetCommandManager(strux_.getCommandManager());
    wsHandler_.SetConsole(strux_.getConsoleManager());

    strux_.getSettingsManager().Register({ &webPassword_ });
    auth_.Init();   // snapshot the stored password (after registration)
    wsHandler_.SetAuth(auth_);

    StartServer();
    RegisterRoutes();

    strux_.getCommandManager().Register(this, commands_);

    // Log delivery is a PULL now: every connection holds a cursor into the console
    // ring and this task walks them. What that removes is not the callback so much
    // as the fan-out that hung off it -- this manager used to hand each line to its
    // own clients AND to RelayManager, which is a web server reaching sideways into
    // a peer for no reason except that ConsoleManager had room for one subscriber.
    // The relay now drains the same ring from its own read loop and neither knows
    // the other exists.
    consolePump_.Init("ConsolePump", 4, 3072);
    consolePump_.SetHandler([this]() { ConsolePumpLoop(); });
    consolePump_.Run();

    initAttempt.SetReady();
    ESP_LOGI(TAG, "Initialized");
}

void WebServerManager::ConsolePumpLoop()
{
    for (;;)
    {
        vTaskDelay(pdMS_TO_TICKS(PUMP_INTERVAL_MS));
        if (server_) wsHandler_.PumpLogs(server_, strux_.getConsoleManager());
    }
}

void WebServerManager::StartServer()
{
    httpd_config_t config = HTTPD_DEFAULT_CONFIG();
    config.uri_match_fn = httpd_uri_match_wildcard;
    config.stack_size = 8192;
    config.max_uri_handlers = 20;
    config.close_fn = [](httpd_handle_t, int fd) {
        if (s_instance_)
            s_instance_->wsHandler_.OnClientDisconnected(fd);
        close(fd);
    };
    config.lru_purge_enable = true;

    // esp_http_server narrates a client disappearing as three warnings — a recv
    // errno, an unmasked frame read from the corpse of the connection, and a failed
    // send — none of which a reader can act on, and all of which a browser produces
    // every time a tab closes. At ERROR these components still report faults that
    // are this device's own. Raise them when debugging the transport itself.
    esp_log_level_set("httpd_txrx", ESP_LOG_ERROR);
    esp_log_level_set("httpd_ws", ESP_LOG_ERROR);

    esp_err_t err = httpd_start(&server_, &config);
    if (err != ESP_OK)
    {
        ESP_LOGE(TAG, "Failed to start HTTP server: %s", esp_err_to_name(err));
        return;
    }

    ESP_LOGI(TAG, "HTTP server started on port %d", config.server_port);
}

void WebServerManager::RegisterRoutes()
{
    if (!server_) return;

    // HTTP serves two things only: the WebSocket upgrade (which carries ALL
    // device interaction — commands, uploads, downloads, auth) and the static
    // app that bootstraps the page. No /api command route, no CORS: every
    // device interaction is a channel on the one socket.
    wsHandler_.RegisterRoute(server_);
    staticFileHandler_.RegisterRoute(server_);
}

// ──────────────────────────────────────────────────────────────
// Commands
// ──────────────────────────────────────────────────────────────

RequestError WebServerManager::Cmd_GetWebFile(CommandContext& ctx)
{
    // First handler on the pull contract: no envelope handling, no JsonReader, and
    // it will keep working unchanged when the request format stops being JSON.
    char path[192] = {};
    RETURN_IF_ERROR(ctx.readArgs(Required("path", path,
        "Path of the file within the device's web assets, e.g. 'index.html' or "
        "'assets/index.js'. An empty path or a directory resolves to index.html.")));

    StaticFileHandler::Resolved file;
    const bool found = StaticFileHandler::Resolve(path, file);

    // The header is a record; the body is raw bytes after it. The scope must therefore
    // close before the newline that divides them, hence the braces — the reply is not
    // one document, and ctx.out stays reachable alongside ctx.reply for exactly this.
    if (!found)
    {
        // A real 404 — SPA fallback is the asking route layer's decision, not
        // ours (see StaticFileHandler::Resolve).
        {
            auto head = ctx.reply.object();
            head.field("ok", true);
            head.field("status", static_cast<uint32_t>(404));
        }
        protocol::EndRecord(ctx.out);
        return RequestError::Ok;   // the request was fine; the file simply is not there
    }

    {
        auto head = ctx.reply.object();
        head.field("ok", true);
        head.field("status", static_cast<uint32_t>(200));
        head.field("contentType", file.contentType);
        if (file.gzipped)
            head.field("contentEncoding", "gzip");
    }
    protocol::EndRecord(ctx.out);

    // One write of the whole file, straight from flash-mapped rodata: Channel::write
    // splits it across the channel window itself, so a 200 KB bundle still needs no
    // 200 KB buffer here or on the transport — and no read buffer at all now that
    // there is no file to read.
    ctx.out.write(file.data, file.size);
    return RequestError::Ok;
}

// ──────────────────────────────────────────────────────────────
// auth — the handshake as ordinary commands. Nothing here frames its own reply or
// parses its own wire format any more; it is a handler like every other.
// ──────────────────────────────────────────────────────────────

RequestError WebServerManager::Cmd_AuthHello(CommandContext& ctx)
{
    RETURN_IF_ERROR(ctx.readArgs());

    // Per CONNECTION, not per device. A transport whose peer is already proven
    // has nothing left to ask for, while a browser socket on a password-protected
    // device does — and both arrive here. Asking the Authenticator alone told a
    // remote browser riding an authenticated relay pipe to log in with a password
    // it has no way to know.
    const bool alreadyAuthed = ctx.connection && ctx.connection->isAuthed();

    auto resp = ctx.reply.object();
    resp.field("authRequired", !alreadyAuthed && auth_.AuthRequired());
    return RequestError::Ok;
}

RequestError WebServerManager::Cmd_AuthLogin(CommandContext& ctx)
{
    char password[64] = {};
    RETURN_IF_ERROR(ctx.readArgs(Optional("password", password,
        "The device's web password (setting 'web.password'). Omit it only to test "
        "whether an empty password is accepted.")));

    auto resp = ctx.reply.object();

    // A wrong password is MEANING, not form: the request was perfectly well made, the
    // answer is no. So it is a reply, not a refusal.
    if (!auth_.CheckPassword(password))
    {
        resp.field("ok", false);
        return RequestError::Ok;
    }

    char key[ResumeTokens::TOKEN_LEN] = {};
    auth_.MintKey(key);
    if (ctx.connection) ctx.connection->authenticate(key);

    resp.field("ok", true);
    resp.field("key", key);
    return RequestError::Ok;
}

RequestError WebServerManager::Cmd_AuthResume(CommandContext& ctx)
{
    char key[ResumeTokens::TOKEN_LEN] = {};
    RETURN_IF_ERROR(ctx.readArgs(Required("key", key,
        "The channel key a previous successful 'auth login' returned.")));

    auto resp = ctx.reply.object();

    if (!auth_.ValidateKey(key))
    {
        resp.field("ok", false);
        return RequestError::Ok;
    }

    if (ctx.connection) ctx.connection->authenticate(key);
    resp.field("ok", true);
    return RequestError::Ok;
}
