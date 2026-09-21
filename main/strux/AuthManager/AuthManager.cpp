#include "AuthManager.h"
#include "SettingsManager.h"
#include "CommandManager.h"
#include "ResumeTokens.h"

#include <esp_log.h>

AuthManager::AuthManager(StruxProvider& strux)
    : strux_(strux)
{
}

void AuthManager::Init()
{
    auto initAttempt = initState_.TryBeginInit();
    if (!initAttempt)
    {
        ESP_LOGW(TAG, "Already initialized or initializing");
        return;
    }

    strux_.getSettingsManager().Register({ &webPassword_ });
    auth_.Init();   // snapshot the stored password (after registration)
    strux_.getCommandManager().Register(this, commands_);

    initAttempt.SetReady();
    ESP_LOGI(TAG, "Initialized");
}

// ──────────────────────────────────────────────────────────────
// auth — the handshake as ordinary commands. Nothing here frames its own reply or
// parses its own wire format; it is a handler like every other.
// ──────────────────────────────────────────────────────────────

RequestError AuthManager::Cmd_AuthHello(CommandContext& ctx)
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

RequestError AuthManager::Cmd_AuthLogin(CommandContext& ctx)
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

RequestError AuthManager::Cmd_AuthResume(CommandContext& ctx)
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
