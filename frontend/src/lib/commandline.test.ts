import { describe, expect, it } from "vitest"

import { complete, matchCommand, signature, tokenize } from "./commandline"
import type { CommandDesc } from "./backend"

// A registry shaped like the device's, and small enough to reason about. Nothing
// under test knows these names — they arrive as data, exactly as `help` delivers
// them — so this fixture is a stand-in for a build, not a copy of one.
const commands: CommandDesc[] = [
  { name: "help", arguments: [] },
  { name: "system ping", arguments: [] },
  { name: "system info", arguments: [] },
  {
    name: "led set",
    arguments: [{ name: "enabled", type: "bool", required: false }],
  },
  {
    name: "partition write",
    arguments: [
      { name: "partition", type: "string", required: true, maxLength: 16 },
      { name: "offset", type: "uint32", required: false },
    ],
  },
  { name: "partition list", arguments: [] },
]

describe("tokenize", () => {
  it("splits on spaces", () => {
    expect(tokenize("led set enabled=true")).toEqual(["led", "set", "enabled=true"])
  })

  it("keeps a quoted value whole", () => {
    expect(tokenize('settings set value="two words"')).toEqual([
      "settings",
      "set",
      "value=two words",
    ])
  })

  it("keeps an empty quoted value as a token", () => {
    expect(tokenize('value=""')).toEqual(["value="])
  })
})

describe("matchCommand", () => {
  it("prefers the longest name", () => {
    expect(matchCommand("partition write partition=x", commands)?.name).toBe(
      "partition write",
    )
  })

  it("matches a one-word command", () => {
    expect(matchCommand("help", commands)?.name).toBe("help")
  })

  it("does not match a prefix of a word", () => {
    expect(matchCommand("part", commands)).toBeUndefined()
  })
})

describe("complete", () => {
  it("completes to the common prefix when several fit", () => {
    const { line, options } = complete("part", commands)
    expect(line).toBe("partition ")
    expect(options).toEqual(["partition write", "partition list"])
  })

  it("completes a single match and moves the cursor on", () => {
    expect(complete("partition w", commands).line).toBe("partition write ")
  })

  it("offers argument names once the command is named", () => {
    const { line, options } = complete("partition write ", commands)
    expect(options).toEqual(["partition", "offset"])
    expect(line).toBe("partition write ")   // no shared prefix to add
  })

  it("completes a single argument name with its equals sign", () => {
    expect(complete("partition write off", commands).line).toBe(
      "partition write offset=",
    )
  })

  it("does not offer an argument already on the line", () => {
    expect(complete("partition write offset=1 ", commands).options).toEqual([
      "partition",
    ])
  })

  it("completes a bool's value, the one type with a closed set", () => {
    expect(complete("led set enabled=t", commands).line).toBe("led set enabled=true")
    expect(complete("led set enabled=", commands).options).toEqual(["true", "false"])
  })

  it("offers nothing for a value whose type has no closed set", () => {
    expect(complete("partition write partition=o", commands).options).toEqual([])
  })

  it("leaves a line it knows nothing about alone", () => {
    const { line, options } = complete("zzz", commands)
    expect(line).toBe("zzz")
    expect(options).toEqual([])
  })
})

describe("signature", () => {
  it("brackets what is optional", () => {
    expect(signature(commands[4])).toBe(
      "partition write partition=<string> [offset=<uint32>]",
    )
  })

  it("is just the name when there are no arguments", () => {
    expect(signature(commands[0])).toBe("help")
  })
})
