// The firmware module. Framework, not application: every Strux device has a partition
// table and the `partition` commands, so this ships with the framework — registered by
// UpdateManager, which owns them.
//
// This is the module that forced `upload` and `download` into the contract: writing an
// image is a session rather than a command, and so is reading one back.

import css from "./index.css?inline"
import type { ActivateFn } from "@shell/contract"
import { adoptStyles } from "../../_ui/activate"
import { FirmwarePage } from "./FirmwarePage"

export const activate: ActivateFn = (shell) => {
  adoptStyles("firmware", css)
  shell.routes.register({ id: "firmware", render: () => <FirmwarePage shell={shell} /> })
}
