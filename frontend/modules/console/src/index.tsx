// The console module. Framework, not application: every Strux device broadcasts log
// lines and answers `log list`, so this ships with the framework rather than with a
// product — registered by ConsoleManager, which owns those commands.
//
// It is a module rather than a shell page because a shell contributes nothing to a
// device's navigation. What that buys concretely: one implementation instead of one
// per shell, and a device's console always matching the firmware that produced the
// lines.

import css from "./index.css?inline"
import type { ActivateFn } from "@shell/contract"
import { adoptStyles } from "../../_ui/activate"
import { ConsolePage } from "./ConsolePage"

export const activate: ActivateFn = (shell) => {
  adoptStyles("console", css)
  shell.routes.register({ id: "console", render: () => <ConsolePage shell={shell} /> })
}
