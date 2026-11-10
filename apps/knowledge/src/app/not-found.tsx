import Link from "next/link";

/**
 * There was no not-found.tsx, so a bad URL fell through to the framework
 * default — a bare white-on-black "404 | This page could not be found" with
 * none of the app's typography or palette. That page is the first thing
 * anyone sees when a link rots, so it should look like the product.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="font-mono text-micro font-bold tracking-[0.3em] text-muted uppercase">Error 404</p>
      <h1 className="text-3xl font-bold tracking-tight">This page doesn&rsquo;t exist</h1>
      <p className="max-w-prose text-sm text-muted">
        The link may be out of date, or the page may have moved.
      </p>
      <Link
        href="/"
        className="mt-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-md shadow-black/20 transition hover:-translate-y-0.5"
      >
        Back to Knowledge
      </Link>
    </main>
  );
}
