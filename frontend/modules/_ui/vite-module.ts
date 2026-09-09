import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, type UserConfig } from "vite"

/**
 * The build every module shares, because every module's build is the same build.
 *
 * Four copies of this config existed for about an hour and the differences between
 * them were the module's id and nothing else — which is the definition of something
 * that should be a function. Each module's `vite.config.ts` is now one call, and the
 * decisions below are made once.
 *
 * @param dir  the module's own directory (`import.meta.dirname`)
 * @param id   the module id, which is also the bundle's filename — the FIRMWARE names
 *             this in its manifest, so it must be stable and unhashed.
 */
export function moduleConfig(dir: string, id: string): UserConfig {
  return defineConfig({
    // Rooted at the module, not at the frontend. Tailwind's source detection and
    // Vite's own resolution both key off this, and leaving it at the invoking
    // directory is what let the shell's classes leak into a module bundle.
    root: dir,
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        // Types only, and no imports of its own, so it can be vendored into the relay.
        "@shell": path.resolve(dir, "../../shell-contract"),
      },
    },
    build: {
      // Straight into the shell's output directory. The root build runs first and
      // empties `www`, so this must NOT empty it again or it would delete the shell.
      outDir: path.resolve(dir, "../../../www/modules"),
      emptyOutDir: false,
      // No sourcemap: this ships in a FAT image on flash, where every KB is a KB of
      // partition. Debug a module in `pnpm dev` against the source instead.
      sourcemap: false,
      minify: "esbuild",
      lib: {
        entry: path.resolve(dir, "src/index.tsx"),
        formats: ["es"],
        // A stable name, not a content hash, because the FIRMWARE names this file in
        // its manifest. Content hashing would take that ability away and buys nothing:
        // the device serves this out of flash, and the relay's cache lives only as
        // long as a device connection.
        fileName: () => `${id}.js`,
      },
      rollupOptions: {
        // The one rule that matters. React comes from the SHELL, through the import
        // map in its index.html, so the module and the shell share a single instance.
        // Bundling React here would compile fine, ship fine, and throw on the first
        // hook.
        external: ["react", "react/jsx-runtime"],
      },
      // A module's CSS is imported as a string and adopted at activate() time, so
      // nothing here should emit a separate stylesheet: Vite injects no <link> for a
      // chunk pulled in by import(), which means the styles would never apply and the
      // manifest's single `entry` would stop being the whole truth about a module.
      cssCodeSplit: false,
    },
  })
}
