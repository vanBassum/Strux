import { describe, expect, it } from "vitest"

import { toYaml } from "./yaml"

/** The cases are real replies. What is being checked is that a reader sees the
 *  same facts the JSON carried, with the punctuation the indentation makes
 *  redundant taken away — not that this agrees with any particular YAML
 *  library, which nothing here parses with. */
describe("toYaml", () => {
  it("renders a flat record", () => {
    expect(toYaml({ ok: true, enabled: false, on: true })).toBe(
      "ok: true\nenabled: false\non: true",
    )
  })

  it("keeps numbers and strings apart", () => {
    // A version is left alone — "0.0.8" is not a number in any reading, so
    // quoting it would only add noise. A value that IS ambiguous is quoted.
    expect(toYaml({ firmware: "0.0.8", rssi: -67, offset: "0" })).toBe(
      'firmware: 0.0.8\nrssi: -67\noffset: "0"',
    )
  })

  it("nests an object under its key", () => {
    expect(toYaml({ ok: true, info: { chip: "esp32", heap: 83404 } })).toBe(
      "ok: true\ninfo:\n  chip: esp32\n  heap: 83404",
    )
  })

  it("hangs a list of objects on its dashes", () => {
    expect(
      toYaml({ partitions: [{ label: "nvs", size: 24576 }, { label: "ota_0", size: 2031616 }] }),
    ).toBe(
      "partitions:\n  - label: nvs\n    size: 24576\n  - label: ota_0\n    size: 2031616",
    )
  })

  it("renders a list of scalars", () => {
    expect(toYaml({ lines: ["boot", "wifi up"] })).toBe("lines:\n  - boot\n  - wifi up")
  })

  it("renders an empty container inline", () => {
    expect(toYaml({ commands: [], args: {} })).toBe("commands: []\nargs: {}")
  })

  it("puts a multi-line string in a block scalar", () => {
    // `system describe` answers with paragraphs, which JSON shows as one row.
    expect(toYaml({ instructions: "first\n\nsecond\n" })).toBe(
      "instructions: |\n  first\n  \n  second",
    )
  })

  it("quotes what would otherwise read as something else", () => {
    expect(toYaml({ a: "", b: "true", c: "12", d: "- x", e: "key: value" })).toBe(
      'a: ""\nb: "true"\nc: "12"\nd: "- x"\ne: "key: value"',
    )
  })

  it("leaves ordinary text unquoted", () => {
    expect(toYaml({ error: "unknown partition" })).toBe("error: unknown partition")
  })

  it("renders null", () => {
    expect(toYaml({ version: null })).toBe("version: null")
  })
})
