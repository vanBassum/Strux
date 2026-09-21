#pragma once

#include <cstdint>

// What a Connection remembers between frames: which channel ids it knows and what
// each one is doing. This is protocol STATE, not an execution context -- there is
// no task here, no queue and no buffer. A Connection still runs exactly one
// operation at a time (see Connection.h); the table is what lets it tell an
// arriving frame apart from the one it is currently serving.
//
// It replaces RelayManager's `skipping_`/`skipSid_` pair, which was the same idea
// with room for one id: after a handler returned without draining its request, the
// rest of that body is still on its way, and read as a fresh frame it would be
// taken for a request header -- a command invented out of firmware bytes. The
// local WebSocket never grew that workaround, which is why it had that bug and the
// relay did not. One table, both transports, and the special case disappears.
//
// Deliberately tiny and fixed. Four entries covers one active channel plus the
// residue of channels that ended early, which is the most this can hold while a
// Connection serves one operation at a time.
class ChannelTable
{
public:
    static constexpr int MAX = 4;

    enum class State : uint8_t
    {
        // The slot holds nothing.
        Free,
        // Being served right now: a handler is reading its request or writing its
        // reply. At most one of these exists per Connection in v1.
        Active,
        // Our side is finished but the peer's is not, so more of its request is
        // still arriving. Every chunk is discarded until one carries FINAL, which
        // frees the slot. This is what stops residue being read as a new request.
        Draining,
    };

    struct Entry
    {
        uint16_t id = 0;
        State    state = State::Free;
    };

    /// The entry for `id`, or nullptr when this Connection knows nothing about it.
    Entry* Find(uint16_t id)
    {
        for (auto& e : entries_)
            if (e.state != State::Free && e.id == id) return &e;
        return nullptr;
    }

    /// Take a slot for `id` and mark it Active. Null when the table is full, which
    /// the caller reports to the peer rather than silently dropping.
    ///
    /// A Draining slot is reused when no free one is left, and that is not a
    /// fallback so much as the thing that keeps this bounded: a peer that abandons
    /// a request mid-body and then goes away -- a browser tab closed during an
    /// upload -- leaves a slot waiting for a FINAL that is never coming. Nothing
    /// else would ever free it. Reusing it costs at most one misparsed residue
    /// frame, which is exactly what happened before this table existed, so the
    /// worst case is today's behaviour rather than a connection that refuses
    /// everything.
    Entry* Open(uint16_t id)
    {
        Entry* reusable = nullptr;
        for (auto& e : entries_)
        {
            if (e.state == State::Free)
            {
                e.id = id;
                e.state = State::Active;
                return &e;
            }
            if (e.state == State::Draining && !reusable) reusable = &e;
        }

        if (reusable)
        {
            reusable->id = id;
            reusable->state = State::Active;
        }
        return reusable;
    }

    /// The handler returned before reading its whole request. Keep the id so the
    /// rest of the body is recognised and thrown away instead of dispatched.
    void Drain(uint16_t id)
    {
        if (Entry* e = Find(id)) e->state = State::Draining;
    }

    void Close(uint16_t id)
    {
        if (Entry* e = Find(id)) e->state = State::Free;
    }

    /// Is a handler running? Only meaningful from inside one -- at the top of the
    /// read loop this is always false, because the loop is where a handler would
    /// have to return to.
    bool Busy() const
    {
        for (const auto& e : entries_)
            if (e.state == State::Active) return true;
        return false;
    }

    /// A fresh transport connection knows no channels. Called when a pipe comes up,
    /// because ids from the old one mean nothing on the new one.
    void Reset()
    {
        for (auto& e : entries_) e = Entry{};
    }

private:
    Entry entries_[MAX];
};
