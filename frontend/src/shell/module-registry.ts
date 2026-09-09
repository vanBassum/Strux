// What the shell knows about modules at runtime: the manifest the firmware sent, and
// the contributions each bundle registered when it was activated.
//
// A plain store with subscribers rather than React state, because modules register
// imperatively from `activate(shell)` — that call happens inside a dynamic import, not
// inside a render — and because two different React trees (the sidebar and the page)
// both need to see the result.
//
// Nothing here imports a module or knows a module's shape. It holds ids and thunks.

import type {
  ManifestModule,
  ModuleCard,
  ModulePage,
  UiManifest,
} from "@shell/contract"

/// Where the shell is in the process of learning what this device offers.
///
/// `unsupported` is not an error state: it is a device whose firmware wants a newer
/// shell, and the rest of the UI stays fully usable. `absent` is the mixed-fleet case
/// — firmware with no `ui modules` command at all — which is the common one and is
/// why a rejected manifest must never look like a failure.
export type ManifestStatus = "loading" | "ready" | "absent" | "unsupported"

interface State {
  status: ManifestStatus
  manifest: UiManifest | null
  /// Reason to show when status is "unsupported".
  detail: string
  /// Module ids whose bundle failed to import (a 404, a syntax error, a throwing
  /// activate). Kept so the page can say which one rather than rendering nothing.
  failed: Map<string, string>
  /// Bundles that have been imported and activated, so it happens once per id.
  activated: Set<string>
  pages: Map<string, ModulePage>
  cards: Map<string, ModuleCard>
}

const state: State = {
  status: "loading",
  manifest: null,
  detail: "",
  failed: new Map(),
  activated: new Set(),
  pages: new Map(),
  cards: new Map(),
}

const listeners = new Set<() => void>()

function emit() {
  for (const fn of listeners) fn()
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// useSyncExternalStore wants a stable snapshot, and a mutable object is not one. A
// version counter is: it changes exactly when something a caller can see changed.
let version = 0
export function getVersion(): number {
  return version
}

function changed() {
  version++
  emit()
}

export function getStatus(): ManifestStatus {
  return state.status
}
export function getDetail(): string {
  return state.detail
}
export function getManifest(): UiManifest | null {
  return state.manifest
}

export function setManifest(manifest: UiManifest) {
  state.manifest = manifest
  state.status = "ready"
  changed()
}

export function setAbsent() {
  state.manifest = null
  state.status = "absent"
  changed()
}

export function setUnsupported(detail: string) {
  state.manifest = null
  state.status = "unsupported"
  state.detail = detail
  changed()
}

/// The manifest's declared pages, in declaration order. Drawn before any module code
/// has run — that is the whole reason the manifest exists — so this must not consult
/// `pages` at all.
export function declaredPages(): { moduleId: string; id: string; title: string; icon: string }[] {
  const m = state.manifest
  if (!m) return []
  return m.modules.flatMap((mod: ManifestModule) =>
    mod.pages.map((p) => ({ moduleId: mod.id, id: p.id, title: p.title, icon: p.icon })),
  )
}

export function declaredCardIds(): { moduleId: string; id: string }[] {
  const m = state.manifest
  if (!m) return []
  return m.modules.flatMap((mod) => mod.cards.map((id) => ({ moduleId: mod.id, id })))
}

export function findDeclaringModule(pageId: string): ManifestModule | null {
  const m = state.manifest
  if (!m) return null
  return m.modules.find((mod) => mod.pages.some((p) => p.id === pageId)) ?? null
}

// ── What modules register ─────────────────────────────────────────────────────

/// Ids are matched against the manifest by the caller (ModuleHost), not here: this
/// store records what was offered, and the matching rules are policy.
export function registerPage(page: ModulePage) {
  if (state.pages.has(page.id))
    console.warn(`[modules] page "${page.id}" registered twice; last one wins`)
  state.pages.set(page.id, page)
  changed()
}

export function registerCard(card: ModuleCard) {
  if (state.cards.has(card.id))
    console.warn(`[modules] card "${card.id}" registered twice; last one wins`)
  state.cards.set(card.id, card)
  changed()
}

export function getPage(id: string): ModulePage | undefined {
  return state.pages.get(id)
}
export function getCard(id: string): ModuleCard | undefined {
  return state.cards.get(id)
}

export function isActivated(moduleId: string): boolean {
  return state.activated.has(moduleId)
}
export function markActivated(moduleId: string) {
  state.activated.add(moduleId)
  changed()
}

export function markFailed(moduleId: string, reason: string) {
  state.failed.set(moduleId, reason)
  changed()
}
export function failureOf(moduleId: string): string | undefined {
  return state.failed.get(moduleId)
}

/// Test/HMR seam: forget everything. Not used by the app.
export function reset() {
  state.status = "loading"
  state.manifest = null
  state.detail = ""
  state.failed.clear()
  state.activated.clear()
  state.pages.clear()
  state.cards.clear()
  changed()
}
