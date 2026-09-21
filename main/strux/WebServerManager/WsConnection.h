#pragma once
#include "ChannelTable.h"
#include "ResumeTokens.h"
#include <cstdint>
#include <cstring>

// One live WebSocket connection's state. Value/state object — no I/O.
struct WsConnection {
    int      fd = 0;                                 // 0 = empty slot
    bool     authed = false;
    char     key[ResumeTokens::TOKEN_LEN] = {};      // channel key once authed
    int64_t  connectedAt = 0;

    // Channel state for this browser's Connection. Per connection, unlike the
    // frame buffers in WebSocketHandler, which are per httpd TASK -- four
    // sockets share those because httpd serves them one at a time.
    ChannelTable channels;

    // Where this browser has got to in the console ring. Set to the tip when the
    // slot is claimed, so a connecting tab gets live output and not a replay --
    // history is what `log list` is for.
    uint32_t logCursor = 0;

    bool active() const { return fd != 0; }
    int64_t age(int64_t now) const { return now - connectedAt; }
    void authenticate(const char* k)
    {
        authed = true;
        strlcpy(key, k ? k : "", sizeof(key));
    }
    void reset()
    {
        fd = 0; authed = false; key[0] = 0; connectedAt = 0; logCursor = 0;
        channels.Reset();
    }
};
