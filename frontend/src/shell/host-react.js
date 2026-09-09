// The shell's React, republished at a stable URL so a firmware-shipped module bundle
// can reach it through the import map in index.html instead of carrying its own copy.
// Two React instances is the one thing that genuinely breaks — hooks throw
// immediately — so this file is load-bearing.
//
// ── Why every name is spelled out ─────────────────────────────────────────────
// `export * from "react"` compiles, emits, and silently produces NOTHING usable.
// React 19's package is CommonJS, so a star re-export has no statically known names
// to forward: the emitted chunk exported six mangled internals (`R`, `a`, `b`, …) and
// a module's `import { useState } from "react"` would have got undefined. It was
// caught by reading the emitted chunk, and it would not have been caught by a build
// that merely succeeded.
//
// Naming them explicitly makes Vite's CommonJS interop resolve each binding the same
// way it already does everywhere else in the app, and has the side benefit of being
// the written-down list of what a module may use. A name React removes becomes a
// build error here, which is the right place for it to surface.
//
// JavaScript rather than TypeScript because @types/react uses `export =`, which
// TypeScript will not combine with a re-export of this shape. There is nothing to
// type: the file declares nothing.
//
// Emitted without a content hash (see vite.config.ts) so the import map can be a
// static snippet rather than something a build plugin injects.

export {
  default,
  Children,
  Component,
  Fragment,
  Profiler,
  PureComponent,
  StrictMode,
  Suspense,
  cache,
  cloneElement,
  createContext,
  createElement,
  createRef,
  forwardRef,
  isValidElement,
  lazy,
  memo,
  startTransition,
  use,
  useActionState,
  useCallback,
  useContext,
  useDebugValue,
  useDeferredValue,
  useEffect,
  useId,
  useImperativeHandle,
  useInsertionEffect,
  useLayoutEffect,
  useMemo,
  useOptimistic,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  version,
} from "react"
