import { useEffect, useMemo, useRef, useState } from "react"
import type { DeviceTransport, ShellProvider } from "@shell/contract"
import {
  BracesIcon,
  LockIcon,
  PowerIcon,
  SaveIcon,
  SearchIcon,
  Undo2Icon,
} from "lucide-react"
import { Button, Input, Modal, Panel, Switch } from "../../_ui"
import { errorMessage } from "../../_ui/activate"

// Every setting the device declares, edited.
//
// `settings list` describes itself — key, label, type, value — so this page is
// generated rather than written per product. Which is exactly why it is a FRAMEWORK
// module: the shape is the framework's, the contents are the device's, and no shell
// needs to know either.
//
// One thing deliberately dropped in the move from a shell page to a module: the JSON
// editor's syntax highlighting. It was prismjs, and a module bundle lives in a flash
// partition where 30 KB of colouring is 30 KB of flash. The bulk-edit feature itself
// is still here on a plain textarea, which is the part that was actually useful.

type SettingValue = string | number | boolean

interface SettingEntry {
  key: string
  label: string
  type: string
  value: SettingValue
}

interface WifiNetwork {
  ssid: string
  rssi: number
  channel: number
  secure: boolean
}

const NUMERIC = new Set(["int8", "uint8", "int16", "uint16", "int32", "uint32", "int64", "uint64", "float", "double"])

/// Which values not to render in clear text.
///
/// A heuristic on the key, and a mitigation rather than a fix: the device sends these
/// in the clear because `settings list` has no notion of a secret yet. Masking stops a
/// token being read over a shoulder; it does not stop it being in the reply.
function isSecret(key: string): boolean {
  return /password|token|secret|key$/i.test(key)
}

const GROUP_LABELS: Record<string, string> = {
  wifi: "Wi-Fi",
  web: "Web interface",
  relay: "Relay",
  telem: "Telemetry",
  ntp: "Time & NTP",
  led: "LED",
  device: "Device",
  net: "Network",
}

function groupLabel(prefix: string): string {
  return GROUP_LABELS[prefix] ?? prefix.charAt(0).toUpperCase() + prefix.slice(1)
}

/// Sent as a string whatever the declared type: `settings set` takes a string value
/// and the device parses it against the setting's own type, which is the only place
/// that knows the range. A bool has to be "1"/"0" rather than "true"/"false".
function wireValue(value: SettingValue): string {
  return typeof value === "boolean" ? (value ? "1" : "0") : String(value)
}

