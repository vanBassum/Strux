import { useLayoutEffect, useRef, useState } from "react"
import { SendIcon, SquareTerminalIcon, TrashIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useCommands } from "@/hooks/use-commands"
import { backend } from "@/lib/backend"
import { complete, matchCommand, signature } from "@/lib/commandline"

/**
 * Running commands, the old-school way: type a line, read the answer.
 *
 * What is typed here goes to the device as those bytes — `led set enabled=true`
 * and not an envelope — and what comes back is what the device wrote, which is
 * YAML because that is the console codec's reply half. Nothing in this file
 * translates between the two: the codec is in the firmware
 * (main/lib/protocol/ConsoleEnvelope.h and YamlReplyWriter.h), and the browser
 * is simply a second client of it.
 *
 * The registry is used, and only for the prompt: Tab completes a command name,
 * then an argument name, then a bool's value, all off `help` at runtime. That is
 * an offer and never a rewrite — a line the registry has never heard of is sent
 * exactly as typed, and the device is what refuses it. So adding a command to
 * the firmware adds it here, and this page still holds no list of its own.
 *
 * NOT the Console. That page is the device's stdout — lines it printed without
 * being asked — and the two are kept apart on purpose: a reply belongs next to
 * the request that asked for it, and a log line belongs to nothing.
 */

/** Scrollback. Old rows keep their whole text, so this is a memory bound as much
 *  as a scrollback one. */
const MAX_ROWS = 500

/** How much of one record is drawn. `partition read` answers in megabytes, and a
 *  megabyte of text in the DOM hangs the tab. */
const RECORD_LIMIT = 32 * 1024

type Kind = "out" | "in" | "error"

interface Row {
  id: number
  at: Date
  kind: Kind
  text: string
  /** Elapsed round trip, on the row that completed a command. */
  meta?: string
}

let nextRowId = 1

export default function CommandsPage() {
  const { commands } = useCommands()
  const [rows, setRows] = useState<Row[]>([])
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const [options, setOptions] = useState<string[]>([])
  const history = useRef<string[]>([])
  const historyAt = useRef(-1)
  const inputRef = useRef<HTMLInputElement>(null)

  function append(row: Omit<Row, "id" | "at">) {
    setRows((prev) =>
      [...prev, { ...row, id: nextRowId++, at: new Date() }].slice(-MAX_ROWS),
    )
  }

  async function run() {
    const line = input.trim()
    if (!line || busy) return

    history.current = [...history.current.filter((h) => h !== line), line]
    historyAt.current = -1
    setInput("")
    setOptions([])
    append({ kind: "out", text: line })
    setBusy(true)

    const started = performance.now()
    try {
      const reply = await backend.runConsole(line, {
        // Records completed before the last one, as they arrive: a command that
        // reports progress is watched rather than summarised at the end.
        onRecord: (text) => append({ kind: "in", text: clip(text) }),
      })
      const elapsed = `${Math.round(performance.now() - started)} ms`

      // The records already seen came through onRecord; only the last is new.
      // A reply that declared a body has none left — its header WAS that last
      // record, and everything after the divider is bytes.
      const last = reply.body === null ? reply.records.at(-1) : undefined
      if (last !== undefined) append({ kind: "in", text: clip(last), meta: elapsed })

      if (reply.body)
        append({
          kind: "in",
          text:
            `<${reply.body.length} bytes of ${reply.contentType}` +
            `${reply.contentEncoding ? `, ${reply.contentEncoding}` : ""}>`,
          meta: elapsed,
        })

      if (reply.records.length === 0 && !reply.body)
        append({ kind: "in", text: "(no reply)", meta: elapsed })
    } catch (e) {
      // A RESET carries the device's reason — an unknown command, a missing
      // argument, `busy`. A timeout and a dropped socket arrive the same way,
      // and all three are the device's answer as much as a record would be.
      append({
        kind: "error",
        text: e instanceof Error ? e.message : "Failed",
        meta: `${Math.round(performance.now() - started)} ms`,
      })
    } finally {
      setBusy(false)
      inputRef.current?.focus()
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Tab") {
      e.preventDefault()
      const { line, options: offered } = complete(input, commands)
      setInput(line)
      setOptions(offered.length > 1 ? offered : [])
      return
    }

    if (e.key === "l" && e.ctrlKey) {
      e.preventDefault()
      setRows([])
      return
    }

    if (e.key === "c" && e.ctrlKey) {
      // A shell's Ctrl+C on a prompt: abandon the line. The device is
      // single-in-flight and will still answer whatever is running — this stops
      // waiting for it, it does not reach across and stop the device.
      e.preventDefault()
      if (input) append({ kind: "out", text: `${input}^C` })
      setInput("")
      setOptions([])
      return
    }

    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      if (history.current.length === 0) return
      e.preventDefault()
      const at =
        e.key === "ArrowUp"
          ? Math.min(historyAt.current + 1, history.current.length - 1)
          : historyAt.current - 1
      historyAt.current = Math.max(at, -1)
      setInput(
        historyAt.current < 0
          ? ""
          : history.current[history.current.length - 1 - historyAt.current],
      )
    }
  }

  const current = matchCommand(input, commands)

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <SquareTerminalIcon className="size-5 text-muted-foreground" />
          <h1 className="text-2xl font-bold">Commands</h1>
          <span className="hidden text-sm text-muted-foreground sm:inline">
            {commands.length > 0 ? `${commands.length} discovered` : "connecting…"}
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setRows([])}
          disabled={rows.length === 0}
        >
          <TrashIcon className="mr-1.5 size-3.5" />
          Clear
        </Button>
      </div>

      <Transcript rows={rows} />

      {/* What the registry knows about the line so far. An offer, never a rule:
          the device is what decides whether a line is a command. */}
      <div className="h-5 shrink-0 truncate px-1 font-mono text-xs text-muted-foreground">
        {options.length > 0 ? options.join("  ") : current ? signature(current) : ""}
      </div>

      <form
        className="flex shrink-0 items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void run()
        }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border px-3 py-2 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
          <span className="shrink-0 font-mono text-sm text-muted-foreground select-none">
            &gt;
          </span>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              setOptions([])
            }}
            onKeyDown={onKeyDown}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoFocus
            placeholder="Type a command… (e.g. 'system ping', 'led set enabled=true')"
            className="min-w-0 flex-1 bg-transparent font-mono text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <Button type="submit" disabled={busy} className="shrink-0">
          <SendIcon className="mr-1.5 size-3.5" />
          {busy ? "Running…" : "Send"}
        </Button>
      </form>

      <p className="shrink-0 px-1 text-xs text-muted-foreground">
        <Key>↑ ↓</Key> history <Key>Tab</Key> autocomplete <Key>Ctrl+L</Key> clear{" "}
        <Key>Ctrl+C</Key> cancel
      </p>
    </div>
  )
}

