import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/AppSidebar"
import { useRoute } from "@/hooks/use-route"
import { useAuth } from "@/hooks/use-auth"
import type { Route, ShellPage } from "@/shell/registry"
import HomePage from "@/pages/HomePage"
import ConsolePage from "@/pages/ConsolePage"
import SettingsPage from "@/pages/SettingsPage"
import FirmwarePage from "@/pages/FirmwarePage"
import LoginPage from "@/pages/LoginPage"

// `ShellPage` is closed, so this switch stays exhaustive and a new built-in page
// cannot be added without wiring it here.
function ShellPageContent({ page }: { page: ShellPage }) {
  switch (page) {
    case "home":
      return <HomePage />
    case "console":
      return <ConsolePage />
    case "settings":
      return <SettingsPage />
    case "firmware":
      return <FirmwarePage />
  }
}

function RouteContent({ route }: { route: Route }) {
  if (route.kind === "shell") return <ShellPageContent page={route.page} />

  // Module pages arrive in step 4, when ModuleHost lands. Until then the route is
  // reachable (a bookmark, a hand-typed hash) and has to say something honest — the
  // same message a declared-but-unregistered module page will get, which is why it
  // is worth having now rather than falling back to Home and hiding the mismatch.
  return (
    <div className="text-sm text-muted-foreground">
      This device has no UI module <span className="font-mono">{route.id}</span>.
    </div>
  )
}

export default function App() {
  const { authenticated, checking } = useAuth()
  const { route, navigate } = useRoute()

  if (checking) return null   // stored token being validated — avoid login-page flash
  if (!authenticated) return <LoginPage />

  return (
    <SidebarProvider>
      <AppSidebar currentRoute={route} onNavigate={navigate} />
      <main className="flex h-screen w-full min-w-0 flex-col overflow-hidden p-6">
        <SidebarTrigger className="shrink-0 md:hidden" />
        <div className="min-h-0 w-full flex-1 overflow-y-auto">
          <RouteContent route={route} />
        </div>
      </main>
    </SidebarProvider>
  )
}
