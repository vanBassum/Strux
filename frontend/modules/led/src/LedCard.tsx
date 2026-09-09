import type { ShellProvider } from "@shell/contract"
import { describe, useLed } from "./led"
import { Toggle } from "./Toggle"

// The LED, whole, as one home-screen card.
//
// This was two components — a small card and a fuller page behind its own sidebar
// entry — and the page has gone. Everything it had is here: the control, the state
// readout, and a manual refresh. A device whose one feature is an LED should open on
// the LED, and a nav entry beside Home leading to the same two controls was a second
// door into one room. A module with genuinely more to show than a card can hold still
// declares a UiPage; this one never had that much.
//
// What used to be frontend/src/components/LedCard.tsx, now shipped by the firmware
// that owns the LED rather than compiled into the shell — which is the whole point of
// the exercise: the shell has no idea this device has an LED.
export function LedCard({ shell }: { shell: ShellProvider }) {
  const { state, busy, error, setEnabled, refresh } = useLed(shell.transport)

  return (
    <div className="rounded-xl border bg-card p-6 text-card-foreground shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Bulb lit={state?.on === true} />
        <h2 className="text-lg font-semibold">Onboard LED</h2>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium">{describe(state)}</p>
          <p className="text-sm text-muted-foreground">
            The board LED is lit while the device is connected to its relay server.
            Turn the indication off to leave it dark regardless of the link.
          </p>
        </div>
        <Toggle
          checked={state?.enabled === true}
          onChange={(next) =>
            setEnabled(next, (m) => shell.ui.notify(`Failed to switch the LED: ${m}`, "error"))
          }
          disabled={state === null || busy}
          label="Show the relay link on the onboard LED"
        />
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-3 border-t pt-4 text-sm">
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

// The icon is drawn here rather than imported: pulling lucide into a module bundle
// would ship a second copy of it beside the shell's, and the manifest promises one
// self-contained file.
export function Bulb({ lit }: { lit: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`size-5 ${lit ? "text-primary" : "text-muted-foreground"}`}
      aria-hidden="true"
    >
      <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
      <path d="M9 18h6" />
      <path d="M10 22h4" />
    </svg>
  )
}
