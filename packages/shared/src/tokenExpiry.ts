/**
 * Reading an access token's expiry out of an OAuth token response.
 *
 * Extracted for the same reason prOutcome.ts was: it is pure decision logic
 * that lived inside a server module, so nothing could test it, and it was
 * written out once per provider with a different assumption each time.
 */

/**
 * Epoch milliseconds at which a token response says its access token dies,
 * or undefined when the response does not say.
 *
 * Two shapes are in play. RFC 6749 specifies `expires_in`, seconds from now,
 * which Spotify, GitLab and Google all return. Strava instead returns
 * `expires_at`, an absolute epoch in seconds. Each caller used to hardcode
 * whichever one it expected, so pointing any of them at another provider
 * produced a silently wrong expiry rather than an error.
 *
 * Returning undefined for an unusable response is the important part. The
 * previous code computed `Date.now() + (raw.expires_in as number) * 1000`,
 * which is NaN when the field is missing. The expiry test downstream is
 * `expiresAt < Date.now() + 60_000`, and every comparison against NaN is
 * false — so a NaN expiry read as "never expires". The token would then never
 * be refreshed again, and that integration would stop working the moment the
 * access token actually lapsed, with nothing logged. Undefined means
 * "unknown", and the caller refreshes rather than assuming.
 *
 * `expires_at` is checked first: when a provider sends both, the absolute
 * instant is not subject to clock skew between issuing and parsing.
 */
export function expiresAtFrom(raw: Record<string, unknown>): number | undefined {
  const absoluteSec = raw.expires_at;
  if (typeof absoluteSec === "number" && Number.isFinite(absoluteSec)) {
    return absoluteSec * 1000;
  }
  const relativeSec = raw.expires_in;
  if (typeof relativeSec === "number" && Number.isFinite(relativeSec)) {
    return Date.now() + relativeSec * 1000;
  }
  return undefined;
}
