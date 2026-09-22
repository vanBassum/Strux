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

    Register(this, commands_);

    initAttempt.SetReady();
    ESP_LOGI(TAG, "Initialized");
}

CommandResult CommandManager::Execute(const char* category, const char* name,
                                     Stream& in, Stream& out,
                                     ConnectionAuth* connection,
                                     const char** failedArg)
{
    const CommandEntry* e = Find(category, name);
    if (e == nullptr)
        return CommandResult::UnknownCommand;

    // Handler runs OUTSIDE the lock: entries are immortal, so the pointer
    // stays valid, and a handler may register commands or dispatch nested
    // commands without deadlocking.
    //
    // Reading the envelope line is what leaves `in` at the body, so it happens for
    // every command whether or not it takes arguments. The decode against the
    // command's declarations then happens before the handler runs, which is why a
    // handler has no prologue and receives its arguments already validated.
    EnvelopeLine envelope(in);
    JsonReplyWriter writer(out);

    ArgValues values;
    if (e->args[0] != nullptr)
    {
        const char* failed = nullptr;
        const CommandResult err = DecodeJsonArgs(envelope.text(), e->args, values, failed);
        if (err != CommandResult::Ok)
        {
            if (failedArg) *failedArg = failed;
            return err;
        }
    }

    CommandContext ctx(writer, in, out, e->args, values, connection);
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

// Was CommandManager::MAX_ROUTE, a 32-byte buffer these two handlers filled and
// nothing else used. It matches protocol::MAX_COMMAND_NAME, the longest route word
// the wire router carries; one less is the length at which a value was refused,
// which is the number the declaration now states outright.
constexpr uint16_t ROUTE_MAX = 31;

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

CommandEntry CommandManager::commands_[2] = {
    { "help", "list",     &InvokeCommand<&CommandManager::Cmd_Help>,
      "List the device's command categories, one category's commands, or one "
      "command's arguments.",
      { &listCategoryArg, &listCommandArg } },
    { "help", "describe", &InvokeCommand<&CommandManager::Cmd_Describe>,
      "Describe every command this firmware offers - category, name, description "
      "and full argument declarations - in one reply.",
      { &describeCategoryArg } },
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
            known = strcmp(out[i], e->category) == 0;
        if (known) continue;

        if (count == cap) { truncated = true; break; }
        out[count++] = e->category;
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
            auto cat = cats.object();
            cat.field("category", seen[i]);
            auto names = cat.array("commands");
            for (const CommandEntry* e = head_; e != nullptr; e = e->next)
                if (strcmp(seen[i], e->category) == 0)
                    names.value(e->name);
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
        found = strcmp(category, e->category) == 0;

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
        if (strcmp(category, e->category) == 0)
            names.value(e->name);
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

    const CommandEntry* e = Find(category, command);
    if (e == nullptr)
    {
        resp.field("ok", false);
        resp.field("error", "unknown command");
        return CommandResult::Ok;
    }

    resp.field("ok", true);
    resp.field("category", e->category);
    resp.field("command", e->name);
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
            if (category[0] != '\0' && strcmp(category, seen[i]) != 0)
                continue;

            auto cat = cats.object();
            cat.field("category", seen[i]);

            auto commands = cat.array("commands");
            for (const CommandEntry* e = head_; e != nullptr; e = e->next)
            {
                if (strcmp(seen[i], e->category) != 0) continue;

                auto cmd = commands.object();
                cmd.field("name", e->name);
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

const CommandEntry* CommandManager::Find(const char* category, const char* name)
{
    LOCK(mutex_);
    for (CommandEntry* e = head_; e != nullptr; e = e->next)
        if (strcmp(name, e->name) == 0 && strcmp(category, e->category) == 0)
            return e;
    return nullptr;
}
