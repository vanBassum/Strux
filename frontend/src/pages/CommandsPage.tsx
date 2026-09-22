import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import {
  DownloadIcon,
  PlayIcon,
  RefreshCwIcon,
  SearchIcon,
  SquareTerminalIcon,
  TrashIcon,
} from "lucide-react"

import {
  CommandArgsForm,
  buildEnvelope,
  initialValues,
} from "@/components/CommandArgsForm"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useCommands } from "@/hooks/use-commands"
import { backend, type CommandDesc } from "@/lib/backend"
import { toYaml } from "@/lib/yaml"

/**
 * The command console: pick a command the device declared, fill in the arguments
 * it declared, run it, read the answer.
 *
 * NOTHING in this page or the files it uses names a command. The list comes from
 * `help`, the controls come from each command's argument declarations,
 * and the reply is rendered as it arrived rather than as a shape this file
 * expected. Adding a command to the firmware therefore adds it here, and a
 * command this build has never seen is as usable as one it ships with.
 *
 * That is the point of the page as much as the convenience is: it is the standing
 * test of whether the device's self-description is enough for a second client.
 * Where it is not — a command that takes a request BODY, which no declaration
 * mentions — the page says so instead of special-casing its way around it.
 *
 * The output is laid out as a protocol trace: one row out, one row per record
 * back, in fixed columns. Records appear AS THEY ARRIVE, so a command that
 * reports progress is watched rather than summarised at the end.
 */

/** How much reply text is rendered. A `partition read` answers in megabytes, and
 *  a megabyte of text in the DOM hangs the tab. */
const PREVIEW_LIMIT = 64 * 1024

/** Trace depth. Old lines hold their whole text, so this is a memory bound as
 *  much as a scrollback one. */
const MAX_LINES = 500

type Tone = "normal" | "muted" | "bad"

interface Body {
  bytes: Uint8Array
  contentType: string
  /** The header's `contentEncoding`, when it declared one. */
  encoding?: string
  /** Decoded text, when the declared media type is one that has any. */
  preview?: string
}

interface Line {
  id: number
  at: Date
  dir: "→" | "←" | ""
  text: string
  tone: Tone
  meta?: string
  body?: Body
}

let nextLineId = 1

