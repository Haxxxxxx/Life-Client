import { describe, expect, it } from "vitest";
import {
  githubOutcomeFromPayload,
  gitlabOutcomeFromPayload,
  isResolvedOutcome,
  type PrOutcomeOrUnknown,
} from "./prOutcome";

describe("githubOutcomeFromPayload", () => {
  it("reports an open PR as open, not closed", () => {
    // The regression: the old code read only `merged`, so an open PR that fell
    // outside the fetch cap was recorded as closed and its task marked done,
    // permanently.
    expect(githubOutcomeFromPayload({ state: "open", merged: false })).toEqual({ state: "open" });
  });

  it("reports a merged PR as merged even though GitHub also calls it closed", () => {
    expect(githubOutcomeFromPayload({ state: "closed", merged: true, merged_at: "2026-11-01T10:00:00Z" })).toEqual({
      state: "merged",
      resolvedAt: "2026-11-01T10:00:00Z",
    });
  });

  it("reports a genuinely closed PR as closed", () => {
    expect(githubOutcomeFromPayload({ state: "closed", merged: false, closed_at: "2026-11-02T10:00:00Z" })).toEqual({
      state: "closed",
      resolvedAt: "2026-11-02T10:00:00Z",
    });
  });

  it("returns null rather than guessing on a missing or unrecognised state", () => {
    expect(githubOutcomeFromPayload({})).toBeNull();
    expect(githubOutcomeFromPayload({ state: "weird" })).toBeNull();
    expect(githubOutcomeFromPayload(null)).toBeNull();
    expect(githubOutcomeFromPayload(undefined)).toBeNull();
  });

  it("never reports an open PR as resolved, whatever the timestamps say", () => {
    // Defensive: stale closed_at on a reopened PR must not resolve it.
    const outcome = githubOutcomeFromPayload({ state: "open", merged: false, closed_at: "2026-10-01T00:00:00Z" });
    expect(isResolvedOutcome(outcome)).toBe(false);
  });
});

describe("gitlabOutcomeFromPayload", () => {
  it('treats "opened" as open — GitLab does not say "open"', () => {
    expect(gitlabOutcomeFromPayload({ state: "opened" })).toEqual({ state: "open" });
  });

  it('treats "locked" as open, since it is not a terminal state', () => {
    expect(gitlabOutcomeFromPayload({ state: "locked" })).toEqual({ state: "open" });
  });

  it("resolves merged and closed", () => {
    expect(gitlabOutcomeFromPayload({ state: "merged", merged_at: "2026-11-01T10:00:00Z" })).toEqual({
      state: "merged",
      resolvedAt: "2026-11-01T10:00:00Z",
    });
    expect(gitlabOutcomeFromPayload({ state: "closed", closed_at: "2026-11-02T10:00:00Z" })).toEqual({
      state: "closed",
      resolvedAt: "2026-11-02T10:00:00Z",
    });
  });

  it("returns null on a missing or unrecognised state", () => {
    expect(gitlabOutcomeFromPayload({})).toBeNull();
    expect(gitlabOutcomeFromPayload({ state: "sorta-open" })).toBeNull();
    expect(gitlabOutcomeFromPayload(null)).toBeNull();
  });

  it("tolerates a missing timestamp without inventing one", () => {
    expect(gitlabOutcomeFromPayload({ state: "merged" })).toEqual({ state: "merged", resolvedAt: null });
  });
});

describe("isResolvedOutcome", () => {
  it("is true only for merged and closed", () => {
    expect(isResolvedOutcome({ state: "merged", resolvedAt: null })).toBe(true);
    expect(isResolvedOutcome({ state: "closed", resolvedAt: null })).toBe(true);
  });

  it("is false for open and for unknown", () => {
    expect(isResolvedOutcome({ state: "open" })).toBe(false);
    expect(isResolvedOutcome(null)).toBe(false);
  });

  it("gates every outcome either provider can produce", () => {
    // The invariant that matters: nothing a provider can say should mark a
    // task done unless it positively means merged or closed.
    const everything: PrOutcomeOrUnknown[] = [
      githubOutcomeFromPayload({ state: "open", merged: false }),
      githubOutcomeFromPayload({ state: "closed", merged: true }),
      githubOutcomeFromPayload({ state: "closed", merged: false }),
      githubOutcomeFromPayload({}),
      gitlabOutcomeFromPayload({ state: "opened" }),
      gitlabOutcomeFromPayload({ state: "locked" }),
      gitlabOutcomeFromPayload({ state: "merged" }),
      gitlabOutcomeFromPayload({ state: "closed" }),
      gitlabOutcomeFromPayload({}),
    ];
    expect(everything.filter(isResolvedOutcome)).toHaveLength(4);
  });
});
