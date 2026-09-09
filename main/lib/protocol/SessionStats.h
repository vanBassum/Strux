#pragma once

#include <atomic>
#include <cstdint>

// TEMPORARY DIAGNOSTIC — counters, not logging.
//
// Why counters and not prints: printing on the command path suppressed the very
// failure we are chasing (6/6 succeeded with esp_rom_printf tracing in place, ~1/3
// failed without it), and printing to esp_log on the relay interface pushes bytes
// down the same socket that carries the reply. A counter is one relaxed atomic add
// and cannot reorder the transport. The numbers are read off the hot path, on a
// slow timer, straight to the UART.
//
// One block per interface, because the question is where the LAN path and the relay
// path diverge. Every stage that can end a request lives here exactly once, so a
// request that vanished can be placed: it either never arrived, arrived without a
// slot, was refused before dispatch, dispatched and never came back, produced an
// empty reply, or was handed to a socket that refused it.
namespace session_stats
{
    using C = std::atomic<uint32_t>;

    struct Counters
    {
        // A constructor, not aggregate initialization: -Werror=missing-field-initializers
        // would demand every counter be spelled out at the two definitions below.
        explicit Counters(const char* n) : name(n) {}

        const char* name;

        // ── transport: did the request arrive at all
        C accepted{0};       // WS upgrade accepted (a client slot was allocated)
        C refused{0};        // upgrade refused — registry full
        C recvFail{0};       // inbound recv returned non-OK
        C frameData{0};      // a session chunk was handed to the frame handler
        C frameShort{0};     // frame shorter than a session header — ignored
        C frameOther{0};     // TEXT/PING/CLOSE — not a request
        C frameSkipped{0};   // residue of an abandoned body, swallowed by id

        // ── connection: did it have somewhere to belong
        C noSlot{0};         // live socket, no registry slot

        // ── protocol: was it refused before the handler
        C routeBad{0};       // no "<category> <command>" in the envelope
        C authReject{0};     // the gate refused the category

        // ── dispatch: did the handler run and return
        C dispatchIn{0};
        C dispatchOut{0};
        C dispatchErr{0};    // returned RequestError != Ok

        // ── reply: was anything produced, and did the socket take it
        C replyEmpty{0};     // session closed having written zero payload bytes
        C sendOk{0};         // a chunk was handed to the socket
        C sendFail{0};       // SendRaw returned false
        C finalOk{0};        // the FINAL chunk was handed to the socket
        C finalFail{0};      // the FINAL chunk could not be sent

        // ── stream: a request that broke mid-body
        C readFail{0};       // RecvChunk failed or answered with the wrong session
    };

    inline Counters ws    { "ws" };
    inline Counters relay { "relay" };

    // Radio, so the transport question and the radio question are answered from one
    // line. We doubted the radio; a count of association losses beside the request
    // counters says whether the two move together.
    inline C netDisconnects;
    inline std::atomic<int> netLastReason;

    inline void bump(C& c) { c.fetch_add(1, std::memory_order_relaxed); }

    /// Start the periodic UART dump. Called once, from WebServerManager::Init.
    void StartDump();
}

// Null-safe, because Session is handed the block by its transport and a Session
// built without one (a test, a future transport) must still work.
#define SSTAT(ptr, field) do { if (ptr) session_stats::bump((ptr)->field); } while (0)
