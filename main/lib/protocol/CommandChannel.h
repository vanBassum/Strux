#pragma once

#include "Channel.h"
#include "CommandContext.h"
#include "EnvelopeLine.h"

// The sequence that runs one opened channel against a dispatcher. This is protocol,
// not dispatch: reading the request's envelope and deciding what a malformed one is
// called is the wire format's business, and the dispatcher never sees a Channel.
//
// A request is a single '\n'-terminated line of JSON; the body — if any — is
// whatever bytes follow it in the same channel:
//
//     {"type":"partition write","partition":"ota_1"}\n<firmware bytes…>
//
// The line is read ONCE, by the EnvelopeLine built here, which both names the
// command and later decodes its arguments. It used to be peeked by a router, copied,
// split into two words, and then read again by the handler's own argument reader.
namespace protocol
{
    /// Run one opened channel: name it, dispatch it, close or refuse the reply.
    ///
    /// `dispatcher` is duck-typed on
    /// `CommandResult Execute(EnvelopeLine&, Stream&, Stream&, ConnectionAuth*, const char**)`
    /// — a template rather than an interface so the protocol layer never depends
    /// upward on the dispatcher, and no callback inversion comes back.
    /// `gate` is duck-typed on `bool Allows(const char* command) const` plus
    /// `ConnectionAuth&`-conversion — the transport decides what may run before a
    /// connection has authenticated, and lends the auth state to the handlers that
    /// need it. Checked AFTER the envelope is read, because the decision is about
    /// which command was asked for.
    template <class Dispatcher, class Gate>
    void RunCommandChannel(Channel& channel, Dispatcher& dispatcher, Gate& gate)
    {
        EnvelopeLine envelope(channel);

        if (envelope.command()[0] == '\0')
        {
            // Say WHICH fault this is. An envelope with no room left for its newline
            // is a length problem, not a routing one, and the two used to be
            // indistinguishable because the router only ever saw its own buffer.
            if (envelope.overflowed())
                channel.reject("envelope too long: it must be one line under "
                               "512 bytes, and the body goes AFTER the newline");
            else
                channel.reject("expected: <category> <command>");
            return;
        }

        if (!gate.Allows(envelope.command()))
        {
            channel.reject("unauthorized");
            return;
        }

        // in == out: the handler reads any body from the same channel it writes its
        // reply to.
        const char* failedArg = nullptr;
        const CommandResult err =
            dispatcher.Execute(envelope, channel, channel, &gate, &failedArg);
        if (err != CommandResult::Ok)
        {
            // Form failures refuse the request. REJECT ends the channel like FINAL
            // does, so this composes with anything the handler already wrote — a
            // refusal can always be last.
            char buf[96];
            channel.reject(DescribeCommandResult(err, failedArg, buf, sizeof(buf)));
            return;
        }

        channel.finish();   // FINAL — end of reply
    }
}
