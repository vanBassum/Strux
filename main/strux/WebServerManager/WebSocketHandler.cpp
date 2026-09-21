#include "WebSocketHandler.h"
#include "CommandManager.h"
#include "Authenticator.h"
#include "AuthGate.h"
#include "WsTransport.h"   // the concrete Transport for this socket
#include "Connection.h"
#include "esp_log.h"
#include "esp_timer.h"

#include <cstring>

static constexpr const char* TAG = "WebSocketHandler";

// The inbound frame-drain primitive (the private httpd_ws_get_frame_type wart)
// now lives in WsTransport::RecvChunk; Channel::read() pulls streamed request
// bodies through it. See WsTransport.h.

void WebSocketHandler::SetCommandManager(CommandManager& commandManager)
{
    commandManager_ = &commandManager;
}

void WebSocketHandler::SetAuth(Authenticator& auth)
{
    auth_ = &auth;
}

void WebSocketHandler::RegisterRoute(httpd_handle_t server)
{
    const httpd_uri_t ws_route = {
        .uri = "/ws",
        .method = HTTP_GET,
        .handler = HandleWs,
        .user_ctx = this,
        .is_websocket = true,
        .handle_ws_control_frames = false,
        .supported_subprotocol = nullptr,
    };
    httpd_register_uri_handler(server, &ws_route);
}

// ──────────────────────────────────────────────────────────────
// Client tracking
// ──────────────────────────────────────────────────────────────

bool WebSocketHandler::AddWsClient(int fd)
{
    bool authed = !(auth_ && auth_->AuthRequired());   // empty password ⇒ authed at connect
    return registry_.add(fd, authed, esp_timer_get_time()) != nullptr;
}

void WebSocketHandler::RemoveWsClient(int fd)
{
    registry_.remove(fd);
}

void WebSocketHandler::TouchClient(int fd)
{
    if (auto* c = registry_.find(fd); c && c->authed)
        auth_->TouchKey(c->key);   // TouchKey locks its own table
}

void WebSocketHandler::OnClientDisconnected(int fd)
{
    RemoveWsClient(fd);
}

void WebSocketHandler::Broadcast(httpd_handle_t server, const char* json, int len)
{
    // Snapshot authed client fds under the registry lock, then send outside it.
    // Holding the lock across send would deadlock when a broadcaster source
    // (e.g. ConsoleManager) already holds its own mutex and httpd internals
    // call back into us.
    int clients[ConnectionRegistry::MAX];
    int count = 0;
    registry_.forEach([&](const WsConnection& c) {
        if (c.authed && count < ConnectionRegistry::MAX) clients[count++] = c.fd;
    });

    // Broadcast as a binary channel chunk on the reserved broadcast channel 0,
    // so the socket carries ONE uniform chunk format for replies and broadcasts
    // alike (no TEXT frames). Clients allocate channel ids from 1, so 0 never
    // collides with a command.
    uint8_t buf[channel::HEADER_LEN + 256];
    int cap = static_cast<int>(sizeof(buf) - channel::HEADER_LEN);
    if (len > cap) len = cap;
    channel::writeHeader(buf, channel::BROADCAST_CHANNEL, channel::FLAG_FINAL);
    memcpy(buf + channel::HEADER_LEN, json, len);

    httpd_ws_frame_t frame = {};
    frame.type = HTTPD_WS_TYPE_BINARY;
    frame.payload = buf;
    frame.len = channel::HEADER_LEN + len;

    LOCK(sendMutex_);
    for (int i = 0; i < count; i++)
    {
        if (httpd_ws_send_frame_async(server, clients[i], &frame) != ESP_OK)
        {
            // DEBUG, not WARN. A browser that closes a tab or reloads takes its
            // socket with it without a close frame, so the next broadcast to that
            // fd fails — every page close produced two scary lines about a device
            // that was working perfectly. Removing the client IS the handling.
            ESP_LOGD(TAG, "Broadcast failed to fd=%d, removing", clients[i]);
            registry_.remove(clients[i]);
        }
    }
}

// ──────────────────────────────────────────────────────────────
// WebSocket frame handling
// ──────────────────────────────────────────────────────────────

