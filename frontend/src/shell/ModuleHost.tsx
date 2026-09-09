// The host side of the module contract: read the manifest, check the version, import
// a bundle when its page is opened, hand it a ShellProvider, and match what it
// registered against what the firmware declared.
//
// The order matters and is the point of the design: the manifest is a *command*, so
// navigation is drawn from it before any module code has been fetched. A bundle is
// imported only when one of its pages or cards is actually needed.

import { useCallback, useEffect, useSyncExternalStore, type ReactNode } from "react"
import { HOST_API, type ManifestModule, type ShellProvider, type UiManifest } from "@shell/contract"
import { backend } from "@/lib/backend"
import { deviceTransport } from "@/shell/device-client"
import { useConnectionStatus } from "@/hooks/use-connection-status"
import { useDeviceInfo } from "@/hooks/use-device-info"
import * as registry from "@/shell/module-registry"
import { toast } from "sonner"

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/// Subscribe a component to everything the registry knows.
function useRegistry() {
  return useSyncExternalStore(registry.subscribe, registry.getVersion)
}

// ── Reading the manifest ──────────────────────────────────────────────────────

/// One read per connection, shared by every caller. Any refusal means "this device has
/// no modules", which is the mixed-fleet case and not a failure — see §7 of the design.
///
/// Deduplicated across callers AND across React's remounts, which is worth the six
/// lines. Two components ask (the sidebar and the home screen), and in development
/// StrictMode mounts each one twice — so the naive version issued FOUR reads of the
/// same manifest, three of whose results were thrown away by the cleanup that had
/// already run. Each one is a round trip that queues behind every other command on the
/// device's single in-flight pipe, which is why the home screen took seconds to fill
/// in on a dev server and why the wasted reads were worth noticing rather than
/// tolerating.
///
/// Keyed on nothing: there is one device on the other end of this socket, so one
/// in-flight read is the whole state. Cleared when the connection drops, because the
/// answer belongs to that connection — a device may have been reflashed before the
/// next one.
let manifestRead: Promise<void> | null = null

export function useManifest() {
  const connection = useConnectionStatus()
  useRegistry()

  useEffect(() => {
    if (connection !== "connected") {
      // A dropped connection invalidates the answer, not just the request in flight.
      manifestRead = null
      return
    }
    if (manifestRead) return

    manifestRead = backend
      .send<UiManifest>("ui modules")
      .then((manifest) => {
        // No `cancelled` guard, and its absence is the point: the result goes into the
        // registry, which outlives any one component, and every caller reads it from
        // there. Discarding a reply because the component that happened to ask for it
        // has re-rendered is what made three of four reads pointless.
        const range = manifest?.hostApi
        if (!range || typeof range.min !== "number" || typeof range.max !== "number") {
          registry.setAbsent()
          return
        }
        if (HOST_API < range.min || HOST_API > range.max) {
          registry.setUnsupported(
            `This device's UI needs host API ${range.min}–${range.max}; this page speaks ${HOST_API}.`,
          )
          return
        }
        registry.setManifest(manifest)
      })
      .catch(() => {
        // Rejected, unknown command, or timed out — all of them mean the same thing
        // to a shell, and none of them is worth a toast.
        registry.setAbsent()
      })
  }, [connection])

  return {
    status: registry.getStatus(),
    detail: registry.getDetail(),
    manifest: registry.getManifest(),
  }
}

// ── Activating a bundle ───────────────────────────────────────────────────────

function buildShell(mod: ManifestModule, deviceId: string, deviceName: string): ShellProvider {
  return {
    hostApi: HOST_API,
    device: { id: deviceId, name: deviceName },
    transport: deviceTransport,
    routes: {
      register(page) {
        // Registered but not declared is ignored, because honouring it would make
        // navigation depend on running module code — the property the manifest
        // exists to protect.
        if (!mod.pages.some((p) => p.id === page.id)) {
          console.warn(
            `[modules] "${mod.id}" registered page "${page.id}", which its manifest does not declare — ignored`,
          )
          return
        }
        registry.registerPage(page)
      },
    },
    ui: {
      notify(message, kind) {
        if (kind === "error") toast.error(message)
        else if (kind === "success") toast.success(message)
        else toast(message)
      },
    },
  }
}

