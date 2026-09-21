#pragma once

#include <esp_http_server.h>
#include "Mutex.h"
#include "ResumeTokens.h"
#include "CommandEnvelope.h"
#include "ConnectionRegistry.h"

class CommandManager;
class Authenticator;
class ConsoleManager;

class WebSocketHandler {
    static constexpr const char* TAG = "WebSocketHandler";

public:
    void SetCommandManager(CommandManager& commandManager);
    void SetAuth(Authenticator& auth);
    void SetConsole(ConsoleManager& console);

    void RegisterRoute(httpd_handle_t server);

    /// Ship whatever each authenticated browser has not seen yet, from the console
    /// ring straight to its socket. Called by WebServerManager's pump task.
    ///
    /// The LAN transport has no task of its own -- esp_http_server calls into this
    /// class only when a frame arrives -- so something has to drive the drain, and
    /// that is the one place the relay and this differ. The relay drains inside its
    /// own read loop; here a pump walks the slots.
    void PumpLogs(httpd_handle_t server, ConsoleManager& console);

    void OnClientDisconnected(int fd);

private:
    // The channel sink: CommandManager dispatches, this transport only frames.
    CommandManager* commandManager_ = nullptr;
    Authenticator* auth_ = nullptr;
    ConsoleManager* console_ = nullptr;

    // Serializes ALL outgoing frame writes. The log pump runs on its own task
    // while command replies are written by the httpd task - unserialized, their
    // bytes interleave on the socket and corrupt the WS framing (the client sees
    // "Invalid frame header"). This is the one send mutex that stays: the relay's
    // went away when producers stopped writing its socket, but here two tasks
    // genuinely share these.
    Mutex sendMutex_;

    // Per-connection auth state (replaces the ?token= upgrade check). authed is
    // set by the in-band login/auth handshake (see AuthGate), or at connect
    // when web.password is empty. WsConnection::key holds the channel key once
    // authed, so TouchClient can keep it alive in the ResumeTokens for
    // reconnect-resume. registry_ owns the fixed slot table and the pre-auth
    // reaper (see ConnectionRegistry).
    ConnectionRegistry registry_;

    void TouchClient(int fd);

    /// False when the client table is full (after reaping stale un-authed slots).
    bool AddWsClient(httpd_req_t* req, ConsoleManager& console);

    // Channel reply flush window (off the httpd-task stack; reused, single
    // channel at a time). NOT payload-proportional — a small batch buffer that
    // amortizes JsonWriter's tiny writes into WS frames; a reply of any size
    // streams out window-by-window. Layout: [ 3-byte chunk header | payload ].
    static constexpr size_t CHANNEL_WINDOW = 512;
    uint8_t channelFrame_[channel::HEADER_LEN + CHANNEL_WINDOW];

    // Inbound window for streamed request bodies: read() pulls continuation
    // channel chunks into here, so each body chunk's payload may be up to
    // INBOUND_WINDOW bytes (the frontend sizes upload chunks to match).
    static constexpr size_t INBOUND_WINDOW = 4096;
    uint8_t channelInbound_[channel::HEADER_LEN + INBOUND_WINDOW];

    // The FIRST frame of a request lands here, and it is a member for the same
    // reason channelInbound_ is: INBOUND_WINDOW does not belong on the httpd
    // task's stack. It used to be a 512-byte local, which quietly made the
    // inbound window 511 bytes for the one frame that carries the envelope -
    // httpd_ws_recv_frame fails on a larger frame and the client is dropped,
    // looking from the outside like the device resetting the connection. The
    // frontend has always sized its upload chunks to INBOUND_WINDOW, so the
    // two disagreed by a factor of eight.
    //
    // Safe as one buffer because esp_http_server serves every socket from a
    // single task: one frame is in flight at a time. It is distinct from
    // channelInbound_ because both are live at once - Channel keeps a pointer
    // into this one while pulling continuations into that one.
    //
    // Sized HEADER_LEN + INBOUND_WINDOW + 1, and every term is load-bearing. A
    // frame is a header AND a payload, so sizing it INBOUND_WINDOW alone makes
    // the payload window HEADER_LEN short - which is the original bug again,
    // just four bytes wide instead of 3584, and it drops the client the same
    // way. The +1 is for the byte httpd_ws_recv_frame is handed one less than
    // (the room a text frame's NUL would need), so that a full-window binary
    // chunk still fits. channelInbound_ needs no +1 because RecvChunk passes
    // the whole size.
    uint8_t inboundFrame_[channel::HEADER_LEN + INBOUND_WINDOW + 1];

    void RemoveWsClient(int fd);

    static esp_err_t HandleWs(httpd_req_t* req);

    // Binary channel transport. A request is one binary chunk; the reply
    // streams back as chunks on the same channel id. The pre-auth handshake
    // verbs (hello/login/auth) and the authed/not routing decision are
    // delegated to AuthGate, constructed locally per frame (it only holds an
    // Authenticator&, so this is cheap) — see AuthGate.h.
    void HandleBinary(httpd_req_t* req, const uint8_t* frame, size_t len);
};