function Key({ children }: { children: React.ReactNode }) {
  return <span className="ml-3 font-mono text-foreground first:ml-0">{children}</span>
}

/**
 * Everything typed and everything answered, oldest at the top.
 *
 * Stuck to the bottom while you are already there, and left alone when you are
 * not: scrolling up to read what a command did twenty lines ago should not be
 * undone by the next reply landing.
 */
function Transcript({ rows }: { rows: Row[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)

  useLayoutEffect(() => {
    const el = ref.current
    if (el && pinned.current) el.scrollTop = el.scrollHeight
  }, [rows])

  return (
    <div
      ref={ref}
      onScroll={(e) => {
        const el = e.currentTarget
        pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
      }}
      className="min-h-0 flex-1 overflow-y-auto rounded-xl border bg-muted/30 py-1 font-mono text-xs"
    >
      {rows.length === 0 ? (
        <p className="px-3 py-2 text-muted-foreground">
          Nothing run yet. Type <span className="text-foreground">help</span> to see
          what this device can do.
        </p>
      ) : (
        rows.map((row) => <Line key={row.id} row={row} />)
      )}
    </div>
  )
}

function Line({ row }: { row: Row }) {
  return (
    <div className="flex items-baseline gap-2 px-3 leading-5 hover:bg-muted/60">
      <span className="w-[6.5rem] shrink-0 text-muted-foreground tabular-nums">
        {stamp(row.at)}
      </span>
      <span className="w-8 shrink-0 select-none">
        <Badge kind={row.kind} />
      </span>
      <pre
        className={`min-w-0 flex-1 whitespace-pre-wrap ${
          row.kind === "error" ? "text-destructive" : ""
        }`}
      >
        {row.text}
      </pre>
      {row.meta && (
        <span className="shrink-0 text-[0.6875rem] text-muted-foreground tabular-nums">
          {row.meta}
        </span>
      )}
    </div>
  )
}

function Badge({ kind }: { kind: Kind }) {
  const colors =
    kind === "out"
      ? "bg-blue-500/15 text-blue-600 dark:text-blue-400"
      : kind === "error"
        ? "bg-destructive/15 text-destructive"
        : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
  return (
    <span className={`rounded px-1 py-px text-[0.625rem] font-medium ${colors}`}>
      {kind === "out" ? "OUT" : "IN"}
    </span>
  )
}

function clip(text: string): string {
  if (text.length <= RECORD_LIMIT) return text
  return `${text.slice(0, RECORD_LIMIT)}\n… ${text.length - RECORD_LIMIT} more characters`
}

/** 24-hour clock with milliseconds, which is the resolution a round trip needs. */
function stamp(at: Date): string {
  const pad = (v: number, width = 2) => String(v).padStart(width, "0")
  return (
    `${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}` +
    `.${pad(at.getMilliseconds(), 3)}`
  )
}
