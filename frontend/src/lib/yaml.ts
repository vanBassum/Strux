/** Rendering a parsed reply as YAML, for reading rather than for parsing.
 *
 *  A device reply is JSON on the wire and stays JSON; this is how the command
 *  console DRAWS one. The two are worth separating because they are answering
 *  different questions: the wire needs a format both ends agree on, and a trace
 *  needs the shortest thing a person can scan. Pretty-printed JSON spends a
 *  third of its width on braces, quotes and commas that the indentation already
 *  says, and it turns a multi-line string — the device's own instructions, a log
 *  line — into one long row of `\n`.
 *
 *  It is a SUBSET, and deliberately not a YAML library: enough of the grammar to
 *  render what JSON can hold, which is all a reply can be. Nothing reads it back.
 */

const STEP = "  "

export function toYaml(value: unknown): string {
  if (isInline(value)) return inline(value)
  return block(value, "").join("\n")
}

/** A value that fits on the line its key is on: a scalar, or a container with
 *  nothing in it. */
function isInline(value: unknown): boolean {
  if (value === null || typeof value !== "object") return true
  return Array.isArray(value) ? value.length === 0 : Object.keys(value).length === 0
}

function inline(value: unknown): string {
  if (value === null) return "null"
  if (Array.isArray(value)) return "[]"
  if (typeof value === "object") return "{}"
  if (typeof value === "string") return quote(value)
  return String(value)
}

function block(value: unknown, indent: string): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => item_(item, indent))

  const out: string[] = []
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string" && v.includes("\n")) {
      // A block scalar, which is the whole reason a multi-line string is worth
      // handling at all: `system describe` answers with paragraphs.
      out.push(`${indent}${key}: |`)
      out.push(...literal(v, indent + STEP))
    } else if (isInline(v)) {
      out.push(`${indent}${key}: ${inline(v)}`)
    } else {
      out.push(`${indent}${key}:`)
      out.push(...block(v, indent + STEP))
    }
  }
  return out
}

/** One array element. A nested one hangs its first line on the dash, so a list
 *  of objects reads as a list rather than as a column of empty bullets. */
function item_(value: unknown, indent: string): string[] {
  if (typeof value === "string" && value.includes("\n"))
    return [`${indent}- |`, ...literal(value, indent + STEP)]

  if (isInline(value)) return [`${indent}- ${inline(value)}`]

  const inner = block(value, indent + STEP)
  return [`${indent}- ${inner[0].slice(indent.length + STEP.length)}`, ...inner.slice(1)]
}

function literal(text: string, indent: string): string[] {
  const lines = text.split("\n")
  // A string ending in a newline would otherwise draw a line of trailing spaces.
  if (lines.at(-1) === "") lines.pop()
  return lines.map((line) => `${indent}${line}`)
}

// Everything YAML would read as something other than the text it is. Quoting is
// about being unambiguous, not about being safe — nothing parses this back — so
// the test is whether a reader could mistake the value for a number, a boolean
// or the start of a structure.
const INDICATORS = "-?:,[]{}#&*!|>'\"%@`"
const NOT_TEXT = /^(true|false|null|~|[-+]?(\d[\d_]*(\.\d*)?|\.\d+)([eE][-+]?\d+)?)$/i

function quote(text: string): string {
  const needs =
    text === "" ||
    text !== text.trim() ||
    INDICATORS.includes(text[0]) ||
    text.includes(": ") ||
    text.includes(" #") ||
    NOT_TEXT.test(text)

  if (!needs) return text
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
}