export default function CommandsPage() {
  const { commands, loading, error, reload } = useCommands()
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<string | null>(null)
  // Per command, so stepping away to run something else and coming back does not
  // lose what was typed. Keyed by wire name, which is what the registry gives us.
  const [values, setValues] = useState<Record<string, Record<string, string>>>({})
  const [lines, setLines] = useState<Line[]>([])
  const [busy, setBusy] = useState(false)

  const command = commands.find((c) => c.name === selected) ?? null

  // The first command the device reports, so the page is never an empty right
  // half waiting to be clicked.
  useEffect(() => {
    if (!selected && commands.length > 0) setSelected(commands[0].name)
  }, [commands, selected])

  const matches = useMemo(() => filter(commands, query), [commands, query])

  function setValue(name: string, value: string) {
    if (!command) return
    setValues((prev) => ({
      ...prev,
      [command.name]: { ...(prev[command.name] ?? initialValues(command)), [name]: value },
    }))
  }

  function append(line: Omit<Line, "id" | "at">) {
    setLines((prev) =>
      [...prev, { ...line, id: nextLineId++, at: new Date() }].slice(-MAX_LINES),
    )
  }

  async function run() {
    if (!command || busy) return

    const envelope = buildEnvelope(command, values[command.name] ?? initialValues(command))
    append({ dir: "→", text: JSON.stringify(envelope), tone: "normal" })
    setBusy(true)

    const started = performance.now()
    try {
      const reply = await backend.execute(envelope, {
        // Records completed before the last one, as they arrive: progress from a
        // long write, and the header of a reply that declares a body.
        onRecord: (text) => append({ dir: "←", text: pretty(text), tone: "muted" }),
      })
      const elapsed = `${Math.round(performance.now() - started)} ms`

      if (reply.result)
        append({
          dir: "←",
          text: pretty(reply.result),
          tone: refused(reply.result) ? "bad" : "normal",
          meta: elapsed,
        })

      if (reply.body) {
        const contentType = String(reply.header?.contentType ?? "application/octet-stream")
        const encoding =
          typeof reply.header?.contentEncoding === "string"
            ? reply.header.contentEncoding
            : undefined
        append({
          dir: "←",
          text: `${formatBytes(reply.body.length)} of ${contentType}`,
          tone: "normal",
          meta: elapsed,
          body: {
            bytes: reply.body,
            contentType,
            encoding,
            preview: await bodyPreview(reply.body, contentType, encoding),
          },
        })
      }
    } catch (e) {
      // A RESET carries the device's reason — a missing argument, a malformed
      // number, `busy`. A timeout and a dropped socket arrive the same way. All
      // three are the device's answer as much as a record would be.
      append({
        dir: "←",
        text: e instanceof Error ? e.message : "Failed",
        tone: "bad",
        meta: `${Math.round(performance.now() - started)} ms`,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <SquareTerminalIcon className="size-5 text-muted-foreground" />
          <h1 className="text-2xl font-bold">Commands</h1>
          {commands.length > 0 && (
            <span className="hidden text-sm text-muted-foreground sm:inline">
              ({commands.length} discovered)
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
            <RefreshCwIcon className="mr-1.5 size-3.5" />
            Rediscover
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLines([])}
            disabled={lines.length === 0}
          >
            <TrashIcon className="mr-1.5 size-3.5" />
            Clear
          </Button>
        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive">
          Could not read the command registry: {error}
        </p>
      )}
      <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[16rem_1fr]">
        <CommandList
          commands={matches}
          selected={selected}
          onSelect={setSelected}
          query={query}
          onQuery={setQuery}
          loading={loading && commands.length === 0}
        />

        <div className="flex min-h-0 flex-col gap-3">
          {command && (
            <div className="shrink-0 rounded-xl border p-4">
              <div className="mb-1 font-mono text-sm font-medium">{command.name}</div>
              <p className="mb-4 text-sm text-muted-foreground">
                {command.description ?? (
                  <span className="italic">No description declared.</span>
                )}
              </p>

              <CommandArgsForm
                command={command}
                values={values[command.name] ?? initialValues(command)}
                onChange={setValue}
                disabled={busy}
              />

              <div className="mt-4 flex items-center justify-between gap-4">
                <p className="text-xs text-muted-foreground">
                  An empty optional argument is left out of the envelope.
                </p>
                <Button onClick={() => void run()} disabled={busy} className="shrink-0">
                  <PlayIcon className="mr-1.5 size-3.5" />
                  {busy ? "Running…" : "Run"}
                </Button>
              </div>
            </div>
          )}

          <Trace lines={lines} />
        </div>
      </div>
    </div>
  )
}

function CommandList({
  commands,
  selected,
  onSelect,
  query,
  onQuery,
  loading,
}: {
  commands: CommandDesc[]
  selected: string | null
  onSelect: (name: string) => void
  query: string
  onQuery: (q: string) => void
  loading: boolean
}) {
  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="relative shrink-0">
        <SearchIcon className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search commands"
          spellCheck={false}
          className="pl-8"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border p-1">
        {loading && (
          <div className="space-y-2 p-2">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-6 w-full" />
            ))}
          </div>
        )}
        {!loading && commands.length === 0 && (
          <p className="p-3 text-sm text-muted-foreground">No command matches.</p>
        )}
        {commands.map((command) => (
          <button
            key={command.name}
            type="button"
            onClick={() => onSelect(command.name)}
            className={`block w-full rounded-md px-2 py-1 text-left font-mono text-sm ${
              command.name === selected
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted"
            }`}
          >
            {command.name}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * Everything sent and everything that came back, oldest at the top.
 *
 * Stuck to the bottom while you are already there, and left alone when you are
 * not: scrolling up to read what a command did twenty runs ago should not be
 * undone by the next record landing.
 */
function Trace({ lines }: { lines: Line[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)

  useLayoutEffect(() => {
    const element = ref.current
    if (element && pinned.current) element.scrollTop = element.scrollHeight
  }, [lines])

  return (
    <div
      ref={ref}
      onScroll={(e) => {
        const el = e.currentTarget
        pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
      }}
      className="min-h-0 flex-1 overflow-y-auto rounded-xl border bg-muted/30 py-1 font-mono text-xs"
    >
      {lines.length === 0 ? (
        <p className="px-3 py-2 text-muted-foreground">
          Nothing run yet. Everything below comes from the device.
        </p>
      ) : (
        lines.map((line) => <Row key={line.id} line={line} />)
      )}
    </div>
  )
}

function Row({ line }: { line: Line }) {
  const tone =
    line.tone === "bad"
      ? "text-destructive"
      : line.tone === "muted"
        ? "text-muted-foreground"
        : undefined

  return (
    <div className="flex items-baseline gap-2 px-3 leading-5 hover:bg-muted/60">
      <span className="w-[6.5rem] shrink-0 text-muted-foreground tabular-nums">
        {stamp(line.at)}
      </span>
      <span
        className={`w-3 shrink-0 text-center select-none ${
          line.dir === "→" ? "text-muted-foreground" : ""
        }`}
      >
        {line.dir}
      </span>
      <div className="min-w-0 flex-1">
        <pre className={`whitespace-pre-wrap ${tone ?? ""}`}>{line.text}</pre>
        {line.body && <BodyRow body={line.body} />}
      </div>
      {line.meta && (
        <span className="shrink-0 text-[0.6875rem] text-muted-foreground tabular-nums">
          {line.meta}
        </span>
      )}
    </div>
  )
}

/**
 * A declared body: what it is, a way to keep it, and its text when it has any.
 *
 * Which of those applies is decided by the media type the reply DECLARED, never
 * by which command was run — that declaration is the only thing about a body the
 * protocol makes discoverable, and it turns out to be enough.
 */
function BodyRow({ body }: { body: Body }) {
  return (
    <div className="my-1 rounded-md border bg-background/60 p-2">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-muted-foreground">
          {body.contentType}
          {body.encoding ? ` · ${body.encoding}` : ""}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto h-6 px-2 text-xs"
          onClick={() => download(body)}
        >
          <DownloadIcon className="mr-1 size-3" />
          Save
        </Button>
      </div>
      {body.preview !== undefined ? (
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap">{body.preview}</pre>
      ) : (
        <p className="text-muted-foreground italic">
          Not a textual media type — save it to look at it.
        </p>
      )}
    </div>
  )
}

function filter(commands: CommandDesc[], query: string): CommandDesc[] {
  const q = query.trim().toLowerCase()
  if (!q) return commands
  // Descriptions are searched too: someone looking for "reboot" should find
  // `partition activate`, which is what actually reboots into a new image.
  return commands.filter((c) =>
    `${c.name} ${c.description ?? ""}`.toLowerCase().includes(q),
  )
}

/** A record that says `ok: false`. A reply without the field — `system ping`
 *  answers `{"pong":true}` — is not a failure and must not be painted as one. */
function refused(record: string): boolean {
  return tryParse(record)?.ok === false
}

/** A record, as the trace draws it: YAML when it is JSON, and the bytes as they
 *  came when it is not. A handler may write anything, and a console that hid
 *  what it could not parse would hide exactly the reply worth looking at.
 *
 *  Only the REPLY is rendered. The request line above it stays the envelope
 *  exactly as it went out, because what was sent is the thing being debugged. */
function pretty(record: string): string {
  const parsed = tryParse(record)
  const text = parsed ? toYaml(parsed) : record
  return text.length > PREVIEW_LIMIT
    ? `${text.slice(0, PREVIEW_LIMIT)}\n… ${formatBytes(text.length - PREVIEW_LIMIT)} not shown`
    : text
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

/** The body as text, when the declared media type says it is text. Undefined for
 *  anything else — a flash image rendered as mojibake helps nobody. */
async function bodyPreview(
  bytes: Uint8Array,
  contentType: string,
  encoding?: string,
): Promise<string | undefined> {
  if (!textual(contentType)) return undefined

  let data = bytes
  if (encoding === "gzip") {
    try {
      data = await gunzip(bytes)
    } catch {
      return undefined
    }
  }

  const text = new TextDecoder().decode(data.subarray(0, PREVIEW_LIMIT))
  return data.length > PREVIEW_LIMIT
    ? `${text}\n… ${formatBytes(data.length - PREVIEW_LIMIT)} not shown`
    : text
}

function textual(contentType: string): boolean {
  const type = contentType.split(";")[0].trim().toLowerCase()
  return (
    type.startsWith("text/") ||
    type.endsWith("+json") ||
    type.endsWith("+xml") ||
    ["application/json", "application/xml", "application/javascript"].includes(type)
  )
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** Saved as it ARRIVED, compression included, because that is what the device
 *  sent; the name says so rather than the bytes being quietly rewritten. */
function download(body: Body) {
  const subtype = body.contentType.split(";")[0].split("/").pop() ?? "bin"
  const extension = subtype === "octet-stream" ? "bin" : subtype.split("+").pop()!
  const name = `reply.${extension}${body.encoding === "gzip" ? ".gz" : ""}`

  const url = URL.createObjectURL(new Blob([body.bytes as BlobPart]))
  const a = document.createElement("a")
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

/** 24-hour clock with milliseconds, which is the resolution a round trip needs. */
function stamp(at: Date): string {
  const pad = (v: number, width = 2) => String(v).padStart(width, "0")
  return (
    `${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}` +
    `.${pad(at.getMilliseconds(), 3)}`
  )
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