export function SettingsPage({ shell }: { shell: ShellProvider }) {
  const [entries, setEntries] = useState<SettingEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [edits, setEdits] = useState<Record<string, SettingValue>>({})
  const [revealed, setRevealed] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState("")

  const [jsonOpen, setJsonOpen] = useState(false)
  const [jsonText, setJsonText] = useState("")
  const [jsonError, setJsonError] = useState("")

  const [rebootOpen, setRebootOpen] = useState(false)
  const [wifiOpen, setWifiOpen] = useState(false)

  const load = async (transport: DeviceTransport) => {
    try {
      const reply = await transport.request<{ settings?: SettingEntry[] }>("settings list")
      setEntries(reply?.settings ?? [])
      setEdits({})
      setError(null)
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  useEffect(() => {
    void load(shell.transport)
  }, [shell])

  const groups = useMemo(() => {
    if (!entries) return []
    const needle = search.trim().toLowerCase()
    const byPrefix = new Map<string, SettingEntry[]>()
    for (const entry of entries) {
      if (
        needle &&
        !entry.key.toLowerCase().includes(needle) &&
        !entry.label.toLowerCase().includes(needle)
      )
        continue
      const dot = entry.key.indexOf(".")
      const prefix = dot > 0 ? entry.key.slice(0, dot) : "general"
      if (!byPrefix.has(prefix)) byPrefix.set(prefix, [])
      byPrefix.get(prefix)!.push(entry)
    }
    return [...byPrefix.entries()]
      .map(([prefix, items]) => ({ prefix, label: groupLabel(prefix), items }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [entries, search])

  const dirty = Object.keys(edits)

  const save = async () => {
    setSaving(true)
    try {
      // One `settings set` per changed key, then a single `settings save`. Sequential,
      // and not for tidiness: each takes the device's single in-flight pipe, so firing
      // them together would only queue — and a failure halfway would leave no way to
      // say which key it was.
      for (const key of dirty)
        await shell.transport.request("settings set", { key, value: wireValue(edits[key]) })
      await shell.transport.request("settings save")
      shell.ui.notify(
        dirty.length === 1 ? `Saved ${dirty[0]}.` : `Saved ${dirty.length} settings.`,
        "success",
      )
      // Re-read rather than trusting the writes: the device coerces values, and what
      // it kept is the only thing worth showing.
      await load(shell.transport)
    } catch (e) {
      shell.ui.notify(errorMessage(e), "error")
    } finally {
      setSaving(false)
    }
  }

  const applyJson = async () => {
    let parsed: Record<string, SettingValue>
    try {
      parsed = JSON.parse(jsonText)
    } catch (e) {
      setJsonError(errorMessage(e))
      return
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      setJsonError("Expected an object of key → value.")
      return
    }
    // Only keys the device actually declares. A typo would otherwise be sent and
    // silently refused one key at a time.
    const known = new Set((entries ?? []).map((e) => e.key))
    const unknown = Object.keys(parsed).filter((k) => !known.has(k))
    if (unknown.length > 0) {
      setJsonError(`Not settings on this device: ${unknown.join(", ")}`)
      return
    }
    setJsonError("")
    setJsonOpen(false)
    setEdits((current) => ({ ...current, ...parsed }))
  }

  if (error && !entries)
    return (
      <div className="mx-auto max-w-3xl space-y-3">
        <Panel>{error}</Panel>
        <Button variant="outline" onClick={() => void load(shell.transport)}>
          Try again
        </Button>
      </div>
    )

  return (
    // Two columns from `lg` up: the settings themselves, and the section rail the
    // shell-page version had. `items-start` so the rail can stick rather than
    // stretch, and the whole thing collapses to one column below `lg`, where the
    // rail would cost more width than it earns.
    <div className="mx-auto flex max-w-6xl items-start gap-8">
      <div className="min-w-0 flex-1 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Settings</h1>
            <p className="text-muted-foreground text-sm">
              Whatever this firmware declares — the page is generated from{" "}
              <code>settings list</code>.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setJsonText(
                  JSON.stringify(
                    Object.fromEntries(
                      (entries ?? []).map((e) => [e.key, e.key in edits ? edits[e.key] : e.value]),
                    ),
                    null,
                    2,
                  ),
                )
                setJsonError("")
                setJsonOpen(true)
              }}
            >
              <BracesIcon />
              Edit as JSON
            </Button>
            <Button variant="outline" onClick={() => setRebootOpen(true)}>
              <PowerIcon />
              Reboot
            </Button>
            <Button
              variant="outline"
              disabled={dirty.length === 0 || saving}
              onClick={() => setEdits({})}
            >
              <Undo2Icon />
              Revert
            </Button>
            <Button disabled={dirty.length === 0 || saving} onClick={() => void save()}>
              <SaveIcon />
              {saving ? "Saving…" : dirty.length > 0 ? `Save ${dirty.length}` : "Save"}
            </Button>
          </div>
        </div>

        <div className="relative">
          <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
          <Input
            className="pl-8"
            placeholder="Filter settings…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        {dirty.length > 0 && (
          <p className="text-sm text-amber-600 dark:text-amber-500">
            Unsaved changes — press Save to write to flash.
          </p>
        )}

        {!entries ? (
          <Panel>Reading the device…</Panel>
        ) : groups.length === 0 ? (
          <Panel>Nothing matches “{search}”.</Panel>
        ) : (
          groups.map((group) => (
            <Panel
              key={group.prefix}
              id={`settings-${group.prefix}`}
              title={group.label}
              className="scroll-mt-2"
              flush
            >
              <ul className="divide-border divide-y">
                {group.items.map((entry) => {
                  const current = entry.key in edits ? edits[entry.key] : entry.value
                  const changed = entry.key in edits
                  const secret = isSecret(entry.key)

                  return (
                    <li
                      key={entry.key}
                      className="flex items-center justify-between gap-4 p-4"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-sm">
                          {secret && <LockIcon className="text-muted-foreground size-3.5 shrink-0" />}
                          <span className={changed ? "font-medium" : undefined}>
                            {entry.label || entry.key}
                          </span>
                        </div>
                        <div className="text-muted-foreground font-mono text-xs">
                          {entry.key}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        {entry.key === "wifi.ssid" && (
                          <Button variant="ghost" size="sm" onClick={() => setWifiOpen(true)}>
                            Scan
                          </Button>
                        )}
                        {entry.type === "bool" ? (
                          <Switch
                            checked={current === true || current === 1 || current === "1"}
                            onChange={(next) => setEdits((e) => ({ ...e, [entry.key]: next }))}
                            label={entry.label || entry.key}
                          />
                        ) : (
                          <Input
                            className="w-56"
                            inputMode={NUMERIC.has(entry.type) ? "numeric" : undefined}
                            // Masked until focused, per field rather than page-wide:
                            // revealing every secret to see one is what masking was for.
                            type={secret && !revealed[entry.key] ? "password" : "text"}
                            value={String(current ?? "")}
                            onFocus={() =>
                              secret && setRevealed((r) => ({ ...r, [entry.key]: true }))
                            }
                            onChange={(event) =>
                              setEdits((e) => ({ ...e, [entry.key]: event.target.value }))
                            }
                          />
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </Panel>
          ))
        )}

        <Modal
          open={jsonOpen}
          onClose={() => setJsonOpen(false)}
          title="Edit as JSON"
          footer={
            <>
              <Button variant="outline" onClick={() => setJsonOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => void applyJson()}>Apply</Button>
            </>
          }
        >
          <p className="text-muted-foreground mb-2">
            Applied as pending edits, not written — Save still has to be pressed.
          </p>
          <textarea
            className="border-input bg-background h-64 w-full rounded-md border p-2 font-mono text-xs"
            spellCheck={false}
            value={jsonText}
            onChange={(event) => setJsonText(event.target.value)}
          />
          {jsonError && <p className="text-destructive mt-2">{jsonError}</p>}
        </Modal>

        <RebootModal open={rebootOpen} onClose={() => setRebootOpen(false)} shell={shell} />
        <WifiModal
          open={wifiOpen}
          onClose={() => setWifiOpen(false)}
          shell={shell}
          onPick={(ssid) => {
            setEdits((e) => ({ ...e, "wifi.ssid": ssid }))
            setWifiOpen(false)
          }}
        />
      </div>

      {/* Sections, in the order they are rendered. Built from the same `groups`
          the page renders, so it cannot list a section that is not there — and it
          follows the filter, which is why it is not a static list of prefixes. */}
      {/* `max-lg:hidden`, NOT `hidden lg:block`. A module's stylesheet is adopted
          ahead of the shell's so it loses every tie (see _ui/activate.ts), which
          means the shell's plain `.hidden` outranks a module's `.lg:block` and an
          element written that way is hidden at EVERY width. One utility carrying
          its own media query has nothing to be overridden by. */}
      <aside className="sticky top-0 w-48 shrink-0 max-lg:hidden">
        <p className="text-muted-foreground mb-3 px-3 text-xs font-semibold tracking-wider uppercase">
          On this page
        </p>
        <nav className="space-y-0.5">
          {groups.map((group) => (
            <button
              key={group.prefix}
              type="button"
              className="text-muted-foreground hover:bg-muted hover:text-foreground block w-full truncate rounded-md px-3 py-1.5 text-left text-sm transition-colors"
              onClick={() =>
                document
                  .getElementById(`settings-${group.prefix}`)
                  ?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
            >
              {group.label}
            </button>
          ))}
        </nav>
      </aside>
    </div>
  )
}

function RebootModal({
  open,
  onClose,
  shell,
}: {
  open: boolean
  onClose: () => void
  shell: ShellProvider
}) {
  const [going, setGoing] = useState(false)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Reboot the device?"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={going}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={going}
            onClick={() => {
              setGoing(true)
              // No reply is expected: the device reboots, which drops the connection
              // mid-request. So the rejection this produces is the SUCCESS case and
              // is swallowed on purpose.
              shell.transport.request("system reboot").catch(() => {})
              shell.ui.notify("Rebooting — it will reconnect on its own.")
              setTimeout(() => {
                setGoing(false)
                onClose()
              }, 800)
            }}
          >
            Reboot
          </Button>
        </>
      }
    >
      Unsaved changes are lost. Anything already saved survives — settings live in NVS.
    </Modal>
  )
}

function WifiModal({
  open,
  onClose,
  shell,
  onPick,
}: {
  open: boolean
  onClose: () => void
  shell: ShellProvider
  onPick: (ssid: string) => void
}) {
  const [networks, setNetworks] = useState<WifiNetwork[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)

  useEffect(() => {
    if (!open) {
      started.current = false
      setNetworks(null)
      setError(null)
      return
    }
    if (started.current) return
    started.current = true
    shell.transport
      .request<{ networks?: WifiNetwork[] }>("wifi scan")
      .then((reply) => setNetworks(reply?.networks ?? []))
      .catch((e) => setError(errorMessage(e)))
  }, [open, shell])

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nearby networks"
      footer={
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      }
    >
      {error ? (
        <p className="text-destructive">{error}</p>
      ) : !networks ? (
        <p className="text-muted-foreground">
          Scanning — this takes a few seconds and the device stops serving while it
          does.
        </p>
      ) : networks.length === 0 ? (
        <p className="text-muted-foreground">Nothing found.</p>
      ) : (
        <ul className="max-h-64 space-y-1 overflow-auto">
          {[...networks]
            .sort((a, b) => b.rssi - a.rssi)
            .map((network) => (
              <li key={`${network.ssid}/${network.channel}`}>
                <button
                  type="button"
                  className="hover:bg-muted flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left"
                  onClick={() => onPick(network.ssid)}
                >
                  <span className="truncate">
                    {network.ssid || <em className="text-muted-foreground">(hidden)</em>}
                  </span>
                  <span className="text-muted-foreground shrink-0 font-mono text-xs">
                    {network.secure ? "🔒 " : ""}
                    {network.rssi} dBm · ch {network.channel}
                  </span>
                </button>
              </li>
            ))}
        </ul>
      )}
    </Modal>
  )
}

