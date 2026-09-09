import type { ShellProvider } from "@shell/contract"
import { Bulb } from "./LedCard"
import { describe, useLed } from "./led"
import { Toggle } from "./Toggle"

// The module's full page — the half a dashboard card cannot carry. It exists mostly to
// prove the interesting half of the contract: a firmware-declared nav entry, opened by
// the shell's router, rendering a component the shell has never heard of, talking to
// the device over the shell's own single socket.
export function LedPage({ shell }: { shell: ShellProvider }) {
  const { state, busy, error, setEnabled, refresh } = useLed(shell.transport)

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Bulb lit={state?.on === true} />
        <h1 className="text-2xl font-bold">LED</h1>
      </div>

      <div className="rounded-xl border bg-card p-6 text-card-foreground shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">{describe(state)}</p>
            <p className="text-sm text-muted-foreground">
              Turn the indication off to leave the LED dark regardless of the link.
            </p>
          </div>
          <Toggle
            checked={state?.enabled === true}
            onChange={(next) =>
              setEnabled(next, (m) =>
                shell.ui.notify(`Failed to switch the LED: ${m}`, "error"),
              )
            }
            disabled={state === null || busy}
            label="Show the relay link on the onboard LED"
          />
        </div>
      </div>

      <div className="rounded-xl border bg-card p-6 text-card-foreground shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">State</h2>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <Row label="Indication" value={state ? (state.enabled ? "On" : "Off") : "…"} />
          <Row label="Relay link" value={state ? (state.connected ? "Connected" : "Down") : "…"} />
          <Row label="LED" value={state ? (state.on ? "Lit" : "Dark") : "…"} />
          <Row label="Device" value={shell.device.name} />
        </dl>
        {error && (
          <p className="mt-4 text-sm text-destructive">
            Last poll failed: {error}. Showing the last known state.
          </p>
        )}
        <button
          type="button"
          onClick={refresh}
          className="mt-4 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          Refresh now
        </button>
      </div>

      <p className="text-sm text-muted-foreground">
        This page is a UI module: the firmware declared it in <code>ui modules</code> and
        ships the bundle that draws it. The shell that is rendering it does not know what
        an LED is.
      </p>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono">{value}</dd>
    </div>
  )
}
