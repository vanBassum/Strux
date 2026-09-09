import { useEffect } from "react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { useConnectionStatus } from "@/hooks/use-connection-status"
import { useDeviceInfo } from "@/hooks/use-device-info"
import { useLatestRelease } from "@/hooks/use-latest-release"
import { isNewerVersion } from "@/lib/version"
import { PreReleaseBadge } from "@/components/PreReleaseBadge"
import { DeviceInfoDialog } from "@/components/DeviceInfoDialog"
import { sameRoute, type MaybeRoute, type Route } from "@/shell/registry"
import { useManifest } from "@/shell/ModuleHost"
import { declaredPages } from "@/shell/module-registry"
import { resolveIcon } from "@/shell/icons"

// The sidebar renders navigation; it no longer *defines* it. `shellPages` and the
// `Route` type moved to shell/registry so that firmware-contributed pages can join
// the same list without a component owning the router's type.
interface AppSidebarProps {
  /// Null while the manifest has not yet said what pages exist.
  currentRoute: MaybeRoute
  onNavigate: (route: Route) => void
}

const statusColor = {
  connected: "bg-emerald-500",
  connecting: "bg-amber-500 animate-pulse",
  disconnected: "bg-red-500",
} as const

const statusLabel = {
  connected: "Online",
  connecting: "Connecting",
  disconnected: "Offline",
} as const

export function AppSidebar({ currentRoute, onNavigate }: AppSidebarProps) {
  const connection = useConnectionStatus()
  // Drawn from the manifest, so the nav is complete before a single module bundle has
  // been fetched. That is the property the manifest-as-command exists to protect.
  const { status } = useManifest()
  const modulePages = declaredPages()
  const info = useDeviceInfo()
  const release = useLatestRelease()
  const updateAvailable = info && release && isNewerVersion(info.firmware, release.version)

  // Browser tab title follows the device name (login page covers pre-auth).
  useEffect(() => {
    if (info?.name) document.title = info.name
  }, [info?.name])

  return (
    <Sidebar>
      <SidebarHeader className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{info?.name ?? "…"}</span>
          <PreReleaseBadge version={info?.firmware} />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {modulePages.map((page) => {
                const Icon = resolveIcon(page.icon)
                return (
                  <SidebarMenuItem key={`${page.moduleId}/${page.id}`}>
                    <SidebarMenuButton
                      isActive={sameRoute(currentRoute, { kind: "module", id: page.id })}
                      onClick={() => onNavigate({ kind: "module", id: page.id })}
                    >
                      <Icon />
                      <span>{page.title}</span>
                      {/* The update dot used to hang off a built-in Firmware page.
                          There is no built-in page any more, so it hangs off whichever
                          module declares the id "firmware" — which the framework's own
                          firmware module does. A product that replaces it keeps the
                          dot by keeping the id. */}
                      {page.id === "firmware" && updateAvailable && (
                        <span className="ml-auto h-2 w-2 rounded-full bg-emerald-500" />
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}

              {status === "unsupported" && (
                <SidebarMenuItem>
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    This device's UI needs a newer page.
                  </div>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      {/* The footer is the way in to the device's details. It already shows the
          version and the link state, so it is where somebody looks when they want to
          know more about either — which is why Device Info is behind it rather than
          on the home screen or in a nav entry of its own. A button, not a div with an
          onClick: keyboard focus and Enter come for free, and a dialog reached only
          by mouse is a dialog some people cannot reach. */}
      <SidebarFooter className="p-3">
        <DeviceInfoDialog>
          <button
            type="button"
            aria-label="Device info"
            className="w-full cursor-pointer rounded-lg border bg-card p-3 text-left text-xs transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {info && (
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-muted-foreground">Version</span>
                <div className="flex items-center gap-1.5">
                  <PreReleaseBadge version={info.firmware} />
                  <span className="font-mono">{info.firmware}</span>
                </div>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Status</span>
              <div className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${statusColor[connection]}`} />
                <span>{statusLabel[connection]}</span>
              </div>
            </div>
          </button>
        </DeviceInfoDialog>
      </SidebarFooter>
    </Sidebar>
  )
}
