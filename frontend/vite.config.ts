import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  // Relative asset URLs so the same build works served from the device root and
  // from the relay's /devices/<id>/ subpath — no build-time prefix, no per-device
  // build. What keeps this safe is that routing lives in the HASH (use-route.ts):
  // the document URL stays the mount point, so "./assets/…" resolves against the
  // right directory at any route. A path-based router would break that, which is
  // exactly what it did before.
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@shell": path.resolve(__dirname, "./shell-contract"),
    },
  },
  build: {
    outDir: "../www",
    emptyOutDir: true,
    rollupOptions: {
      // Without this, Rollup is free to DROP an entry's declared exports when it can
      // serve the same code as a plain shared chunk — and it did: host-react.js came
      // out exporting six mangled internals instead of React's named bindings, so a
      // module's `import { useState } from "react"` would have resolved to undefined.
      // "strict" makes Rollup emit a facade that re-exports the real names while the
      // implementation still lives in one shared chunk, which is what keeps a single
      // React instance.
      preserveEntrySignatures: "strict",

      // Three entries, not one. `index.html` is the app; the other two exist so the
      // import map in index.html can point a module bundle's bare `react` and
      // `react/jsx-runtime` specifiers at THIS build's React. See
      // src/shell/host-react.js for why an entry rather than a vendor chunk.
      input: {
        index: path.resolve(__dirname, "index.html"),
        "host-react": path.resolve(__dirname, "src/shell/host-react.js"),
        "host-jsx-runtime": path.resolve(__dirname, "src/shell/host-jsx-runtime.js"),
      },
      output: {
        // `manualChunks: undefined` used to force everything into a single bundle.
        // It has to go: React needs a URL of its own for the import map to name, and
        // a module that got its own copy of React would break hooks outright.
        //
        // The two host entries are emitted WITHOUT a content hash so the import map
        // can be a static snippet in index.html instead of something a build plugin
        // has to inject. Cache immutability buys nothing here — the device serves
        // these out of flash and the relay's cache lives only as long as a device
        // connection.
        entryFileNames: (chunk) =>
          chunk.name.startsWith("host-") ? "assets/[name].js" : "assets/[name]-[hash].js",
      },
    },
  },
})
