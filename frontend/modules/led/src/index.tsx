// The LED module's entry point, and the only thing the manifest names.
//
// One export, `activate`, called once by whichever shell imported this file. Note what
// it does NOT do: it never constructs a device connection, never imports the shell's
// backend singleton, and never touches the DOM outside its own styles. Everything it
// needs arrives in the `shell` argument, which is what lets the identical bundle run
// on the device's shell and on the relay's.

import css from "./index.css?inline"
import type { ActivateFn } from "@shell/contract"
import { adoptStyles } from "../../_ui/activate"
import { LedPage } from "./LedPage"

export const activate: ActivateFn = (shell) => {
  adoptStyles("led", css)

  // The id must match what the firmware declared in `ui modules`. The shell checks
  // that and IGNORES anything undeclared — registering a page the manifest does not
  // name would make navigation depend on running module code, which is the property
  // the manifest exists to protect. See uiPages_ in
  // main/app/LedManager/LedManager.h: it is the same string.
  shell.routes.register({
    id: "led",
    render: () => <LedPage shell={shell} />,
  })
}
