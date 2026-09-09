// The LED module's entry point, and the only thing the manifest names.
//
// One export, `activate`, called once by whichever shell imported this file. Note what
// it does NOT do: it never constructs a device connection, never imports the shell's
// backend singleton, and never touches the DOM outside its own styles. Everything it
// needs arrives in the `shell` argument, which is what lets the identical bundle run
// on the device's shell and on the relay's.

import css from "./index.css?inline"
import type { ActivateFn } from "@shell/contract"
import { LedCard } from "./LedCard"

const STYLE_ID = "strux-module-led"

// The CSS is imported as a STRING and adopted here, rather than left to Vite. That is
// not a stylistic preference: Vite emits a chunk's CSS as a separate asset, and an ES
// module pulled in by import() gets no <link> injected for it — so a module's styles
// would simply never apply, and the manifest's single `entry` would stop being the
// whole truth about what a module is. Inlining keeps one file, keeps the manifest
// honest, and keeps the relay's cache warmer trivial.
function adoptStyles() {
  if (document.getElementById(STYLE_ID)) return
  const el = document.createElement("style")
  el.id = STYLE_ID
  el.textContent = css
  document.head.appendChild(el)
}

export const activate: ActivateFn = (shell) => {
  adoptStyles()

  // A CARD and no page: the LED is what this device does, so it belongs on the home
  // screen rather than behind a nav entry beside it.
  //
  // The id must match what the firmware declared in `ui modules`. The shell checks
  // that and IGNORES anything undeclared — registering a page the manifest does not
  // name would make navigation depend on running module code, which is the property
  // the manifest exists to protect. So `shell.routes.register` here would be silently
  // dropped with a warning, not honoured. See uiCards_ in
  // main/app/LedManager/LedManager.h: it is the same string.
  shell.cards.register({
    id: "led",
    render: () => <LedCard shell={shell} />,
  })
}
