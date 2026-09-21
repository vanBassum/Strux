#pragma once

#include "Mutex.h"
#include "Transport.h"
#include "ChannelProtocol.h"
#include <esp_http_server.h>
#include <cstdint>
#include <cstddef>

// ESP-IDF internal (declared in the private esp_httpd_priv.h, NOT the public
// esp_http_server.h): parses the next WS frame's first byte (FIN + opcode) into
// req->aux, which httpd_ws_recv_frame then consumes. httpd's own loop calls it
// once per handler invocation before dispatch, so to read frames *beyond* the
// first within a single handler call we must call it ourselves. This is a
// deliberate, documented wart — the price of draining an inbound stream on the
// httpd task without a worker. A future IDF dropping the symbol fails as a clean
// link error, not silent breakage.
extern "C" esp_err_t httpd_ws_get_frame_type(httpd_req_t* req);

// Transport link for the local browser WebSocket (one of two Transport
// implementations — see Transport.h). Outbound: sends one already-framed
// channel chunk ([channel|flags|payload], assembled by Channel) as one WS binary
// frame. Inbound: pulls the NEXT WS binary frame off the socket (RecvChunk), so a
// streamed request body — arriving as several channel chunks that share one id —
// can be drained within a single httpd handler call. The shared send mutex
// serializes whole outbound frames so the log pump can't split a reply.
class WsTransport : public Transport
{
    static constexpr const char* TAG = "WsTransport";   // referenced by the LOCK macro

    httpd_req_t* req_;
    Mutex& sendMutex_;

public:
    WsTransport(httpd_req_t* req, Mutex& sendMutex) : req_(req), sendMutex_(sendMutex) {}

    // `frame` is [channel|flags|payload]; `len` is the total (header + payload).
    bool SendRaw(const uint8_t* frame, size_t len) override
    {
        httpd_ws_frame_t f = {};
        f.type = HTTPD_WS_TYPE_BINARY;
        f.payload = const_cast<uint8_t*>(frame);
        f.len = len;

        LOCK(sendMutex_);
        return httpd_ws_send_frame(req_, &f) == ESP_OK;
    }

    // Receive the next inbound WS frame into `buf` (capacity `cap`) as a channel
    // chunk. On success returns the payload length (>= 0), fills *sid / *flags
    // from the 3-byte header, and leaves the payload at buf + HEADER_LEN.
    // Returns -1 on error, an over-long frame, or a non-data frame (CLOSE/PING) —
    // the caller treats -1 as end-of-stream.
    int RecvChunk(uint8_t* buf, size_t cap, uint16_t* sid, uint8_t* flags) override
    {
        if (httpd_ws_get_frame_type(req_) != ESP_OK) return -1;

        httpd_ws_frame_t f = {};                       // len==0 → header-only read
        if (httpd_ws_recv_frame(req_, &f, 0) != ESP_OK) return -1;

        if (f.type != HTTPD_WS_TYPE_BINARY && f.type != HTTPD_WS_TYPE_CONTINUE)
            return -1;                                 // CLOSE/PING/TEXT → end of stream
        if (f.len < channel::HEADER_LEN || f.len > cap) return -1;

        f.payload = buf;
        if (httpd_ws_recv_frame(req_, &f, cap) != ESP_OK) return -1;

        *sid   = channel::readU16(buf);
        *flags = buf[2];
        return static_cast<int>(f.len - channel::HEADER_LEN);
    }
};

// The same wire, addressed by fd instead of by request.
//
// WsTransport wraps the httpd_req_t of the call it was built in, which is what a
// handler has. The log pump has no request -- it runs on its own task and walks
// the connection registry -- so it addresses each socket the way httpd allows from
// outside a handler, with the async send. Receiving is not part of this: the pump
// only ever pushes.
class WsPumpTransport : public Transport
{
    static constexpr const char* TAG = "WsPumpTransport";

    httpd_handle_t server_;
    int fd_;
    IMutex& sendMutex_;

public:
    WsPumpTransport(httpd_handle_t server, int fd, IMutex& sendMutex)
        : server_(server), fd_(fd), sendMutex_(sendMutex) {}

    bool SendRaw(const uint8_t* frame, size_t len) override
    {
        httpd_ws_frame_t f = {};
        f.type = HTTPD_WS_TYPE_BINARY;
        f.payload = const_cast<uint8_t*>(frame);
        f.len = len;

        LOCK(sendMutex_);
        return httpd_ws_send_frame_async(server_, fd_, &f) == ESP_OK;
    }

    int RecvChunk(uint8_t*, size_t, uint16_t*, uint8_t*) override
    {
        return -1;   // push only
    }
};
