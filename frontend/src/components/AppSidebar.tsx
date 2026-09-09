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
import { shellPages, sameRoute, type Route } from "@/shell/registry"
import { useManifest } from "@/shell/ModuleHost"
import { declaredPages } from "@/shell/module-registry"
import { resolveIcon } from "@/shell/icons"

// The sidebar renders navigation; it no longer *defines* it. `shellPages` and the
// `Route` type moved to shell/registry so that firmware-contributed pages can join
// the same list without a component owning the router's type.
interface AppSidebarProps {
  currentRoute: Route
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
              {shellPages.map((item) => (
                <SidebarMenuItem key={item.page}>
                  <SidebarMenuButton
                    isActive={sameRoute(currentRoute, { kind: "shell", page: item.page })}
                    onClick={() => onNavigate({ kind: "shell", page: item.page })}
                  >
                    <item.icon />
                    <span>{item.title}</span>
                    {item.page === "firmware" && updateAvailable && (
                      <span className="ml-auto h-2 w-2 rounded-full bg-emerald-500" />
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}

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
      <SidebarFooter className="p-3">
        <div className="rounded-lg border bg-card p-3 text-xs">
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
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
