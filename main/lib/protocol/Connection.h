#pragma once

#include "Channel.h"
#include "ChannelTable.h"
#include "ChannelProtocol.h"
#include "CommandEnvelope.h"
#include "Transport.h"

#include <cstddef>
#include <cstdint>
#include <cstring>

namespace protocol
{

// One frame's worth of connection-level decision making, shared by both
// transports. It is constructed per frame, on the caller's stack, because the two
// things it needs -- the Transport and the auth Gate -- are themselves per frame
// on the local WebSocket: WsTransport wraps the httpd_req_t of this call, and
// AuthGate wraps the connection slot it belongs to.
//
// What PERSISTS is the ChannelTable, which the transport owns and passes in by
// reference: WsConnection holds one per browser, RelayManager holds one for its
// pipe. So channel state is per Connection while the large frame buffers stay per
// TASK, which is the only split that fits both transports -- the relay has one
// connection on its own task, and esp_http_server serves up to four browser
// sockets from one.
//
// This class is deliberately not an execution context. There is no task here, no
// queue and no scheduler: a Connection serves one operation at a time, and a
// long upload will hold it. That is v1's accepted limitation. What the table buys
// is not concurrency but the ability to say something sensible about a frame that
// is not the one being served.
template <class Dispatcher, class Gate>
class Connection final : public ForeignFrameSink
{
public:
    Connection(ChannelTable& table, Transport& link,
               Dispatcher& dispatcher, Gate& gate,
               uint8_t* outBuf, size_t outCap,
               uint8_t* inBuf, size_t inCap)
        : table_(table), link_(link), dispatcher_(dispatcher), gate_(gate),
          outBuf_(outBuf), outCap_(outCap), inBuf_(inBuf), inCap_(inCap) {}

    /// One frame off the wire, at the top of the transport's read loop. Nothing is
    /// executing yet at this point -- a handler that were running would be the
    /// thing holding the read, and its frames arrive through OnForeignFrame below.
    void OnFrame(uint16_t id, uint8_t flags, const uint8_t* payload, size_t len)
    {
        const bool final = (flags & channel::FLAG_FINAL) != 0;

        if (ChannelTable::Entry* e = table_.Find(id))
        {
            if (e->state == ChannelTable::State::Draining)
            {
                // The tail of a request whose handler already returned. Discarding
                // it IS the handling; read as a fresh frame it would be taken for
                // a request header.
                if (final)
                {
                    table_.Close(id);
                    ESP_LOGW(TAG, "channel %u: discarded the rest of an abandoned "
                                  "request", static_cast<unsigned>(id));
                }
                return;
            }

            // Active, at the top of the read loop, is a contradiction: the handler
            // owning it would have to have returned to get here. A peer that
            // reuses a live id is the only way to see this.
            Refuse(id, "channel already active");
            return;
        }

        ChannelTable::Entry* e = table_.Open(id);
        if (!e)
        {
            Refuse(id, "too many channels");
            return;
        }

        Channel ch(id, link_, outBuf_, outCap_, inBuf_, inCap_, this);
        ch.feedRequest(payload, len, final);
        protocol::RunCommandChannel(ch, dispatcher_, gate_);

        // Returned without reaching FINAL -- a refusal, or a handler that read less
        // than was sent. The rest is still coming, so remember the id until it does.
        if (!ch.requestEnded() && !ch.failed())
            table_.Drain(id);
        else
            table_.Close(id);
    }

private:
    static constexpr const char* TAG = "Connection";

    /// A frame for another channel, arriving while a handler holds the transport.
    ///
    /// This runs INSIDE that handler, so it must not dispatch anything -- the one
    /// execution context is already in use. It can only update the table and tell
    /// the peer what it could not do, which is exactly the set of answers v1 owes:
    /// swallow residue, refuse everything else as busy.
    void OnForeignFrame(uint16_t id, uint8_t flags,
                        const uint8_t* payload, size_t len) override
    {
        (void)payload;
        (void)len;

        if (ChannelTable::Entry* e = table_.Find(id))
        {
            if (e->state == ChannelTable::State::Draining)
            {
                if (flags & channel::FLAG_FINAL) table_.Close(id);
                return;
            }
        }

        // A request we cannot start, because the one we are serving has the
        // connection. Refusing says so at the caller instead of leaving it to time
        // out, and the reason is a fixed string on purpose: a peer that later
        // learns to retry has to be able to tell "busy" from a handler's own error.
        Refuse(id, "busy");
    }

    /// One REJECT frame, framed on this stack rather than in outBuf_ -- that buffer
    /// belongs to the channel currently being served and may hold half a reply.
    /// Safe to interleave because a Transport send is one whole frame.
    void Refuse(uint16_t id, const char* reason)
    {
        uint8_t frame[channel::HEADER_LEN + 48];
        const size_t cap = sizeof(frame) - channel::HEADER_LEN;
        size_t n = strlen(reason);
        if (n > cap) n = cap;

        channel::writeHeader(frame, id, channel::FLAG_REJECT);
        memcpy(frame + channel::HEADER_LEN, reason, n);
        link_.SendRaw(frame, channel::HEADER_LEN + n);

        ESP_LOGD(TAG, "channel %u refused: %s", static_cast<unsigned>(id), reason);
    }

    ChannelTable& table_;
    Transport&    link_;
    Dispatcher&   dispatcher_;
    Gate&         gate_;
    uint8_t*      outBuf_;
    size_t        outCap_;
    uint8_t*      inBuf_;
    size_t        inCap_;
};

}   // namespace protocol
