import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// The LED module: one self-contained ES module, shipped by the firmware in the same
// `www` build as the shell that loads it. That co-shipping is the property the whole
// design rests on — a module can never disagree with the firmware it talks to.
export default defineConfig({
  // Rooted at the module, not at the frontend. Tailwind's source detection and Vite's
  // own resolution both key off this, and leaving it at the invoking directory is what
  // let the shell's classes leak into this bundle.
  root: __dirname,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // Types only, and no imports of its own, so it can be vendored into the relay.
      "@shell": path.resolve(__dirname, "../../shell-contract"),
    },
  },
  build: {
    // Straight into the shell's output directory. The root build runs first and
    // empties `www`, so this must NOT empty it again or it would delete the shell.
    outDir: path.resolve(__dirname, "../../../www/modules"),
    emptyOutDir: false,
    // No sourcemap: this ships in a FAT image on flash, where every KB is a KB of
    // partition. Debug a module in `pnpm dev` against the source instead.
    sourcemap: false,
    // Explicit rather than inherited: this file is served off a FAT partition, so the
    // whitespace is worth removing.
    minify: "esbuild",
    lib: {
      entry: path.resolve(__dirname, "src/index.tsx"),
      formats: ["es"],
      // A stable name, not a content hash, because the FIRMWARE names this file in
      // its manifest (`ui modules` -> entry "/modules/led.js"). Content hashing would
      // take that ability away, and buys nothing: the device serves this out of flash
      // and the relay's cache lives only as long as a device connection.
      fileName: () => "led.js",
    },
    rollupOptions: {
      // The one rule that matters. React comes from the SHELL, through the import map
      // in its index.html, so that the module and the shell share a single instance.
      // Bundling React here would compile fine, ship fine, and then throw on the first
      // hook.
      external: ["react", "react/jsx-runtime"],
    },
    // The module's CSS is imported as a string and adopted at activate() time (see
    // src/index.tsx), so nothing here should emit a separate stylesheet. Vite injects
    // no <link> for a chunk pulled in by import(), which is exactly why: a module's
    // styles would otherwise never apply, and the manifest's single `entry` would stop
    // being the whole truth about what a module is.
    cssCodeSplit: false,
  },
})
