import { moduleConfig } from "../_ui/vite-module"

// The LED module: one self-contained ES module, shipped by the firmware in the same
// `www` build as the shell that loads it. That co-shipping is the property the whole
// design rests on — a module can never disagree with the firmware it talks to.
export default moduleConfig(import.meta.dirname, "led")
