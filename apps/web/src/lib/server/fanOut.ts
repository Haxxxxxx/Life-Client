/**
 * Runs a per-user sync across every connected user, isolating failures.
 *
 * Each `syncAllX` used to be a bare `Promise.all` over `uids`, which fails
 * fast: one user's rejection aborted the sweep for everyone else. That was
 * easy to hit, because `getTokens` sits *outside* the per-user try/catch in
 * several of these, so a single Firestore blip took the whole provider down
 * for the run. Catching here rather than inside each sync means it holds even
 * for throws the per-user function never sees.
 *
 * The concurrency cap matters for a different reason: every user's sync hits
 * the same third-party API, and providers rate-limit per application, not per
 * user (Strava allows 100 requests / 15 min). Unbounded fan-out burns that
 * budget in one burst and gets everyone 429'd.
 */
export interface FanOutResult {
  ok: number;
  failed: number;
  /** One entry per failure, for the cron's structured log. */
  errors: { uid: string; message: string }[];
}

const DEFAULT_CONCURRENCY = 4;

export async function forEachUser(
  label: string,
  uids: string[],
  run: (uid: string) => Promise<void>,
  concurrency: number = DEFAULT_CONCURRENCY,
): Promise<FanOutResult> {
  const result: FanOutResult = { ok: 0, failed: 0, errors: [] };
  if (uids.length === 0) return result;

  const queue = [...uids];
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    for (;;) {
      const uid = queue.shift();
      if (uid === undefined) return;
      try {
        await run(uid);
        result.ok += 1;
      } catch (error) {
        result.failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        result.errors.push({ uid, message });
        // Logged per user so one failure is traceable without the others'
        // noise; the cron aggregates counts for the response.
        console.error(`${label}: sync failed for ${uid}`, error);
      }
    }
  });

  await Promise.all(workers);
  return result;
}

/** Sums several fan-outs into one tally for the cron response. */
export function totalFailures(results: FanOutResult[]): number {
  return results.reduce((sum, r) => sum + r.failed, 0);
}
