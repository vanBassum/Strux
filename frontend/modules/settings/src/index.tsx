// The settings module. Framework, not application: `settings list` exists on every
// Strux device and describes itself, so the page is generated from a declaration and
// belongs with the framework — registered by SettingsManager, which owns the commands.

import css from "./index.css?inline"
import type { ActivateFn } from "@shell/contract"
import { adoptStyles } from "../../_ui/activate"
import { SettingsPage } from "./SettingsPage"

export const activate: ActivateFn = (shell) => {
  adoptStyles("settings", css)
  shell.routes.register({ id: "settings", render: () => <SettingsPage shell={shell} /> })
}
