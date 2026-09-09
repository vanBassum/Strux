import type { ShellProvider } from "@shell/contract"
import { describe, useLed } from "./led"
import { Toggle } from "./Toggle"

// The dashboard card. What used to be frontend/src/components/LedCard.tsx, now shipped
// by the firmware that owns the LED rather than compiled into the shell — which is the
// whole point of the exercise: the shell has no idea this device has an LED.
export function LedCard({ shell }: { shell: ShellProvider }) {
  const { state, busy, setEnabled } = useLed(shell.transport)

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
