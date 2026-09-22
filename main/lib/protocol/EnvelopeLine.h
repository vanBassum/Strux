#pragma once

#include "CommandArgs.h"
#include "JsonHelpers.h"
#include "Stream.h"

namespace protocol
{
    // The envelope line, bounding the request but NOT the body - bodies stream.
    //
    // ONE constant, because there used to be two. The router had 128 and the
    // argument reader had 512, so a command could declare arguments that made an
    // envelope it could never be routed with: the router copied only its own
    // buffer's worth before looking for "type", and an envelope whose "type" landed
    // past byte 127 was refused with "expected: <category> <command>" - a message
    // about the route, for a fault in the length. Six ordinary arguments were enough
    // to cross it. There is now one buffer, read once.
    inline constexpr size_t MAX_ENVELOPE = 512;

    // Command names are short by convention; a longer one simply won't match.
    inline constexpr size_t MAX_COMMAND_NAME = 32;
}

// The request envelope: the line that names a command and carries its arguments.
//
// Consuming it is half the point. A request is one '\n'-terminated line of JSON
// followed by whatever bytes the command's body is, so reading the line here is what
// leaves the stream at the first body byte. A body is therefore never buffered and
// never bounded - it is simply what is left.
//
// The LINE is buffered, about 512 bytes of dispatch stack, and it is read ONCE: the
// command's name comes out of it, and so do the command's arguments, both without a
// second pass over the stream and without a second copy of the line. Decoded string
// arguments point into this buffer, unescaped where they lie, which is why this
// object has to outlive the decode rather than being a temporary inside it.
//
// This is the one place that knows the request is JSON. The dispatcher above asks it
// for a name and for a decode against a command's declarations, and would ask exactly
// the same of an envelope in another encoding.
class EnvelopeLine
{
public:
    /// Consumes the envelope line, leaving `in` positioned at the body.
    explicit EnvelopeLine(Stream& in)
    {
        size_t i = 0;
        char c;
        while (i < sizeof(line_) - 1)
        {
            if (in.read(&c, 1) != 1) { overflowed_ = false; break; }   // stream ended
            if (c == '\n')           { overflowed_ = false; break; }
            line_[i++] = c;
        }
        line_[i] = '\0';

        // Absent or unparseable leaves this empty, which is how the caller tells a
        // request it cannot route from one it can.
        ExtractJsonString(line_, "type", command_, sizeof(command_));
    }

    EnvelopeLine(const EnvelopeLine&) = delete;
    EnvelopeLine& operator=(const EnvelopeLine&) = delete;

    /// The command this request names, exactly as the wire carries it
    /// ("partition write"), or "" when the envelope names none.
    const char* command() const { return command_; }

    /// True when the line filled the buffer without ever reaching its newline. That
    /// is a different fault from a well-formed envelope with no "type" in it, and
    /// saying which is which is worth the flag: reporting the route when the fault
    /// was the size cost an afternoon once.
    bool overflowed() const { return overflowed_; }

    /// Fill `values` from this envelope, against the command's declarations.
    /// `failed` names the argument a failure was about.
    CommandResult decode(const ArgDesc* const* args, ArgValues& values,
                         const char*& failed)
    {
        return DecodeJsonArgs(line_, args, values, failed);
    }

private:
    char line_[protocol::MAX_ENVELOPE] = {};
    char command_[protocol::MAX_COMMAND_NAME] = {};
    bool overflowed_ = true;   // until the read proves otherwise
};
