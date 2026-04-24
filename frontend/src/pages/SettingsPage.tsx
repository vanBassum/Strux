import { useEffect, useRef, useState } from "react"
import { backend, type SettingEntry, type WifiNetwork } from "@/lib/backend"
import { useConnectionStatus } from "@/hooks/use-connection-status"
import { SaveIcon, Undo2Icon, PowerIcon, SearchIcon, LockIcon, DownloadIcon, UploadIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

// Group settings by prefix (e.g. "wifi.ssid" → "wifi", "mqtt.broker" → "mqtt")
function groupSettings(settings: SettingEntry[]): { label: string; prefix: string; items: SettingEntry[] }[] {
  const groups = new Map<string, SettingEntry[]>()
  for (const s of settings) {
    const dot = s.key.indexOf(".")
    const prefix = dot > 0 ? s.key.slice(0, dot) : "general"
    if (!groups.has(prefix)) groups.set(prefix, [])
    groups.get(prefix)!.push(s)
  }

  const labels: Record<string, string> = {
    wifi: "WiFi",
    device: "Device",
    mqtt: "MQTT",
    ntp: "Time & NTP",
  }

  return [...groups.entries()].map(([prefix, items]) => ({
    prefix,
    label: labels[prefix] ?? prefix.charAt(0).toUpperCase() + prefix.slice(1),
    items,
  }))
}

// ── Table of contents ────────────────────────────────────────

function SettingsToc({
  groups,
  activePrefix,
}: {
  groups: { label: string; prefix: string }[]
  activePrefix: string | null
}) {
  return (
    <div className="space-y-1">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        On this page
      </p>
      {groups.map((g) => (
        <a
          key={g.prefix}
          href={`#settings-${g.prefix}`}
          onClick={(e) => {
            e.preventDefault()
            document.getElementById(`settings-${g.prefix}`)?.scrollIntoView({ behavior: "smooth" })
          }}
          className={`block rounded-md px-3 py-1.5 text-sm transition-colors hover:text-foreground ${
            activePrefix === g.prefix
              ? "bg-muted font-medium text-foreground"
              : "text-muted-foreground"
          }`}
        >
          {g.label}
        </a>
      ))}
    </div>
  )
}

export default function SettingsPage() {
  const connection = useConnectionStatus()
  const [settings, setSettings] = useState<SettingEntry[]>([])
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [activePrefix, setActivePrefix] = useState<string | null>(null)
  const [search, setSearch] = useState("")

  useEffect(() => {
    if (connection !== "connected") return
    backend.getSettings().then((r) => {
      setSettings(r.settings)
      setDirty(false)
    }).catch(() => {})
  }, [connection])

  useEffect(() => {
    if (settings.length === 0) return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const prefix = (entry.target as HTMLElement).dataset.prefix
            if (prefix) setActivePrefix(prefix)
          }
        }
      },
      { rootMargin: "-20% 0px -70% 0px" },
    )
    document.querySelectorAll<HTMLElement>("[data-prefix]").forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [settings])

  async function handleChange(key: string, value: string) {
    try {
      await backend.setSetting(key, value)
      setSettings((prev) =>
        prev.map((s) =>
          s.key === key
            ? { ...s, value: s.type === "int" ? Number(value) : s.type === "bool" ? value === "true" : value }
            : s,
        ),
      )
      setDirty(true)
    } catch {
      // ignore
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      await backend.saveSettings()
      setDirty(false)
    } catch {
      // ignore
    }
    setSaving(false)
  }

  async function handleReload() {
    try {
      const r = await backend.getSettings()
      setSettings(r.settings)
      setDirty(false)
    } catch {
      // ignore
    }
  }

  function handleExport() {
    const obj: Record<string, unknown> = {}
    for (const s of settings) obj[s.key] = s.value
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "strux-settings.json"
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ""
    try {
      const obj = JSON.parse(await file.text()) as Record<string, unknown>
      for (const [key, value] of Object.entries(obj)) {
        await handleChange(key, String(value))
      }
    } catch {
      // ignore malformed file
    }
  }

  const groups = groupSettings(settings)
  const filteredGroups = search.trim()
    ? groups
        .map((g) => ({
          ...g,
          items: g.items.filter(
            (s) =>
              s.label.toLowerCase().includes(search.toLowerCase()) ||
              s.key.toLowerCase().includes(search.toLowerCase()),
          ),
        }))
        .filter((g) => g.items.length > 0)
    : groups

  return (
    <div className="mx-auto max-w-5xl">
      {/* Sticky header — spans full width */}
      <div className="sticky top-0 z-10 bg-background pb-2">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Settings</h1>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => { if (confirm("Reboot the device?")) backend.send("reboot").catch(() => {}) }}
            >
              <PowerIcon className="mr-1.5 size-3.5" />
              Reboot
            </Button>
            <Button variant="outline" size="sm" onClick={handleReload}>
              <Undo2Icon className="mr-1.5 size-3.5" />
              Undo
            </Button>
            <Button size="sm" onClick={handleSave} disabled={!dirty || saving}>
              <SaveIcon className="mr-1.5 size-3.5" />
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex gap-12">
        {/* Main settings content */}
        <div className="min-w-0 flex-1 space-y-6 py-6">
          {settings.length === 0 ? (
            <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
              <p className="p-6 text-sm text-muted-foreground">Loading...</p>
            </div>
          ) : filteredGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground">No settings match "{search}".</p>
          ) : (
            filteredGroups.map((group) => (
              <div
                key={group.prefix}
                id={`settings-${group.prefix}`}
                data-prefix={group.prefix}
                className="rounded-xl border bg-card text-card-foreground shadow-sm"
              >
                <div className="border-b p-4">
                  <h2 className="text-lg font-semibold">{group.label}</h2>
                </div>
                <ul className="divide-y">
                  {group.items.map((setting) => (
                    <SettingRow
                      key={setting.key}
                      setting={setting}
                      onChange={(value) => handleChange(setting.key, value)}
                    />
                  ))}
                </ul>
              </div>
            ))
          )}

          {dirty && (
            <p className="text-sm text-amber-500">
              You have unsaved changes. Press Save to write them to flash.
            </p>
          )}
        </div>

        {/* Sidebar — only visible on wide screens */}
        {groups.length > 0 && (
          <aside className="hidden w-48 shrink-0 xl:block">
            <div className="sticky top-14 space-y-4 pt-6">
              <div className="relative">
                <SearchIcon className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                <Input
                  className="pl-8 text-sm"
                  placeholder="Search…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={handleExport}>
                  <DownloadIcon className="mr-1.5 size-3.5" />
                  Export
                </Button>
                <label className="flex-1">
                  <Button variant="outline" size="sm" className="w-full" asChild>
                    <span>
                      <UploadIcon className="mr-1.5 size-3.5" />
                      Import
                    </span>
                  </Button>
                  <input type="file" accept=".json" className="hidden" onChange={handleImport} />
                </label>
              </div>

              <SettingsToc groups={filteredGroups} activePrefix={activePrefix} />
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}

// ── Setting row ──────────────────────────────────────────────

const sensitiveKeys = ["password", "pass"]

function isSensitive(key: string): boolean {
  const field = key.split(".").pop() ?? ""
  return sensitiveKeys.includes(field)
}

function SettingRow({
  setting,
  onChange,
}: {
  setting: SettingEntry
  onChange: (value: string) => void
}) {
  const isWifiSsid = setting.key === "wifi.ssid"
  const isPassword = setting.type === "string" && isSensitive(setting.key)

  return (
    <li className="flex items-center justify-between gap-4 p-4">
      <div className="min-w-0">
        <div className="text-sm font-medium">{setting.label}</div>
        <div className="font-mono text-xs text-muted-foreground">{setting.key}</div>
      </div>

      {setting.type === "bool" ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onChange(setting.value ? "false" : "true")}
        >
          {setting.value ? "On" : "Off"}
        </Button>
      ) : isWifiSsid ? (
        <WifiSsidInput value={String(setting.value)} onChange={onChange} />
      ) : (
        <Input
          className="w-48"
          type={isPassword ? "password" : setting.type === "int" ? "number" : "text"}
          defaultValue={String(setting.value)}
          onBlur={(e) => {
            if (e.target.value !== String(setting.value)) {
              onChange(e.target.value)
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              ;(e.target as HTMLInputElement).blur()
            }
          }}
        />
      )}
    </li>
  )
}

