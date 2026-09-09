import { useEffect, useRef, useState } from "react"
import type { ShellProvider } from "@shell/contract"
import { Button, Field, Panel } from "../../_ui"
import { errorMessage } from "../../_ui/activate"

// The device's partitions, and writing one.
//
// This module is why the contract grew `upload` and `download`. Reading a partition
// table is an ordinary command; writing an image is not — it is a SESSION, an envelope
// followed by the bytes, with one reply at the end — and reading one back is the same
// shape in reverse. Neither fits `request`, so the shape had to become part of the
// contract rather than something only a shell could do.
//
// Everything about the flash layout comes from `partition list`, `uploadable`
// included. Nothing here reproduces the device's rules about which slot may be
// written: it already refuses to overwrite the one it is running from, and a copy of
// that logic in a browser is how the two come to disagree.

interface Partition {
  label: string
  type: string
  subtype: string
  offset: number
  size: number
  running: boolean
  nextOta: boolean
  uploadable: boolean
  version: string
}

interface Status {
  firmware?: string
  running?: string
  nextSlot?: string
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

export function FirmwarePage({ shell }: { shell: ShellProvider }) {
  const [status, setStatus] = useState<Status | null>(null)
  const [partitions, setPartitions] = useState<Partition[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    setBusy(true)
    try {
      setStatus(await shell.transport.request<Status>("partition status"))
      const reply = await shell.transport.request<{ partitions?: Partition[] }>(
        "partition list",
      )
      setPartitions(reply?.partitions ?? [])
      setError(null)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shell])

  if (error && !partitions)
    return (
      <div className="mx-auto max-w-3xl space-y-3">
        <Panel>{error}</Panel>
        <Button variant="outline" onClick={() => void load()}>
          Try again
        </Button>
      </div>
    )

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Firmware</h1>
          <p className="text-muted-foreground text-sm">
            Whatever this device says its flash looks like — from{" "}
            <code>partition status</code> and <code>partition list</code>.
          </p>
        </div>
        <Button variant="outline" disabled={busy} onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      {status && (
        <Panel>
          <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
            <Field label="Firmware" value={status.firmware ?? "—"} />
            <Field label="Running slot" value={status.running ?? "—"} />
            <Field label="Next OTA slot" value={status.nextSlot ?? "—"} />
          </dl>
        </Panel>
      )}

      {!partitions ? (
        <Panel>Reading the partition table…</Panel>
      ) : (
        <div className="divide-y rounded-xl border">
          {partitions.map((partition) => (
            <PartitionRow
              key={partition.label}
              partition={partition}
              shell={shell}
              onChanged={() => void load()}
            />
          ))}
        </div>
      )}

      <p className="text-muted-foreground text-sm">
        An app image is erased, written and then activated, in that order — and only
        activated once every byte landed. Until then the old slot still boots, so a
        failed upload leaves the device running exactly what it was running before.
      </p>
    </div>
  )
}

function PartitionRow({
  partition,
  shell,
  onChanged,
}: {
  partition: Partition
  shell: ShellProvider
  onChanged: () => void
}) {
  const picker = useRef<HTMLInputElement | null>(null)
  const [progress, setProgress] = useState<{ what: string; fraction: number } | null>(
    null,
  )

  const busy = progress !== null

  const upload = async (file: File) => {
    try {
      // The sequence lives HERE, not in the transport and not in the relay: erase,
      // write, activate is partition policy, and the only place that knows about
      // partitions is this module. A transport that erased on your behalf would be a
      // transport with opinions about firmware.
      setProgress({ what: `Erasing ${partition.label}`, fraction: 0 })
      requireOk(await shell.transport.request("partition clear", { partition: partition.label }))

      setProgress({ what: `Writing ${partition.label}`, fraction: 0 })
      requireOk(
        await shell.transport.upload(
          "partition write",
          { partition: partition.label },
          file,
          (fraction) => setProgress({ what: `Writing ${partition.label}`, fraction }),
        ),
      )

      // Only app images are activated. `partition activate` validates an app image,
      // so calling it on a data partition would turn a good write into an error.
      if (partition.type === "app") {
        setProgress({ what: `Activating ${partition.label}`, fraction: 1 })
        requireOk(
          await shell.transport.request("partition activate", {
            partition: partition.label,
          }),
        )
      }

      shell.ui.notify(
        partition.type === "app"
          ? `${partition.label} written and set as the boot slot.`
          : `${partition.label} written.`,
        "success",
      )
      onChanged()
    } catch (e) {
      shell.ui.notify(`Upload to ${partition.label} failed: ${errorMessage(e)}`, "error")
    } finally {
      setProgress(null)
    }
  }

  const download = async () => {
    try {
      setProgress({ what: `Reading ${partition.label}`, fraction: 0 })
      const blob = await shell.transport.download(
        "partition read",
        { partition: partition.label },
        partition.size,
        (fraction) => setProgress({ what: `Reading ${partition.label}`, fraction }),
      )
      // Handing the user a file is the one thing the transport deliberately does not
      // do, because it is a host concern. Here it is an anchor.
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = `${partition.label}.bin`
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      shell.ui.notify(
        `Reading ${partition.label} failed: ${errorMessage(e)}`,
        "error",
      )
    } finally {
      setProgress(null)
    }
  }

  return (
    <div className="p-4">
      <input
        ref={picker}
        type="file"
        accept=".bin"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          // Cleared so choosing the same file twice still fires a change.
          event.target.value = ""
          if (file) void upload(file)
        }}
      />

      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono font-medium">{partition.label}</span>
            {partition.running && <Tag tone="running">running</Tag>}
            {partition.nextOta && <Tag tone="next">next OTA</Tag>}
            {partition.version && (
              <span className="text-muted-foreground font-mono text-xs">
                v{partition.version}
              </span>
            )}
          </div>
          <div className="text-muted-foreground mt-0.5 font-mono text-xs">
            {partition.type}/{partition.subtype} · 0x{partition.offset.toString(16)} ·{" "}
            {formatBytes(partition.size)}
          </div>
        </div>

        <div className="flex shrink-0 gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!partition.uploadable || busy}
            title={
              partition.uploadable
                ? undefined
                : partition.running
                  ? "The device is running from this slot"
                  : "The device does not offer this partition for upload"
            }
            onClick={() => picker.current?.click()}
          >
            Upload
          </Button>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void download()}>
            Download
          </Button>
        </div>
      </div>

      {progress && (
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-xs">
            <span>{progress.what}…</span>
            <span className="font-mono">{Math.round(progress.fraction * 100)}%</span>
          </div>
          <div className="bg-muted h-1.5 overflow-hidden rounded-full">
            <div
              className="bg-primary h-full transition-[width]"
              style={{ width: `${Math.round(progress.fraction * 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

/// The partition commands answer `{"ok":false,"error":…}` rather than refusing the
/// session, so a failure arrives as a SUCCESSFUL reply. Missed, an upload reports
/// success and the device goes on booting the old image.
function requireOk(reply: unknown): void {
  const r = reply as { ok?: boolean; error?: string } | null
  if (r && r.ok === false) throw new Error(r.error ?? "the device refused it")
}

function Tag({ tone, children }: { tone: "running" | "next"; children: string }) {
  return (
    <span
      className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
        tone === "running"
          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
          : "bg-sky-500/15 text-sky-700 dark:text-sky-400"
      }`}
    >
      {children}
    </span>
  )
}
