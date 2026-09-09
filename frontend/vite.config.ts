import fs from "fs"
import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"

// ── The import map's targets do not exist in dev ──────────────────────────────
// `assets/host-react.js` is emitted by the BUILD, from rollupOptions.input below.
// `pnpm dev` serves source out of /src and emits no assets at all, so a module's bare
// `react` resolved through the import map in index.html to a 404 and the module failed
// to load — which the browser reports as the dynamic import itself failing, pointing at
// the bundle rather than at its dependency. Production was fine the whole time: the
// seam was only ever exercised by a build, and `pnpm dev` is where a module is actually
// developed.
//
// A REDIRECT, not a handler that serves the bytes. Sending the browser to the source
// file puts it through Vite's normal transform, so the facade's own `react` import is
// rewritten to the same pre-bundled dependency the app imports — verified identical,
// which is the whole point of the facade. Serving these bytes here would leave that
// import bare and unresolvable.
function hostFacadesInDev(): Plugin {
  return {
    name: "strux:host-facades-in-dev",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // The query matters: Vite appends ?import to a dynamically imported URL.
        const match = /^\/assets\/(host-react|host-jsx-runtime)\.js(\?.*)?$/.exec(
          req.url ?? "",
        )
        if (!match) return next()
        res.statusCode = 302
        res.setHeader("Location", `/src/shell/${match[1]}.js`)
        res.end()
      })
    },
  }
}

// ── Module bundles are not in the dev server's root either ───────────────────
// A module builds to `../www/modules/<id>.js` and the gzip step then REPLACES it with
// `<id>.js.gz` — the device serves straight out of flash, so only the compressed copy
// is kept. Neither path is under this dev server's root, so `import("/modules/led.js")`
// 404'd and `pnpm dev` opened on a home screen that could not load its own cards. That
// matters more than it used to: the home screen IS the modules now.
//
// The compressed bytes are served with Content-Encoding rather than decompressed here,
// because that is exactly what the device does — so dev and production exercise the
// same path through the browser.
//
// What this does NOT give you is HMR for module source: the bundle is whatever
// `pnpm build:modules` last produced. Editing a module means rebuilding it; editing the
// shell stays live, which is what this dev server is for.
function moduleBundlesInDev(): Plugin {
  return {
    name: "strux:module-bundles-in-dev",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // No dots in the name beyond the extension, so a path cannot climb out of
        // www/modules on the way to path.resolve.
        const match = /^\/modules\/([\w-]+\.js)(\?.*)?$/.exec(req.url ?? "")
        if (!match) return next()

        const bundle = path.resolve(__dirname, "../www/modules", match[1])
        const candidates: [string, string | null][] = [
          [bundle + ".gz", "gzip"],
          [bundle, null],
        ]

        for (const [file, encoding] of candidates) {
          if (!fs.existsSync(file)) continue
          res.setHeader("Content-Type", "application/javascript")
          if (encoding) res.setHeader("Content-Encoding", encoding)
          res.end(fs.readFileSync(file))
          return
        }

        // Nothing built yet. A 404 is the honest answer and the shell already says
        // which bundle it could not load.
        next()
      })
    },
  }
}

export default defineConfig({
  // Relative asset URLs so the same build works served from the device root and
  // from the relay's /devices/<id>/ subpath — no build-time prefix, no per-device
  // build. What keeps this safe is that routing lives in the HASH (use-route.ts):
  // the document URL stays the mount point, so "./assets/…" resolves against the
  // right directory at any route. A path-based router would break that, which is
  // exactly what it did before.
  base: "./",
  plugins: [react(), tailwindcss(), hostFacadesInDev(), moduleBundlesInDev()],
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
