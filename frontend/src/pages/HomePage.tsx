import { useDeviceInfo } from "@/hooks/use-device-info"
import { PreReleaseBadge } from "@/components/PreReleaseBadge"
import { CpuIcon } from "lucide-react"
import { useModuleCards } from "@/shell/ModuleHost"
import type { ReactNode } from "react"

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
}

export default function HomePage() {
  const info = useDeviceInfo()
  // The card slot. Every card here is contributed by firmware — the shell ships none
  // of its own beyond Device Info, so this list is empty on a device with no modules
  // and that is the template's ordinary state.
  const cards = useModuleCards()

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="rounded-xl border bg-card p-6 text-card-foreground shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <CpuIcon className="size-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Device Info</h2>
        </div>

        {!info ? (
          <p className="text-sm text-muted-foreground">Connecting...</p>
        ) : (
          <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
            <Row label="Project" value={info.project} />
            <div className="flex justify-between">
              <span className="text-muted-foreground">Firmware</span>
              <span className="flex items-center gap-2 font-mono">
                {info.firmware}
                <PreReleaseBadge version={info.firmware} />
              </span>
            </div>
            <Row label="ESP-IDF" value={info.idf} />
            <Row label="Compiled" value={`${info.date} ${info.time}`} />
            <Row label="Chip" value={info.chip} />
            <Row label="CPU" value={info.cpu} />
            <Row label="IP address" value={info.ip || "No address"} />
            <Row label="Free heap" value={formatBytes(info.heapFree)} />
            <Row label="Min free heap" value={formatBytes(info.heapMin)} />
            <Row label="Device time" value={info.deviceTime} />
          </div>
        )}
      </div>

      {cards.map((card) => (
        <div key={`${card.moduleId}/${card.id}`}>
          {card.render ? (
            (card.render() as ReactNode)
          ) : card.failure ? (
            <div className="rounded-xl border bg-card p-6 text-sm text-card-foreground shadow-sm">
              <span className="font-mono">{card.moduleId}</span> could not be loaded:{" "}
              {card.failure}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  )
}
