#include "CommandManager.h"
#include "EnvelopeLine.h"
#include "JsonReplyWriter.h"
#include "Stream.h"
#include "esp_log.h"
#include <cstdio>
#include <cstring>

CommandManager::CommandManager(StruxProvider& strux)
    : strux_(strux)
{
}

void CommandManager::Init()
{
    auto initAttempt = initState_.TryBeginInit();
    if (!initAttempt)
    {
        ESP_LOGW(TAG, "Already initialized or initializing");
        return;
    }

    Register(this, { &listCommand_, &describeCommand_ });

    initAttempt.SetReady();
    ESP_LOGI(TAG, "Initialized");
}

CommandResult CommandManager::Execute(EnvelopeLine& envelope, Stream& in, Stream& out,
                                      ConnectionAuth* connection,
                                      const char** failedArg)
{
    const CommandEntry* e = Find(envelope.command());
    if (e == nullptr)
        return CommandResult::UnknownCommand;

    // Handler runs OUTSIDE the lock: entries are immortal, so the pointer
    // stays valid, and a handler may register commands or dispatch nested
    // commands without deadlocking.
    //
    // Arguments are decoded before the handler runs, which is why a handler has no
    // prologue and receives them already validated. A command that declares none
    // skips the decode entirely — there is nothing for it to look for.
    ArgValues values;
    if (e->args[0] != nullptr)
    {
        const char* failed = nullptr;
        const CommandResult err = envelope.decode(e->args, values, failed);
        if (err != CommandResult::Ok)
        {
            if (failedArg) *failedArg = failed;
            return err;
        }
    }

    JsonReplyWriter writer(out);
    CommandContext ctx(writer, in, e->args, values, connection);
    return e->handler(e->ctx, ctx);
}

const char* DescribeCommandResult(CommandResult e, const char* arg, char* buf, size_t cap)
{
    switch (e)   // no default: a new CommandResult must be handled here
    {
    case CommandResult::Ok:              return "ok";
    case CommandResult::UnknownCommand:  return "unknown command";
    case CommandResult::MissingArgument:
        snprintf(buf, cap, "missing required argument: %s", arg ? arg : "?");
        return buf;
    case CommandResult::MalformedRequest:  return "malformed request";
    case CommandResult::MalformedNumber:
        snprintf(buf, cap, "malformed number: %s", arg ? arg : "?");
        return buf;
    case CommandResult::ArgumentTooLong:
        snprintf(buf, cap, "argument too long: %s", arg ? arg : "?");
        return buf;
    }
    return "bad request";
}

// ──────────────────────────────────────────────────────────────
// help
// ──────────────────────────────────────────────────────────────

namespace {

/// A command's category is the first word of its name. Grouping is display, so it is
/// derived where it is shown rather than stored on every command.
size_t CategoryLen(const char* name)
{
    const char* space = strchr(name, ' ');
    return space != nullptr ? static_cast<size_t>(space - name) : strlen(name);
}

bool SameCategory(const char* a, const char* b)
{
    const size_t n = CategoryLen(a);
    return n == CategoryLen(b) && memcmp(a, b, n) == 0;
}

bool InCategory(const char* name, const char* category)
{
    const size_t n = strlen(category);
    return strncmp(name, category, n) == 0 && (name[n] == ' ' || name[n] == '\0');
}

/// What `help` lists as a command's short name. A tail of the full name, so it needs
/// no buffer of its own.
const char* ShortName(const char* name)
{
    const char* space = strchr(name, ' ');
    return space != nullptr ? space + 1 : name;
}

/// The category as a string, for the one place that needs one: a reply field.
void CopyCategory(const char* name, char* out, size_t cap)
{
    size_t n = CategoryLen(name);
    if (n > cap - 1) n = cap - 1;
    memcpy(out, name, n);
    out[n] = '\0';
}

// A command name is the longest either of these can usefully be; one less is the
// length at which a value is refused, which is the number the declarations state.
constexpr uint16_t ROUTE_MAX = protocol::MAX_COMMAND_NAME - 1;

constexpr CommandArg<const char*> listCategoryArg{
    "category", "Limit the answer to one category, e.g. 'partition'. Omit it to list "
                "every category and its commands.",
    ROUTE_MAX, Presence::Optional };

constexpr CommandArg<const char*> listCommandArg{
    "command", "Describe this one command's arguments. Needs 'category' as well, "
               "because a route is two words.",
    ROUTE_MAX, Presence::Optional };

constexpr CommandArg<const char*> describeCategoryArg{
    "category", "Describe only this category's commands. Omit it for the whole "
                "registry, which is the usual call.",
    ROUTE_MAX, Presence::Optional };

} // namespace