esp_err_t WebSocketHandler::HandleWs(httpd_req_t* req)
{
    auto* self = static_cast<WebSocketHandler*>(req->user_ctx);

    if (req->method == HTTP_GET)
    {
        // The WS now opens UNAUTHENTICATED — auth is an in-band handshake
        // (see AuthGate). esp_http_server has already sent the 101; we
        // only need a client slot. A full table (after reaping stale un-authed
        // sockets) refuses the upgrade so the client hits its reconnect loop.
        if (!self->AddWsClient(httpd_req_to_sockfd(req)))
            return ESP_FAIL;
        return ESP_OK;
    }

    httpd_ws_frame_t frame = {};
    frame.payload = self->inboundFrame_;
    esp_err_t ret = httpd_ws_recv_frame(req, &frame, sizeof(self->inboundFrame_) - 1);
    if (ret != ESP_OK)
    {
        // Also DEBUG: the common cause is the peer vanishing, which is not this
        // device's problem and not something a reader can act on.
        ESP_LOGD(TAG, "WS recv failed: %s", esp_err_to_name(ret));
        self->RemoveWsClient(httpd_req_to_sockfd(req));
        return ret;
    }

    // Any inbound frame (heartbeat included) keeps the channel alive —
    // an open tab never logs out; see spec.
    self->TouchClient(httpd_req_to_sockfd(req));

    if (frame.type == HTTPD_WS_TYPE_CLOSE)
    {
        self->RemoveWsClient(httpd_req_to_sockfd(req));
        return ESP_OK;
    }

    if (frame.type == HTTPD_WS_TYPE_BINARY)
    {
        if (frame.len >= channel::HEADER_LEN)
            self->HandleBinary(req, self->inboundFrame_, frame.len);
        return ESP_OK;
    }

    // Inbound TEXT frames are no longer used: requests are binary channel
    // chunks and no client sends text. Ignore any stray text frame.
    return ESP_OK;
}

// ──────────────────────────────────────────────────────────────
// Binary channel transport. One inbound binary frame = one
// channel chunk; step-1 requests are a single chunk dispatched synchronously.
// ──────────────────────────────────────────────────────────────

void WebSocketHandler::HandleBinary(httpd_req_t* req, const uint8_t* frame, size_t len)
{
    uint16_t sid   = channel::readU16(frame);
    uint8_t  flags = frame[2];
    const uint8_t* payload = frame + channel::HEADER_LEN;
    size_t plen = len - channel::HEADER_LEN;
    int fd = httpd_req_to_sockfd(req);

    // All inbound frames are processed single-threaded on the httpd task, so the
    // AuthGate below is the only writer of this connection's state (authed/key).
    // Broadcast runs on another task and may reset (remove) a slot concurrently,
    // but it only ever *clears* a slot — it never sets `authed` — so the auth gate
    // can't be defeated by that race, and a cleared slot reads as empty (self-
    // healing). If a worker task ever consumes these pointers (step 6), this needs
    // real locking (copy-under-lock, as the pre-refactor code did).
    WsConnection* conn = registry_.find(fd);
    if (!conn)
    {
        // The socket is live as far as httpd is concerned, but it has no slot. Two
        // ways in: the broadcast path evicts a slot when a send fails while httpd
        // keeps the connection, and a refused upgrade (table full) is returned after
        // esp_http_server has already sent the 101. Returning silently left the
        // client holding an established socket, waiting out its timeout for a reply
        // that was never coming — every command swallowed, nothing logged. Refuse the
        // channel instead, so the failure lands at the caller rather than in a
        // timeout.
        ESP_LOGW(TAG, "frame on fd=%d with no client slot - refusing channel %u",
                 fd, (unsigned)sid);
        WsTransport link(req, sendMutex_);
        Channel s(sid, link, channelFrame_, CHANNEL_WINDOW,
                  channelInbound_, sizeof(channelInbound_));
        s.feedRequest(payload, plen, (flags & channel::FLAG_FINAL) != 0);
        s.reject("connection has no client slot");
        return;
    }

    // Both transports now enter the protocol at the same point. The Connection is
    // built on this stack because the two things it wraps are per frame here --
    // WsTransport holds this call's httpd_req_t, AuthGate holds this connection's
    // slot -- while the state that has to outlive the frame, the channel table,
    // lives in the slot itself.
    //
    // The gate decides what may run before this connection has authenticated, and
    // lends its auth state to the `auth` handlers. No handshake parsing here any more
    // — the handshake is three ordinary commands.
    WsTransport link(req, sendMutex_);
    AuthGate gate(*conn, *auth_);

    protocol::Connection<CommandManager, AuthGate> connection(
        conn->channels, link, *commandManager_, gate,
        channelFrame_, CHANNEL_WINDOW,
        channelInbound_, sizeof(channelInbound_));
    connection.OnFrame(sid, flags, payload, plen);
}
