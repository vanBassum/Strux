// Where the user is — and, now, nothing about what pages exist.
//
// This file used to hold `shellPages`: Home, Console, Settings and Firmware, compiled
// into the build, with `ShellPage` a closed union the router could switch on
// exhaustively. All four are modules now, so the list is gone and so is the union.
//
// The rule that removed them is worth stating, because it is the whole design in one
// line: **the shell contributes nothing to a device's navigation.** Every entry comes
// from the firmware's manifest. A shell supplies the frame, the router, the transport
// and the theme; what the device can DO is the device's own account of itself.
//
// What that bought is not tidiness. It is that six implementations of three pages —
// Console, Settings and Firmware, once per shell — became three, shipped by the
// firmware that produced the data they show, and that neither shell now knows the name
// of a single device command.
//
// So a route is a module page or it is the login page, and there is no default page
// this build can name: the FIRST page the manifest declares is the landing page, which
// makes it the firmware's choice and not ours.

/// Where the user is. A module page, addressed by the id its manifest declared —
/// `#/module/<id>`, keeping the module id space separate from anything a shell might
/// later put in a hash.
export type Route = { kind: "module"; id: string }

/// No route at all: the manifest has not arrived, or this device declares no pages.
/// Distinct from a route TO something, because there is nothing to route to.
export type MaybeRoute = Route | null

export function routeToHash(route: Route): string {
  return `#/module/${route.id}`
}

export function hashToRoute(hash: string): MaybeRoute {
  const segments = hash.replace(/^#\/?/, "").split("/")
  if (segments[0]?.toLowerCase() !== "module") return null
  // Not validated against the manifest here: the manifest arrives over the wire, after
  // the first render, and a route that waited for it would flash a different page on
  // every reload. ModulePageView resolves the id and reports an unknown one — which is
  // also what has to happen when firmware declares a page its bundle never registers.
  return segments[1] ? { kind: "module", id: segments[1] } : null
}

export function sameRoute(a: MaybeRoute, b: MaybeRoute): boolean {
  if (a === null || b === null) return a === b
  return a.id === b.id
}