CommandEntry CommandManager::listCommand_{
    "help list", &InvokeCommand<&CommandManager::Cmd_Help>,
    "List the device's command categories, one category's commands, or one "
    "command's arguments.",
    { &listCategoryArg, &listCommandArg }
};

CommandEntry CommandManager::describeCommand_{
    "help describe", &InvokeCommand<&CommandManager::Cmd_Describe>,
    "Describe every command this firmware offers - category, name, description "
    "and full argument declarations - in one reply.",
    { &describeCategoryArg }
};

CommandResult CommandManager::Cmd_Help(CommandContext& ctx)
{
    const char* category = ctx.arg(listCategoryArg);
    const char* command  = ctx.arg(listCommandArg);

    if (command[0] != '\0')
        return DescribeCommand(category, command, ctx.reply);

    if (category[0] != '\0')
        ListCategory(category, ctx.reply);
    else
        ListCategories(ctx.reply);

    return CommandResult::Ok;
}

size_t CommandManager::CollectCategories(const char** out, size_t cap, bool& truncated)
{
    // The chain has no notion of a category, so the distinct ones are collected by
    // walking it. Fixed array, and it says so when it fills up rather than quietly
    // answering with part of the registry.
    size_t count = 0;
    truncated = false;

    for (const CommandEntry* e = head_; e != nullptr; e = e->next)
    {
        bool known = false;
        for (size_t i = 0; i < count && !known; ++i)
            known = SameCategory(out[i], e->name);
        if (known) continue;

        if (count == cap) { truncated = true; break; }
        out[count++] = e->name;
    }

    return count;
}

void CommandManager::ListCategories(ReplyWriter& reply)
{
    // Held across the JSON, so a manager registering from another task cannot relink
    // the chain half way through the answer. Safe to write to `out` from under it:
    // nothing acquires this mutex from inside a transport's send path, so there is no
    // pair of locks to take in two orders.
    LOCK(mutex_);

    const char* seen[MAX_CATEGORIES];
    bool truncated = false;
    const size_t count = CollectCategories(seen, MAX_CATEGORIES, truncated);

    auto resp = reply.object();
    resp.field("ok", true);
    {
        auto cats = resp.array("categories");
        for (size_t i = 0; i < count; ++i)
        {
            char category[protocol::MAX_COMMAND_NAME];
            CopyCategory(seen[i], category, sizeof(category));

            auto cat = cats.object();
            cat.field("category", category);
            auto names = cat.array("commands");
            for (const CommandEntry* e = head_; e != nullptr; e = e->next)
                if (InCategory(e->name, category))
                    names.value(ShortName(e->name));
        }
    }
    if (truncated)
        resp.field("truncated", true);
}

void CommandManager::ListCategory(const char* category, ReplyWriter& reply)
{
    LOCK(mutex_);   // see ListCategories

    auto resp = reply.object();

    bool found = false;
    for (const CommandEntry* e = head_; e != nullptr && !found; e = e->next)
        found = InCategory(e->name, category);

    if (!found)
    {
        resp.field("ok", false);
        resp.field("error", "unknown category");
        return;
    }

    resp.field("ok", true);
    resp.field("category", category);
    auto names = resp.array("commands");
    for (const CommandEntry* e = head_; e != nullptr; e = e->next)
        if (InCategory(e->name, category))
            names.value(ShortName(e->name));
}