// ── WiFi SSID input with scan ────────────────────────────────

function rssiToStrength(rssi: number): number {
  if (rssi >= -50) return 4
  if (rssi >= -60) return 3
  if (rssi >= -70) return 2
  return 1
}

function WifiSsidInput({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [showScan, setShowScan] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [networks, setNetworks] = useState<WifiNetwork[]>([])

  async function handleScan() {
    setShowScan(true)
    setScanning(true)
    setNetworks([])
    try {
      const result = await backend.wifiScan()
      if (result.ok) {
        // Deduplicate by SSID, keeping strongest signal
        const best = new Map<string, WifiNetwork>()
        for (const n of result.networks) {
          if (!n.ssid) continue
          const existing = best.get(n.ssid)
          if (!existing || n.rssi > existing.rssi) {
            best.set(n.ssid, n)
          }
        }
        setNetworks([...best.values()].sort((a, b) => b.rssi - a.rssi))
      }
    } catch {
      // ignore
    }
    setScanning(false)
  }

  function selectNetwork(ssid: string) {
    setShowScan(false)
    onChange(ssid)
    if (inputRef.current) {
      inputRef.current.value = ssid
    }
  }

  return (
    <div className="relative">
      <div className="flex gap-1.5">
        <Button
          variant="outline"
          size="icon-sm"
          onClick={handleScan}
          disabled={scanning}
          title="Scan WiFi networks"
        >
          <SearchIcon className="size-3.5" />
        </Button>
        <Input
          ref={inputRef}
          className="w-48"
          defaultValue={value}
          onBlur={(e) => {
            if (e.target.value !== value) {
              onChange(e.target.value)
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              ;(e.target as HTMLInputElement).blur()
            }
          }}
        />
      </div>

      {showScan && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowScan(false)} />
          <div className="absolute right-0 top-full z-50 mt-1 w-72 rounded-lg border bg-card p-2 shadow-lg">
            <div className="mb-2 flex items-center justify-between px-2">
              <span className="text-xs font-medium text-muted-foreground">WiFi Networks</span>
              <Button variant="ghost" size="xs" onClick={handleScan} disabled={scanning}>
                {scanning ? "Scanning..." : "Rescan"}
              </Button>
            </div>

            {scanning && networks.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs text-muted-foreground">Scanning...</p>
            ) : networks.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs text-muted-foreground">No networks found</p>
            ) : (
              <div className="max-h-60 overflow-y-auto">
                {networks.map((n) => (
                  <button
                    key={`${n.ssid}-${n.channel}`}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                    onClick={() => selectNetwork(n.ssid)}
                  >
                    <SignalBars strength={rssiToStrength(n.rssi)} />
                    <span className="min-w-0 flex-1 truncate">{n.ssid}</span>
                    <span className="text-xs text-muted-foreground">ch{n.channel}</span>
                    {n.secure && <LockIcon className="size-3 text-muted-foreground" />}
                    <span className="w-10 text-right text-xs text-muted-foreground">{n.rssi}dB</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function SignalBars({ strength }: { strength: number }) {
  return (
    <div className="flex items-end gap-px" title={`Signal: ${strength}/4`}>
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className={`w-1 rounded-sm ${i <= strength ? "bg-foreground" : "bg-muted"}`}
          style={{ height: `${4 + i * 3}px` }}
        />
      ))}
    </div>
  )
}
