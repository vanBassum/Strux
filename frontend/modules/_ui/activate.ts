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
  // FIRST in <head>, not appended, and this is load-bearing. A module's stylesheet and
  // the shell's land in the SAME Tailwind `utilities` cascade layer — the layer names
  // match, so they are one layer, not two — and inside a layer the last matching rule
  // of equal specificity wins. An appended module sheet therefore outranked the shell
  // on every class name the two happen to share.
  //
  // That is not hypothetical. The shadcn sidebar both shells use is `hidden md:block`;
  // a module that emits `.hidden` (the firmware module's file input does) beat the
  // shell's `.md:block` and the sidebar vanished at every width, on a device whose
  // firmware was blameless. A media query carries no specificity, so nothing broke the
  // tie. Excluding preflight (see theme.css) stops a module restyling the host's
  // ELEMENTS; it does nothing about a utility class they both use.
  //
  // Going first inverts the tie the right way round: the shell wins the classes it also
  // defines, and a module still gets every utility the shell never emitted. Shell styles
  // are always in <head> before any module activates — a <link> in a build, Vite's
  // injected <style> in dev — so "first child" is reliably ahead of them.
  document.head.insertBefore(style, document.head.firstChild)
}

/// Turns anything thrown into something showable.
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