CommandResult CommandManager::DescribeCommand(const char* category, const char* command,
                                             ReplyWriter& reply)
{
    auto resp = reply.object();

    if (category[0] == '\0')
    {
        // Routes are two words all the way down, so a command without its category
        // is not a route. Meaning rather than form, so it goes in the reply.
        resp.field("ok", false);
        resp.field("error", "a command needs its category");
        return CommandResult::Ok;
    }

    const CommandEntry* e = FindInCategory(category, command);
    if (e == nullptr)
    {
        resp.field("ok", false);
        resp.field("error", "unknown command");
        return CommandResult::Ok;
    }

    resp.field("ok", true);
    resp.field("category", category);
    resp.field("command", ShortName(e->name));
    if (e->help != nullptr && e->help[0] != '\0')
        resp.field("description", e->help);

    auto args = resp.array("arguments");
    DescribeArguments(*e, args);

    return CommandResult::Ok;
}

void CommandManager::DescribeArguments(const CommandEntry& entry, ReplyArray& args)
{
    // Read, never run. Every command declares its arguments statically, so nothing
    // here dispatches and a handler's body can no longer execute under `help`.
    for (int i = 0; entry.args[i] != nullptr; ++i)
    {
        const ArgDesc& d = *entry.args[i];
        auto arg = args.object();
        arg.field("name", d.name);
        arg.field("type", ArgTypeName(d.type));
        arg.field("required", d.required);
        if (d.type == ArgType::String)
            arg.field("maxLength", static_cast<uint32_t>(d.maxLength));
        // Absent rather than empty when the command did not describe it, so a
        // reader can tell "nothing was said" from "said to be nothing".
        if (d.description != nullptr && d.description[0] != '\0')
            arg.field("description", d.description);
    }
}

CommandResult CommandManager::Cmd_Describe(CommandContext& ctx)
{
    const char* category = ctx.arg(describeCategoryArg);

    // Held across the whole reply, for the same reason ListCategories holds it: a
    // manager registering from another task must not relink the chain half way
    // through the answer. Nothing is dispatched from in here any more.
    LOCK(mutex_);

    const char* seen[MAX_CATEGORIES];
    bool truncated = false;
    const size_t count = CollectCategories(seen, MAX_CATEGORIES, truncated);

    auto resp = ctx.reply.object();
    resp.field("ok", true);
    {
        auto cats = resp.array("categories");
        for (size_t i = 0; i < count; ++i)
        {
            char group[protocol::MAX_COMMAND_NAME];
            CopyCategory(seen[i], group, sizeof(group));

            if (category[0] != '\0' && strcmp(category, group) != 0)
                continue;

            auto cat = cats.object();
            cat.field("category", group);

            auto commands = cat.array("commands");
            for (const CommandEntry* e = head_; e != nullptr; e = e->next)
            {
                if (!InCategory(e->name, group)) continue;

                auto cmd = commands.object();
                cmd.field("name", ShortName(e->name));
                if (e->help != nullptr && e->help[0] != '\0')
                    cmd.field("description", e->help);

                auto args = cmd.array("arguments");
                DescribeArguments(*e, args);
            }
        }
    }
    if (truncated)
        resp.field("truncated", true);

    return CommandResult::Ok;
}

const CommandEntry* CommandManager::Find(const char* name)
{
    LOCK(mutex_);
    for (CommandEntry* e = head_; e != nullptr; e = e->next)
        if (strcmp(name, e->name) == 0)
            return e;
    return nullptr;
}

const CommandEntry* CommandManager::FindInCategory(const char* category,
                                                   const char* command)
{
    // Compared in two parts rather than joined into a buffer: `help list` asks for a
    // category and a command separately, and the registry holds them as one string.
    const size_t n = strlen(category);

    LOCK(mutex_);
    for (CommandEntry* e = head_; e != nullptr; e = e->next)
        if (strncmp(e->name, category, n) == 0 && e->name[n] == ' ' &&
            strcmp(e->name + n + 1, command) == 0)
            return e;
    return nullptr;
}
