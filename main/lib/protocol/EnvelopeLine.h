#pragma once

#include "CommandContext.h"   // protocol::MAX_ENVELOPE
#include "Stream.h"

// The request envelope, taken off the stream and kept for the length of one dispatch.
//
// Consuming it is the point: a request is one '\n'-terminated line of JSON followed
// by whatever bytes the command's body is, so reading the line here is what leaves
// the stream at the first body byte. A body is therefore never buffered and never
// bounded — it is simply what is left.
//
// The LINE is buffered, about 512 bytes of dispatch stack, and handed out mutable.
// DecodeJsonArgs unescapes string values where they already lie, so a decoded
// argument points in here rather than into a copy of itself; that is why this object
// has to outlive the decode rather than being a temporary inside it.
//
// It used to be JsonArgReader, which read the line AND filled a handler's arguments
// one lookup at a time. Commands declare their arguments now (CommandArgs.h), so the
// reading half went with the mechanism that needed it and what remains is the line.
class EnvelopeLine
{
public:
    /// Consumes the envelope line, leaving `in` positioned at the body.
    explicit EnvelopeLine(Stream& in)
    {
        size_t i = 0;
        char c;
        while (i < sizeof(line_) - 1 && in.read(&c, 1) == 1)
        {
            if (c == '\n') break;
            line_[i++] = c;
        }
        line_[i] = '\0';
    }

    EnvelopeLine(const EnvelopeLine&) = delete;
    EnvelopeLine& operator=(const EnvelopeLine&) = delete;

    /// The line, NUL-terminated and without its newline. Mutable because the decoder
    /// rewrites string values in place.
    char* text() { return line_; }

private:
    char line_[protocol::MAX_ENVELOPE] = {};
};
