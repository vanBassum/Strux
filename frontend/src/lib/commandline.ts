/** Completing a typed console line against the registry the device reported.
 *
 *  What this file is NOT: a parser. The line the terminal types is the line the
 *  device receives, verbatim — the console codec lives in the firmware
 *  (main/lib/protocol/ConsoleEnvelope.h) and nothing here translates a line into
 *  anything else. Every function below only ever offers the next word.
 *
 *  Even the offering knows no command: names, argument names and argument types
 *  all come from `help` at runtime.
 */

import type { CommandDesc } from "@/lib/backend"

/** Split on spaces, except inside quotes, the way the device's decoder does. */
export function tokenize(input: string): string[] {
  const tokens: string[] = []
  let current = ""
  let quote: string | null = null
  let open = false

  for (const ch of input) {
    if (quote !== null) {
      if (ch === quote) quote = null
      else current += ch
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      open = true
      continue
    }
    if (ch === " ") {
      if (open) tokens.push(current)
      current = ""
      open = false
      continue
    }
    current += ch
    open = true
  }
  if (open) tokens.push(current)
  return tokens
}

/** The longest registry name the line starts with. Longest, because a command
 *  name is usually two words and its first word may also be a command. */
export function matchCommand(
  input: string,
  commands: CommandDesc[],
): CommandDesc | undefined {
  const line = input.trimStart()
  let best: CommandDesc | undefined
  for (const command of commands) {
    if (line !== command.name && !line.startsWith(`${command.name} `)) continue
    if (!best || command.name.length > best.name.length) best = command
  }
  return best
}

export interface Completion {
  /** The line Tab replaces the input with. Unchanged when nothing fits. */
  line: string
  /** Everything that would have fitted, for the strip above the prompt. */
  options: string[]
}

/** What Tab does, and what the prompt offers while you type.
 *
 *  Three things are completable and all three come off the registry: a command
 *  name, an argument name once a command is named, and — for a bool, the one
 *  type with a closed set of values — the value itself. */
export function complete(input: string, commands: CommandDesc[]): Completion {
  const command = matchCommand(input, commands)

  // Still naming the command: the prefix is the WHOLE line, because a name has a
  // space in it.
  if (!command || input.trimStart().length <= command.name.length) {
    const prefix = input.trimStart()
    const options = commands.map((c) => c.name).filter((n) => n.startsWith(prefix))
    if (options.length === 0) return { line: input, options: [] }
    // A name completed exactly gets its trailing space, so the next Tab moves on
    // to the arguments.
    const line = options.length === 1 ? `${options[0]} ` : commonPrefix(options)
    return { line, options }
  }

  const token = input.endsWith(" ") ? "" : (tokenize(input).at(-1) ?? "")
  const head = input.slice(0, input.length - token.length)

  const eq = token.indexOf("=")
  if (eq > 0) {
    const declared = command.arguments.find((a) => a.name === token.slice(0, eq))
    if (declared?.type !== "bool") return { line: input, options: [] }
    const options = ["true", "false"].filter((v) => v.startsWith(token.slice(eq + 1)))
    if (options.length === 0) return { line: input, options: [] }
    return { line: `${head}${token.slice(0, eq)}=${commonPrefix(options)}`, options }
  }

  // Arguments already on the line are not offered again.
  const used = new Set(
    tokenize(input.slice(command.name.length))
      .map((t) => t.slice(0, t.indexOf("=")))
      .filter(Boolean),
  )
  const options = command.arguments
    .map((a) => a.name)
    .filter((n) => !used.has(n) && n.startsWith(token))
  if (options.length === 0) return { line: input, options: [] }

  const line =
    options.length === 1 ? `${head}${options[0]}=` : `${head}${commonPrefix(options)}`
  return { line, options }
}

function commonPrefix(values: string[]): string {
  let prefix = values[0]
  for (const value of values)
    while (!value.startsWith(prefix)) prefix = prefix.slice(0, -1)
  return prefix
}

/** How a command reads above the prompt:
 *  `partition write partition=<string> [offset=<uint32>]`. */
export function signature(command: CommandDesc): string {
  const args = command.arguments.map((a) =>
    a.required ? `${a.name}=<${a.type}>` : `[${a.name}=<${a.type}>]`,
  )
  return [command.name, ...args].join(" ")
}
