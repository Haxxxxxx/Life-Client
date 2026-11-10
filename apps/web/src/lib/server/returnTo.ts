/**
 * Resolves a caller-supplied `returnTo` into an absolute same-origin URL.
 *
 * `returnTo` reaches us from the client (and, via the OAuth state doc, survives
 * a round-trip through the provider), so it is untrusted. Naive interpolation
 * — `${origin}${returnTo}` — is an open redirect: `@evil.com` resolves to
 * `https://app.example@evil.com`, where everything before the `@` is userinfo
 * and the browser lands on evil.com. `//evil.com` and `/\evil.com` are the
 * same trick with protocol-relative syntax.
 *
 * Parsing against `origin` and comparing the resolved origin rejects all of
 * those without needing to enumerate them. Anything that doesn't resolve back
 * to our own origin falls back to `/integrations`.
 */
const FALLBACK = "/integrations";

export function safeReturnTo(returnTo: string | null | undefined, origin: string): string {
  if (!returnTo) return `${origin}${FALLBACK}`;
  try {
    const resolved = new URL(returnTo, origin);
    if (resolved.origin !== new URL(origin).origin) return `${origin}${FALLBACK}`;
    return resolved.toString();
  } catch {
    return `${origin}${FALLBACK}`;
  }
}

/** The path-only form, for storing in the OAuth state doc. */
export function safeReturnToPath(returnTo: string | null | undefined, origin: string): string {
  const absolute = safeReturnTo(returnTo, origin);
  const url = new URL(absolute);
  return `${url.pathname}${url.search}${url.hash}`;
}
