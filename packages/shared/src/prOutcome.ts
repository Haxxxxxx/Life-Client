/**
 * Deciding what happened to a PR that is no longer in the open set we fetched.
 *
 * Pure mapping, deliberately kept out of the sync module so it can be tested
 * without a network or a Firestore handle — this is where the bug lived.
 *
 * The sync fetches a *capped* page of open PRs, so "not in the set we fetched"
 * is NOT the same as "no longer open". The previous code conflated the two: it
 * read only `merged` and treated everything else as closed, which meant a PR
 * that merely fell outside the cap — or a request that failed with a 403
 * rate-limit — was recorded as closed. The task was then marked done, and an
 * `alreadyResolved` guard stopped it ever being reconciled back.
 *
 * So there are three answers here, not two, and `null` matters as much as the
 * other two: absence of evidence must never be recorded as closure.
 */

/** What the provider says about a PR we asked about directly. */
export type PrOutcome =
  /** Positively resolved — safe to mark the task done. */
  | { state: "merged" | "closed"; resolvedAt: string | null }
  /** Still open upstream; it was just outside the page we fetched. Leave it alone. */
  | { state: "open" };

/** `null` means "could not determine" — skip and retry on the next run. */
export type PrOutcomeOrUnknown = PrOutcome | null;

/** Shape of the bits of GitHub's pull-request payload we rely on. */
export interface GithubPrPayload {
  state?: string; // "open" | "closed" — note: a merged PR also reports "closed"
  merged?: boolean;
  merged_at?: string | null;
  closed_at?: string | null;
}

/** Shape of the bits of GitLab's merge-request payload we rely on. */
export interface GitlabMrPayload {
  state?: string; // "opened" | "merged" | "closed" | "locked"
  merged_at?: string | null;
  closed_at?: string | null;
}

/**
 * GitHub reports a merged PR as `state: "closed"` with `merged: true`, so
 * `merged` has to be checked before `state`. An explicitly open PR is reported
 * as still open rather than closed, which is the whole point of this function.
 */
export function githubOutcomeFromPayload(pr: GithubPrPayload | null | undefined): PrOutcomeOrUnknown {
  if (!pr) return null;
  if (pr.merged) return { state: "merged", resolvedAt: pr.merged_at ?? null };
  if (pr.state === "open") return { state: "open" };
  if (pr.state === "closed") return { state: "closed", resolvedAt: pr.closed_at ?? null };
  // Unrecognised or missing state — don't guess.
  return null;
}

/** GitLab says "opened" (not "open"), and has a "locked" state that is not terminal. */
export function gitlabOutcomeFromPayload(mr: GitlabMrPayload | null | undefined): PrOutcomeOrUnknown {
  if (!mr) return null;
  switch (mr.state) {
    case "merged":
      return { state: "merged", resolvedAt: mr.merged_at ?? null };
    case "opened":
    case "locked":
      return { state: "open" };
    case "closed":
      return { state: "closed", resolvedAt: mr.closed_at ?? null };
    default:
      return null;
  }
}

/** True when the outcome is positive enough to mark a task done. */
export function isResolvedOutcome(
  outcome: PrOutcomeOrUnknown,
): outcome is { state: "merged" | "closed"; resolvedAt: string | null } {
  return outcome !== null && outcome.state !== "open";
}
