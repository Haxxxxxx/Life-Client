"use client";

import { useEffect } from "react";

/**
 * Route-level error boundary. Without one, a render-time throw showed the
 * framework's default error screen in production — unstyled, and with no way
 * back other than the browser's back button.
 *
 * Must be a Client Component, and `reset` re-renders the segment, which is
 * usually enough for a transient failure (a dropped subscription, a failed
 * fetch) without a full reload.
 */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Nothing is wired to a reporter yet; the digest is what correlates this
    // with the server log, so at minimum make it findable in the console.
    console.error("Route error", error);
  }, [error]);

  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="font-mono text-micro font-bold tracking-[0.3em] text-danger uppercase">Something broke</p>
      <h1 className="text-2xl font-bold tracking-tight">This page didn&rsquo;t load</h1>
      <p className="max-w-prose text-sm text-muted">
        The error has been logged. Trying again usually clears it.
      </p>
      {error.digest && <p className="font-mono text-micro text-muted">Ref {error.digest}</p>}
      <button
        type="button"
        onClick={reset}
        className="mt-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-md shadow-black/20 transition hover:-translate-y-0.5"
      >
        Try again
      </button>
    </main>
  );
}
