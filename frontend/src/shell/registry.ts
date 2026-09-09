// The shell's own pages, and the union that names them.
//
// This used to be `export type Page = (typeof navItems)[number]["page"]` inside
// AppSidebar.tsx, which made the sidebar the authority on what pages exist: the
// router imported its route type from a component, and adding a page meant editing
// a component's array. That is fine while every page is built in. It stops being
// fine the moment firmware contributes one, because a module's page is not in any
// array here and never can be.
//
// So the union splits in two. `ShellPage` is the closed set of pages this build
// ships — the router can still exhaustively switch on it, which is what keeps
// PageContent honest. `Route` adds the open half: a module page, addressed by the
// id the manifest declared. Nothing here imports a module or the manifest; the
// registry only says that such a route can exist.

import {
  HomeIcon,
  TerminalIcon,
  SettingsIcon,
  DownloadIcon,
  type LucideIcon,
} from "lucide-react"

export const shellPages = [
  { title: "Home", icon: HomeIcon, page: "home" },
  { title: "Console", icon: TerminalIcon, page: "console" },
  { title: "Settings", icon: SettingsIcon, page: "settings" },
  { title: "Firmware", icon: DownloadIcon, page: "firmware" },
] as const satisfies readonly { title: string; icon: LucideIcon; page: string }[]

/// A page this build ships. Closed, so `PageContent` can switch exhaustively.
export type ShellPage = (typeof shellPages)[number]["page"]

/// Where the user is. Either one of the shell's own pages, or a module page named by
/// its manifest id — `#/module/<id>`, so a module id can never collide with a shell
/// page name however Strux grows.
export type Route =
  | { kind: "shell"; page: ShellPage }
  | { kind: "module"; id: string }

export const HOME: Route = { kind: "shell", page: "home" }

export function isShellPage(value: string): value is ShellPage {
  return shellPages.some((p) => p.page === value)
}

export function routeToHash(route: Route): string {
  if (route.kind === "module") return `#/module/${route.id}`
  return route.page === "home" ? "#/" : `#/${route.page}`
}

export function hashToRoute(hash: string): Route {
  const segments = hash.replace(/^#\/?/, "").split("/")
  const first = segments[0]?.toLowerCase()

  if (first === "module") {
    // Not validated against the manifest here: the manifest arrives over the wire,
    // after the first render, and a route that waited for it would flash Home on
    // every reload of a module page. The ModuleHost resolves the id and reports an
    // unknown one — which is also what has to happen when firmware declares a page
    // its bundle never registers.
    const id = segments[1]
    return id ? { kind: "module", id } : HOME
  }

  if (first && isShellPage(first)) return { kind: "shell", page: first }
  return HOME
}

export function sameRoute(a: Route, b: Route): boolean {
  if (a.kind !== b.kind) return false
  return a.kind === "module" && b.kind === "module"
    ? a.id === b.id
    : a.kind === "shell" && b.kind === "shell" && a.page === b.page
}
