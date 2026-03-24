import { useEffect, useRef, useState } from "react"
import { backend, type SettingEntry, type WifiNetwork } from "@/lib/backend"
import { useConnectionStatus } from "@/hooks/use-connection-status"
import { SettingsIcon, SaveIcon, RotateCcwIcon, PowerIcon, SearchIcon, LockIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export default function SettingsPage() {
  const connection = useConnectionStatus()
  const [settings, setSettings] = useState<SettingEntry[]>([])
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (connection !== "connected") return
    backend.getSettings().then((r) => {
      setSettings(r.settings)
      setDirty(false)
    }).catch(() => {})
  }, [connection])

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

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Settings</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleReload}>
            <RotateCcwIcon className="mr-1.5 size-3.5" />
            Reload
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!dirty || saving}>
            <SaveIcon className="mr-1.5 size-3.5" />
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-6 text-card-foreground shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <SettingsIcon className="size-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Configuration</h2>
        </div>

        {settings.length === 0 ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : (
          <div className="space-y-4">
            {settings.map((setting) => (
              <SettingRow
                key={setting.key}
                setting={setting}
                onChange={(value) => handleChange(setting.key, value)}
              />
            ))}
          </div>
        )}
      </div>

      {dirty && (
        <p className="text-sm text-amber-500">
          You have unsaved changes. Press Save to write them to flash.
        </p>
      )}

      <div className="rounded-xl border border-red-500/20 bg-card p-6 text-card-foreground shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Reboot Device</h2>
            <p className="text-sm text-muted-foreground">Restart the device. Unsaved settings will be lost.</p>
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              if (confirm("Reboot the device?")) {
                backend.send("reboot").catch(() => {})
              }
            }}
          >
            <PowerIcon className="mr-1.5 size-3.5" />
            Reboot
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Setting row ──────────────────────────────────────────────

function SettingRow({
  setting,
  onChange,
}: {
  setting: SettingEntry
  onChange: (value: string) => void
}) {
  const isWifiSsid = setting.key === "wifi.ssid"

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="text-sm font-medium">{setting.label}</div>
        <div className="text-xs text-muted-foreground font-mono">{setting.key}</div>
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
          type={setting.type === "int" ? "number" : "text"}
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
    </div>
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
