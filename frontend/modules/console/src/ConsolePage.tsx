import { useEffect, useRef, useState } from "react"
import type { ShellProvider } from "@shell/contract"
import { Button } from "../../_ui"
import { errorMessage } from "../../_ui/activate"

// The device's log, live.
//
// This was a page compiled into the device shell, and moving it here is what forced
// `transport.logs` into the contract — the device broadcasts on session 0 and always
// has, but a module had no way to reach it, and a polled console would have been a
// regression on the shell it came from. So the contract grew the one device-initiated
// stream that actually exists, rather than a subscription framework whose only user
// would be this file.
//
// Two sources, and they answer different questions. `log list` is the device's ring
// buffer and reaches back before this page opened; `transport.logs` is what has
// happened since. Neither substitutes for the other, which is why the page asks for
// both and concatenates them.

const MAX_LINES = 1000

/// Colour by ESP-IDF level, which is the first character: `E (123) tag: …`. Anything
/// unrecognised is left alone rather than guessed at.
function levelClass(line: string): string | undefined {
  switch (/^([EWIDV]) \(/.exec(line)?.[1]) {
    case "E":
      return "text-destructive"
    case "W":
      return "text-amber-600 dark:text-amber-500"
    case "D":
    case "V":
      return "text-muted-foreground"
    default:
      return undefined
  }
}

export function ConsolePage({ shell }: { shell: ShellProvider }) {
  const [lines, setLines] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [following, setFollowing] = useState(true)

  const scroller = useRef<HTMLDivElement | null>(null)
  const bottom = useRef<HTMLDivElement | null>(null)

  // History first, so the page is not empty until something is logged.
  useEffect(() => {
    let alive = true
    shell.transport
      .request<{ lines?: string[] }>("log list")
      .then((reply) => {
        if (alive) setLines(reply?.lines ?? [])
      })
      .catch((e) => {
        // Not fatal: the live stream below still works, and a console showing only
        // what happened since it opened is better than a console showing an error.
        if (alive) setError(errorMessage(e))
      })
    return () => {
      alive = false
    }
  }, [shell])

  // Then everything after it. Bounded, because a device left logging for a week would
  // otherwise grow this array until the tab died.
  useEffect(
    () =>
      shell.transport.logs((line) => {
        if (typeof line.log !== "string") return
        setLines((previous) => {
          const next = [...previous, line.log as string]
          return next.length > MAX_LINES ? next.slice(-MAX_LINES) : next
        })
      }),
    [shell],
  )

  // Follow the tail, but only while the reader is at the bottom — scrolling up is how
  // somebody says "stop moving, I am reading this".
  useEffect(() => {
    if (following) bottom.current?.scrollIntoView({ behavior: "smooth" })
  }, [lines, following])

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Console</h1>
          <p className="text-muted-foreground text-sm">
            The device's buffer from before this page opened, then every line since.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {!following && (
            <Button
              variant="outline"
              onClick={() => {
                setFollowing(true)
                bottom.current?.scrollIntoView()
              }}
            >
              Follow
            </Button>
          )}
          <Button variant="outline" onClick={() => setLines([])}>
            Clear
          </Button>
        </div>
      </div>

      {error && (
        <p className="text-muted-foreground text-sm">
          Could not read the buffer ({error}) — showing live lines only.
        </p>
      )}

      <div
        ref={scroller}
        onScroll={() => {
          const element = scroller.current
          if (!element) return
          setFollowing(
            element.scrollHeight - element.scrollTop - element.clientHeight < 40,
          )
        }}
        className="bg-card min-h-0 flex-1 overflow-auto rounded-xl border p-3"
      >
        {lines.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nothing logged yet.</p>
        ) : (
          <pre className="font-mono text-xs leading-relaxed">
            {lines.map((line, i) => (
              <div key={i} className={levelClass(line)}>
                {line}
              </div>
            ))}
          </pre>
        )}
        <div ref={bottom} />
      </div>
    </div>
  )
}
