import { notFound } from "next/navigation";

/**
 * Server-side gate for everything under /lab.
 *
 * These are scratch pages for trying things out — the Supabase one calls
 * `supabase.auth.signInAnonymously()` — and they were shipping in the
 * production build, reachable by anyone who guessed the URL. A client-side
 * check would not help: the page would still be in the bundle and the
 * anonymous sign-in still reachable.
 *
 * This is a Server Component, so `notFound()` stops the route segment before
 * any lab page renders. Set ENABLE_LAB_ROUTES=1 locally (or on a preview) to
 * work on them; it is deliberately not a NEXT_PUBLIC_ var, so the value is
 * never inlined into client code.
 */
export default function LabLayout({ children }: { children: React.ReactNode }) {
  if (process.env.ENABLE_LAB_ROUTES !== "1") notFound();
  return children;
}
