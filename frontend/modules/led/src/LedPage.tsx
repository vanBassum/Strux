import type { ShellProvider } from "@shell/contract"
import { Button, Field, Panel, Switch } from "../../_ui"
import { describe, useLed } from "./led"

// The LED, as one page.
//
// It has been a card, then a card with the page's contents folded into it, and is now
// a page again — and the reason is worth writing down, because the shape kept moving
// while the intent did not. The intent was always "a device's main feature is the
// screen you land on". What changed is who provides that screen: the shell used to,
// with a home page that hosted contributed cards, and it no longer provides any page
// under a device at all. So the landing screen is simply the first page the manifest
// declares — this one — and cards had nowhere left to render.
//
// The shell rendering this does not know what an LED is, which is the whole exercise.
export function LedPage({ shell }: { shell: ShellProvider }) {
  const { state, busy, error, setEnabled, refresh } = useLed(shell.transport)

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Bulb lit={state?.on === true} />
        <h1 className="text-2xl font-bold">LED</h1>
      </div>

      <Panel>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">{describe(state)}</p>
            <p className="text-muted-foreground text-sm">
              The board LED is lit while the device is connected to its relay server.
              Turn the indication off to leave it dark regardless of the link.
            </p>
          </div>
          <Switch
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
      </Panel>

      <Panel title="State">
        <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <Field label="Indication" value={state ? (state.enabled ? "On" : "Off") : "…"} />
          <Field
            label="Relay link"
            value={state ? (state.connected ? "Connected" : "Down") : "…"}
          />
          <Field label="LED" value={state ? (state.on ? "Lit" : "Dark") : "…"} />
          <Field label="Device" value={shell.device.name} />
        </dl>

        {error && (
          <p className="text-destructive mt-4 text-sm">
            Last poll failed: {error}. Showing the last known state.
          </p>
        )}

        <Button variant="outline" className="mt-4" onClick={refresh}>
          Refresh now
        </Button>
      </Panel>

      <p className="text-muted-foreground text-sm">
        This page is a UI module: the firmware declared it in <code>ui modules</code>{" "}
        and ships the bundle that draws it. The shell rendering it does not know what an
        LED is.
      </p>
    </div>
  )
}

// Drawn here rather than imported: pulling lucide into a module bundle would ship a
// second copy of it beside the shell's, and the manifest promises one self-contained
// file.
export function Bulb({ lit }: { lit: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`size-6 ${lit ? "text-primary" : "text-muted-foreground"}`}
      aria-hidden="true"
    >
      <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
      <path d="M9 18h6" />
      <path d="M10 22h4" />
    </svg>
  )
}