// One import per module id, deduplicated across the sidebar and the page so a card
// and a page from the same bundle do not fetch it twice.
const inFlight = new Map<string, Promise<void>>()

function activate(mod: ManifestModule, deviceId: string, deviceName: string): Promise<void> {
  const existing = inFlight.get(mod.id)
  if (existing) return existing

  // `entry` is an absolute path from the firmware, and it is resolved against the
  // document's own origin and mount point — so it works at the device root and under
  // the relay's /devices/<id>/ prefix without the firmware knowing either. The leading
  // slash is stripped for exactly that reason: it must stay relative to the mount.
  const dir = window.location.pathname.replace(/[^/]*$/, "")
  const url = `${dir}${mod.entry.replace(/^\//, "")}`

  const p = (async () => {
    const bundle = (await import(/* @vite-ignore */ url)) as {
      activate?: (shell: ShellProvider) => void
    }
    if (typeof bundle.activate !== "function")
      throw new Error(`${mod.entry} has no activate() export`)
    bundle.activate(buildShell(mod, deviceId, deviceName))
    registry.markActivated(mod.id)
  })()
    .catch((e) => {
      registry.markFailed(mod.id, errorMessage(e))
      // Left in the map: retrying on every render would hammer a 404.
    })

  inFlight.set(mod.id, p)
  return p
}

/// The page to land on: the first one the manifest declares.
///
/// Declaration ORDER decides it, so the firmware chooses — a product's main feature is
/// declared first and is therefore the home screen. The shell does not pick a
/// favourite and has no page of its own to fall back to, which is the point: nothing
/// in a device's navigation comes from this build.
export function useLandingPage(): string | null {
  useRegistry()
  return registry.declaredPages()[0]?.id ?? null
}

/// Render one module page, importing its bundle on first use.
export function ModulePageView({ pageId }: { pageId: string }) {
  useRegistry()
  const info = useDeviceInfo()
  const mod = registry.findDeclaringModule(pageId)
  const status = registry.getStatus()

  const start = useCallback(() => {
    if (!mod) return
    if (registry.isActivated(mod.id) || registry.failureOf(mod.id)) return
    void activate(mod, info?.name ?? "device", info?.name ?? "device")
  }, [mod, info?.name])

  useEffect(() => {
    start()
  }, [start])

  if (status === "loading")
    return <p className="text-sm text-muted-foreground">Loading…</p>

  if (!mod)
    return (
      <Notice
        title="No such module page"
        body={
          <>
            This device does not declare a page called{" "}
            <code className="font-mono">{pageId}</code>.
          </>
        }
      />
    )

  const failure = registry.failureOf(mod.id)
  if (failure)
    return (
      <Notice
        title={`"${mod.id}" could not be loaded`}
        body={
          <>
            {failure}
            <br />
            <span className="text-muted-foreground">
              The firmware declared this page, so the bundle at{" "}
              <code className="font-mono">{mod.entry}</code> is missing or broken.
            </span>
          </>
        }
      />
    )

  const page = registry.getPage(pageId)
  if (!page) {
    // Declared but not registered. The nav entry stays and says so, because hiding it
    // would make a firmware/module mismatch undiagnosable.
    if (!registry.isActivated(mod.id))
      return <p className="text-sm text-muted-foreground">Loading…</p>
    return (
      <Notice
        title="This module did not provide that page"
        body={
          <>
            <code className="font-mono">{mod.id}</code> loaded, but registered no page{" "}
            <code className="font-mono">{pageId}</code> — the firmware's manifest and
            its bundle disagree.
          </>
        }
      />
    )
  }

  return <>{page.render() as ReactNode}</>
}

function Notice({ title, body }: { title: string; body: ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl rounded-xl border bg-card p-6 text-card-foreground shadow-sm">
      <h2 className="mb-2 text-lg font-semibold">{title}</h2>
      <p className="text-sm">{body}</p>
    </div>
  )
}
