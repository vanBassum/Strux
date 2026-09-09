import { useState, useEffect, useCallback } from "react"
import { hashToRoute, routeToHash, sameRoute, type Route } from "@/shell/registry"

// The route lives in the HASH, not the path, and that is load-bearing rather
// than a style choice: this UI is served from two mount points the build cannot
// know — the device root (`/`) and the relay's `/devices/<id>/` — and a path
// route destroys the second one. Writing "/settings" dropped the device id, so
// F5 asked the relay for a URL it has no route for (404), and a reconnect
// resolved its socket against "/" instead of the device prefix.
//
// A hash never reaches the server, so the document URL stays the mount point
// forever: relative asset URLs (vite `base: "./"`) and resolveWsUrl's
// document-directory trick keep resolving, at any nesting depth, with no
// server-side SPA fallback involved. The prefix is never parsed here — the same
// reason backend.ts knows nothing about a device id.
//
// The shape of a route — which pages exist, and that a module page is one of them —
// belongs to `shell/registry`, not here. This hook only owns the window: read the
// hash, write the hash, listen for changes.

export function useRoute() {
  const [route, setRouteState] = useState<Route>(() =>
    hashToRoute(window.location.hash),
  )

  const navigate = useCallback((next: Route) => {
    // Assigning the hash pushes its own history entry, so back/forward keep
    // working without touching history directly.
    const hash = routeToHash(next)
    if (window.location.hash !== hash) window.location.hash = hash
    setRouteState((prev) => (sameRoute(prev, next) ? prev : next))
  }, [])

  useEffect(() => {
    const onHashChange = () => setRouteState(hashToRoute(window.location.hash))
    window.addEventListener("hashchange", onHashChange)
    return () => window.removeEventListener("hashchange", onHashChange)
  }, [])

  return { route, navigate }
}
