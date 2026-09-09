import { useEffect } from "react"

import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/AppSidebar"
import { useRoute } from "@/hooks/use-route"
import { useAuth } from "@/hooks/use-auth"
import LoginPage from "@/pages/LoginPage"
import { ModulePageView, useLandingPage, useManifest } from "@/shell/ModuleHost"

// Note what this file no longer contains: a switch over the pages this build ships.
// There are none. Every page comes from the device's manifest, so the shell is the
// frame, the router, the transport and the theme — and nothing else.
//
// What is left to decide is only *where to be when nowhere is named*, and even that is
// the firmware's call: the first page the manifest declares.
export default function App() {
  const { authenticated, checking } = useAuth()
  const { route, navigate } = useRoute()
  const { status } = useManifest()
  const landing = useLandingPage()

  // Land on the firmware's first declared page once the manifest says what that is.
  // `replace`-like: it is not a destination the user asked for, so it must not put a
  // step in the back stack that immediately moves again.
  useEffect(() => {
    if (route !== null || !landing) return
    window.history.replaceState(null, "", `#/module/${landing}`)
    navigate({ kind: "module", id: landing })
  }, [route, landing, navigate])

  if (checking) return null // stored token being validated — avoid login-page flash
  if (!authenticated) return <LoginPage />

  return (
    <SidebarProvider>
      <AppSidebar currentRoute={route} onNavigate={navigate} />
      <main className="flex h-screen w-full min-w-0 flex-col overflow-hidden p-6">
        <SidebarTrigger className="shrink-0 md:hidden" />
        <div className="min-h-0 w-full flex-1 overflow-y-auto">
          {route ? (
            <ModulePageView pageId={route.id} />
          ) : (
            <NoPages status={status} />
          )}
        </div>
      </main>
    </SidebarProvider>
  )
}

/// A device that declares no pages at all. Honest rather than papered over: this is
/// the template's own default state — a fresh Strux fork has registered nothing yet —
/// and an empty screen that says so is a better prompt than an invented dashboard.
function NoPages({ status }: { status: string }) {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-xl border border-dashed p-8 text-center">
        <h1 className="mb-2 text-lg font-semibold">
          {status === "loading" ? "Asking the device what it can show…" : "No pages yet"}
        </h1>
        {status !== "loading" && (
          <p className="text-muted-foreground mx-auto max-w-md text-sm">
            {status === "unsupported"
              ? "This device's UI needs a newer page than this one."
              : "This firmware declares no UI modules. A manager registers a UiModule to " +
                "contribute a page — see LedManager for the worked example."}
          </p>
        )}
      </div>
    </div>
  )
}
