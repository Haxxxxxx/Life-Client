/**
 * Ambient types that must survive a fresh clone.
 *
 * Expo already declares `*.css` (and the `.module.css` / `*.scss` variants) in
 * `expo/types/global.d.ts`, but that file is only reachable through
 * `expo-env.d.ts` — which `expo start` generates and `.gitignore` excludes. So
 * it exists on a machine where the dev server has run, and nowhere else: not
 * in a fresh clone, and not in CI.
 *
 * `src/constants/theme.ts` imports `@/global.css` for its side effect (the
 * `--font-*` custom properties the web build reads), and TypeScript 6 checks
 * side-effect imports by default. Without the declaration that import is
 * TS2882, which is why `tsc -p apps/mobile` failed on a clean checkout while
 * passing for anyone who had run the app.
 *
 * Referencing the types package rather than redeclaring `*.css` keeps the
 * other Expo ambient declarations in scope too; ambient wildcard declarations
 * merge, so this duplicating the generated file is harmless.
 *
 * Do not un-ignore `expo-env.d.ts` instead — Expo rewrites it.
 */

/// <reference types="expo/types" />
