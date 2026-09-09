/// Adopts a module's stylesheet, once.
///
/// Every module needs this and every module needed the same eight lines, with only the
/// id differing. Worth saying why it is needed at all, because it looks like something
/// a bundler should do: Vite emits a chunk's CSS as a SEPARATE asset, and an ES module
/// pulled in by `import()` gets no `<link>` injected for it. So a module's styles would
/// simply never apply. Importing the stylesheet as a string and adopting it here keeps
/// one file per module, which in turn keeps the manifest's single `entry` the whole
/// truth about what a module is — and keeps the relay's cache warmer trivial.
///
/// Idempotent by id, because `activate` can run twice for the same module: the relay
/// shell forgets a device's registry when its pipe drops, and a reconnect re-activates
/// the already-imported bundle. A browser cannot unload an ES module, so re-activation
/// is normal rather than exceptional.
export function adoptStyles(id: string, css: string): void {
  const elementId = `strux-module-${id}`
  if (document.getElementById(elementId)) return
  const style = document.createElement("style")
  style.id = elementId
  style.textContent = css
  document.head.appendChild(style)
}

/// Turns anything thrown into something showable.
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
