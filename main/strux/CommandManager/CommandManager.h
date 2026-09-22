#pragma once

#include "StruxProvider.h"
#include "InitState.h"
#include "CommandEntry.h"
#include "RecursiveMutex.h"
#include "ContextLock.h"
#include <cstring>
#include <cassert>
#include <cstddef>
#include <initializer_list>

class Stream;
class EnvelopeLine;

// Pure dispatcher — knows no other managers, and no commands but the
// registry's own (`help`, which is the registry describing itself and
// could not live anywhere else). Every other command lives in the
// manager that owns its domain and is registered from that manager's
// Init().
//
// Deliberately knows nothing about channels, transports or the wire format: give
// it a command name and two streams and it runs the handler. That is what keeps it
// the one piece of the request path that can be reasoned about on its own.
//
// Naming a request from its envelope is the protocol layer's job — see
// protocol::RunCommandChannel, which every transport calls.
class CommandManager {
    static constexpr const char* TAG = "CommandManager";

public:
    explicit CommandManager(StruxProvider& strux);

    CommandManager(const CommandManager&) = delete;
    CommandManager& operator=(const CommandManager&) = delete;
    CommandManager(CommandManager&&) = delete;
    CommandManager& operator=(CommandManager&&) = delete;

    void Init();

    /// Register this manager's commands. Each one is an object the manager owns
    /// and names; nothing is generated, nothing registers itself, and the list is
    /// the manager saying which of its commands exist:
    ///
    ///     strux_.getCommandManager().Register(this, { &pingCommand_, &infoCommand_ });
    ///
    /// Every entry MUST have static storage duration (see ~CommandEntry). `ctx` is
    /// the owner's `this`, stamped into each entry and handed back to its handler at
    /// dispatch — it cannot come from the entry itself, because an entry is
    /// initialised before any manager exists.
    ///
    /// Thread-safe, and usable from construction — managers whose Init()
    /// runs before CommandManager's may register safely.
    void Register(void* ctx, std::initializer_list<CommandEntry*> commands)
    {
        LOCK(mutex_);
        for (CommandEntry* c : commands)
        {
            // Re-registering would re-link an entry already in the chain
            // and cycle it → Execute() would hang. Chain-corruption class,
            // so FATAL (survives NDEBUG), not assert.
            if (c->registered)
                FATAL("command '%s' registered twice", c->name);
            assert(Find(c->name) == nullptr && "duplicate command name");
            // The declaration list is null-terminated and the last slot is the
            // terminator's. A list that fills it would be walked off the end.
            if (c->args[MAX_COMMAND_ARGS] != nullptr)
                FATAL("command '%s' declares more than %d arguments",
                      c->name, (int)MAX_COMMAND_ARGS);

            c->ctx = ctx;
            c->registered = true;
            c->next = head_;
            head_ = c;
        }
    }

    /// Run the command the envelope names. `in` is positioned at the request body
    /// (empty for most commands) and the handler writes its reply to `out`.
    ///
    /// The envelope arrives already read — the interface built it, because reading it
    /// is what leaves `in` at the body — and is asked to decode this command's
    /// declared arguments. Nothing here names a wire format.
    ///
    /// Returns Ok, UnknownCommand, or whatever the decode reported. `failedArg` (when
    /// non-null) receives the argument name a failure was about, so the caller can
    /// compose the refusal text.
    CommandResult Execute(EnvelopeLine& envelope, Stream& in, Stream& out,
                          ConnectionAuth* connection = nullptr,
                          const char** failedArg = nullptr);

private:
    StruxProvider& strux_;
    InitState initState_;

    RecursiveMutex mutex_;
    CommandEntry* head_ = nullptr;

    // Locks internally (recursive, so Register may call it under its own
    // lock). Handing the pointer out after unlock is safe because entries
    // are immortal and name/handler/ctx are written before linking.
    const CommandEntry* Find(const char* name);

    /// The command `help` addresses as two words. It exists because `help list` takes
    /// a category and a command separately and always has; a route is joined here
    /// rather than in a buffer.
    const CommandEntry* FindInCategory(const char* category, const char* command);

    // ── help: the registry describing itself ──────────────────
    //
    // Nothing here is a second copy of anything. The categories and names come off
    // the chain; a command's arguments come off its own entry, where the handler
    // reads them from. So help cannot go stale — there is nothing to update, and
    // nothing is executed to find out.
    //
    //     help list                                    → every category and its commands
    //     help list -category partition                → one category's commands
    //     help list -category partition -command write → that command's arguments
    CommandResult Cmd_Help(CommandContext& ctx);

    // ── help describe: the whole registry, in one reply ───────
    //
    // What `help list` gives a human exploring, given instead to something that has
    // to compose a call without asking again: every category, every command, its
    // one-line description and its full argument declarations, in one round trip.
    //
    // The same facts as walking `help list` N+1 times, and deliberately the same
    // MECHANISM — the chain for the routes, each entry for its arguments — so there
    // is still nothing to keep in step. What it saves is a round trip per
    // command, which over a relay pipe is the difference between describing a device
    // once and describing it twenty times.
    CommandResult Cmd_Describe(CommandContext& ctx);

    static constexpr size_t MAX_CATEGORIES = 24;

    void ListCategories(ReplyWriter& reply);
    void ListCategory(const char* category, ReplyWriter& reply);
    CommandResult DescribeCommand(const char* category, const char* command,
                                  ReplyWriter& reply);

    /// Writes one command's declared arguments into `args`, straight off its entry.
    void DescribeArguments(const CommandEntry& entry, ReplyArray& args);

    /// Collects one command name per distinct category into `out` — the NAME, because
    /// a category is its first word and is not a string of its own anywhere. Caller
    /// holds the mutex. Returns how many were found; `truncated` says the chain had
    /// more than MAX_CATEGORIES of them.
    size_t CollectCategories(const char** out, size_t cap, bool& truncated);

    // Defined in CommandManager.cpp, beside the handlers and the arguments they read.
    static CommandEntry listCommand_;
    static CommandEntry describeCommand_;
};
