import { useRef, useState } from "react"
import { PlayIcon, SquareTerminalIcon, TrashIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { backend } from "@/lib/backend"
import type { ReplyResult } from "@/lib/reply"

/**
 * The command workbench: type an envelope, send it, read the reply.
 *
 * Commands ARE the device's RPC surface, so this page is the surface with no
 * product on top of it — every command is reachable here, including the ones no
 * other page calls and the ones that answer with bytes rather than JSON. It is
 * deliberately not part of the Console: the console is the device's log stream,
 * while a reply belongs next to the request that asked for it. See issue #13.
 *
 * It shows the reply as it ARRIVED rather than as this file would like it — every
 * record, not just the last one, and a body reported rather than rendered. That is
 * the point of a workbench: a reply the frontend has no type for is still the
 * device's answer.
 */

/** How much reply text is rendered. A `partition read` answers in megabytes, and
 *  a megabyte of text in the DOM hangs the tab; the entry says how much it left
 *  out rather than pretending it showed everything. */
const PREVIEW_LIMIT = 64 * 1024

/** History depth. Old entries hold their whole reply preview, so this is a memory
 *  bound as much as a UI one. */
const MAX_ENTRIES = 50

/** What a call came to. The entry around it adds when it was made and by what. */
interface Outcome {
  failed: boolean
  /** The reply, or the reason there was none. */
  text: string
  /** Bytes of reply text not shown, or 0. */
  dropped: number
}

interface Entry extends Outcome {
  id: number
  at: string
  /** The envelope as sent, not as typed — so the shorthand is visible as a call. */
  request: string
  durationMs: number
}

let nextId = 1

export default function CommandsPage() {
  const [text, setText] = useState('{"type": "system info"}')
  const [entries, setEntries] = useState<Entry[]>([])
  const [busy, setBusy] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  async function run() {
    let envelope: Record<string, unknown>
    try {
      envelope = parseEnvelope(text)
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Unreadable input")
      return
    }
    setParseError(null)
    setBusy(true)

    const started = performance.now()
    const at = new Date().toLocaleTimeString()
    let outcome: Outcome
    try {
      outcome = describeReply(await backend.execute(envelope))
    } catch (e) {
      // A RESET carries its reason, a timeout says so, and a closed socket says
      // that. All three are the device's answer as much as a record would be.
      outcome = { failed: true, text: e instanceof Error ? e.message : "Failed", dropped: 0 }
    }

    setEntries((prev) =>
      [
        {
          ...outcome,
          id: nextId++,
          at,
          request: JSON.stringify(envelope),
          durationMs: Math.round(performance.now() - started),
        },
        ...prev,
      ].slice(0, MAX_ENTRIES),
    )
    setBusy(false)
    inputRef.current?.focus()
  }

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SquareTerminalIcon className="size-5 text-muted-foreground" />
          <h1 className="text-2xl font-bold">Commands</h1>
        </div>
        {entries.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => setEntries([])}>
            <TrashIcon className="mr-1.5 size-3.5" />
            Clear
          </Button>
        )}
      </div>

      <div className="space-y-2">
        <Textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault()
              void run()
            }
          }}
          spellCheck={false}
          rows={3}
          aria-invalid={parseError !== null}
          className="font-mono text-sm"
          placeholder='{"type": "help list"}'
        />
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            {parseError ? (
              <span className="text-destructive">{parseError}</span>
            ) : (
              <>
                A line that is not JSON is taken as the command itself, so{" "}
                <code className="font-mono">system info</code> and{" "}
                <code className="font-mono">{'{"type":"system info"}'}</code> are the
                same call. <code className="font-mono">help describe</code> lists every
                command and its arguments.
              </>
            )}
          </p>
          <Button onClick={() => void run()} disabled={busy} className="shrink-0">
            <PlayIcon className="mr-1.5 size-3.5" />
            {busy ? "Running…" : "Send"}
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
        {entries.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nothing sent yet. Ctrl+Enter sends.
          </p>
        )}
        {entries.map((entry) => (
          <HistoryEntry key={entry.id} entry={entry} />
        ))}
      </div>
    </div>
  )
}

function HistoryEntry({ entry }: { entry: Entry }) {
  return (
    <div className="rounded-xl border">
      <div className="flex items-center gap-2 border-b px-3 py-2 text-xs">
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${
            entry.failed ? "bg-red-500" : "bg-emerald-500"
          }`}
        />
        <span className="truncate font-mono">{entry.request}</span>
        <span className="ml-auto shrink-0 text-muted-foreground">
          {entry.at} · {entry.durationMs} ms
        </span>
      </div>
      <pre className="overflow-x-auto px-3 py-2 font-mono text-xs leading-5 whitespace-pre-wrap">
        {entry.text}
      </pre>
      {entry.dropped > 0 && (
        <p className="border-t px-3 py-2 text-xs text-muted-foreground">
          Preview truncated after {formatBytes(PREVIEW_LIMIT)} — {formatBytes(entry.dropped)}{" "}
          not shown.
        </p>
      )}
    </div>
  )
}

/** What gets sent, from what was typed. JSON is the wire format and the normal
 *  input; a bare line saves typing an envelope around a command that takes no
 *  arguments, which is most of them. */
function parseEnvelope(input: string): Record<string, unknown> {
  const trimmed = input.trim()
  if (!trimmed) throw new Error("Nothing to send")

  if (!trimmed.startsWith("{")) return { type: trimmed }

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : "Invalid JSON")
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("The envelope must be a JSON object")

  const envelope = parsed as Record<string, unknown>
  if (typeof envelope.type !== "string" || !envelope.type)
    throw new Error('The envelope needs a "type", e.g. {"type": "system info"}')
  return envelope
}

/** The reply, rendered. Records are pretty-printed when they are JSON and left
 *  alone when they are not — a handler may write anything, and a workbench that
 *  hid what it could not parse would hide exactly the reply worth looking at. */
function describeReply(reply: ReplyResult): Outcome {
  const parts: string[] = []

  // A declared body's header never joins `records`: it is the reply's first
  // record and the reader keeps it apart, because everything after it is bytes.
  if (reply.header) parts.push(pretty(JSON.stringify(reply.header)))
  for (const record of reply.records) parts.push(pretty(record))
  if (reply.result) parts.push(pretty(reply.result))

  if (reply.body)
    parts.push(
      `<body: ${formatBytes(reply.body.length)}, ${reply.header?.contentType ?? "unknown type"}>`,
    )

  const full = parts.join("\n") || "<empty reply>"
  return {
    failed: failed(reply),
    text: full.slice(0, PREVIEW_LIMIT),
    dropped: Math.max(0, full.length - PREVIEW_LIMIT),
  }
}

/** A reply that says `ok: false` is a refusal, and the device says which record
 *  carries the verdict by putting it last. A reply without the field — a body
 *  header, a handler with its own shape — is not a failure. */
function failed(reply: ReplyResult): boolean {
  const verdict = tryParse(reply.result) ?? reply.header
  return verdict?.ok === false
}

function pretty(record: string): string {
  const parsed = tryParse(record)
  return parsed ? JSON.stringify(parsed, null, 2) : record
}

function tryParse(text: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(text)
    return v && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
