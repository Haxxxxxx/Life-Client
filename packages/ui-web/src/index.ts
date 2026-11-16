/**
 * Shared dark command-center primitives for the two Next.js apps.
 *
 * apps/web and apps/knowledge carried their own copies of ui.tsx — 605 and 588
 * lines, differing by a single comment and one extra export. confirm-button.tsx
 * was byte-identical in both. Having two of each is how `pageShellClassName`
 * ended up in one and not the other, and why `emptyPanelClassName` and
 * `rowActionClassName` each had to be written twice.
 *
 * It is a package rather than one app importing the other's file: these deploy
 * independently, and a cross-app relative import would tie their build graphs
 * together.
 *
 * Tailwind has to be told this directory exists. Both apps' globals.css carry
 * an `@source` pointing here, because v4 scans the project root by default and
 * would otherwise generate none of the utility classes used below — the
 * components would render completely unstyled, and nothing would fail loudly.
 */
export * from "./ui";
export * from "./confirm-button";
