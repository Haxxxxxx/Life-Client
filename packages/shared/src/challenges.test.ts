import { describe, expect, it } from "vitest";
import {
  MAX_CHALLENGE_DAYS,
  computeChallengeMilestones,
  computeChallengeProgress,
} from "./challenges";
import { canonicalExerciseType, type Challenge, type SportActivity } from "./types";

const NOW = new Date(2026, 10, 10, 12, 0, 0); // Tue 10 Nov 2026, local noon

function challenge(over: Partial<Challenge> = {}): Challenge {
  return {
    id: "c1",
    title: "30 Days of Running",
    exerciseType: "Running",
    metric: "sessions",
    dailyTarget: 1,
    durationDays: 30,
    startDate: "2026-11-08",
    createdAt: "2026-11-08T00:00:00.000Z",
    ...over,
  } as Challenge;
}

/** A Strava-synced activity: note the type is Strava's word, not ours. */
function activity(type: string, day: number, over: Partial<SportActivity> = {}): SportActivity {
  return {
    id: `a-${type}-${day}`,
    provider: "strava",
    kind: "endurance",
    type,
    name: "Morning session",
    startDate: new Date(2026, 10, day, 7, 0).toISOString(),
    ...over,
  } as SportActivity;
}

describe("canonicalExerciseType", () => {
  it("maps Strava's words onto our presets", () => {
    expect(canonicalExerciseType("Run")).toBe("Running");
    expect(canonicalExerciseType("TrailRun")).toBe("Running");
    expect(canonicalExerciseType("VirtualRun")).toBe("Running");
    expect(canonicalExerciseType("Ride")).toBe("Cycling");
    expect(canonicalExerciseType("VirtualRide")).toBe("Cycling");
    expect(canonicalExerciseType("EBikeRide")).toBe("Cycling");
    expect(canonicalExerciseType("Swim")).toBe("Swimming");
  });

  it("is idempotent, so our own presets pass through unchanged", () => {
    for (const preset of ["Running", "Cycling", "Swimming"]) {
      expect(canonicalExerciseType(preset)).toBe(preset);
      expect(canonicalExerciseType(canonicalExerciseType(preset))).toBe(preset);
    }
  });

  it("leaves strength presets and unknown types alone", () => {
    expect(canonicalExerciseType("Push-ups")).toBe("Push-ups");
    expect(canonicalExerciseType("Squats")).toBe("Squats");
    expect(canonicalExerciseType("Kitesurf")).toBe("Kitesurf");
  });

  it("is case-insensitive and trims", () => {
    expect(canonicalExerciseType("  run  ")).toBe("Running");
    expect(canonicalExerciseType("RIDE")).toBe("Cycling");
  });

  it("handles empty input without throwing", () => {
    expect(canonicalExerciseType("")).toBe("");
    expect(canonicalExerciseType(null)).toBe("");
    expect(canonicalExerciseType(undefined)).toBe("");
  });
});

describe("computeChallengeProgress — Strava activities count toward challenges", () => {
  it('counts a Strava "Run" toward a "Running" challenge', () => {
    // Regression: the raw !== compare meant this was 0/3 with a 0 streak, so a
    // Strava-fed challenge could never progress or hit a milestone.
    const progress = computeChallengeProgress(
      challenge(),
      [activity("Run", 8), activity("Run", 9), activity("Run", 10)],
      NOW,
    );
    expect(progress.completedCount).toBe(3);
    expect(progress.currentStreak).toBe(3);
  });

  it("counts Strava variants too", () => {
    const progress = computeChallengeProgress(
      challenge(),
      [activity("TrailRun", 8), activity("VirtualRun", 9), activity("Run", 10)],
      NOW,
    );
    expect(progress.completedCount).toBe(3);
  });

  it('counts "Ride" toward Cycling and "Swim" toward Swimming', () => {
    expect(
      computeChallengeProgress(
        challenge({ exerciseType: "Cycling" }),
        [activity("Ride", 9), activity("EBikeRide", 10)],
        NOW,
      ).completedCount,
    ).toBe(2);

    expect(
      computeChallengeProgress(challenge({ exerciseType: "Swimming" }), [activity("Swim", 10)], NOW)
        .completedCount,
    ).toBe(1);
  });

  it("still excludes activities of a genuinely different sport", () => {
    const progress = computeChallengeProgress(
      challenge(),
      [activity("Ride", 8), activity("Swim", 9), activity("Push-ups", 10)],
      NOW,
    );
    expect(progress.completedCount).toBe(0);
  });

  it("still sums reps for a strength challenge", () => {
    const progress = computeChallengeProgress(
      challenge({ exerciseType: "Push-ups", metric: "reps", dailyTarget: 50 }),
      [
        activity("Push-ups", 9, { kind: "strength", reps: 25, sets: 2 }),
        activity("Push-ups", 10, { kind: "strength", reps: 10, sets: 2 }),
      ],
      NOW,
    );
    // day 9: 25*2 = 50 -> complete. day 10: 10*2 = 20 -> not complete.
    expect(progress.completedCount).toBe(1);
  });

  it("ignores activities outside the challenge window", () => {
    const progress = computeChallengeProgress(
      challenge({ startDate: "2026-11-09" }),
      [activity("Run", 7), activity("Run", 8), activity("Run", 10)],
      NOW,
    );
    expect(progress.completedCount).toBe(1);
  });
});

describe("challenge values that should never have been stored", () => {
  const now = new Date(2026, 10, 16, 12, 0, 0);
  const base = {
    id: "c",
    title: "c",
    exerciseType: "Running",
    metric: "distanceMeters" as const,
    dailyTarget: 5000,
    durationDays: 10,
    startDate: "2026-11-10",
    archived: false,
  };

  it("never marks a day complete against a negative daily target", () => {
    // Typing "-5" km into the form stored -5000, and `value >= dailyTarget`
    // then held on every single day: a full streak and a 100% completion rate
    // with no activity logged at all.
    const progress = computeChallengeProgress(
      { ...base, dailyTarget: -5000 } as Challenge,
      [],
      now,
    );
    expect(progress.completedCount).toBe(0);
    expect(progress.currentStreak).toBe(0);
    expect(progress.longestStreak).toBe(0);
    expect(progress.days.every((d) => !d.completed)).toBe(true);
  });

  it("never marks a day complete against a zero daily target", () => {
    const progress = computeChallengeProgress({ ...base, dailyTarget: 0 } as Challenge, [], now);
    expect(progress.completedCount).toBe(0);
  });

  it("still completes days normally for a positive target", () => {
    const progress = computeChallengeProgress(base as Challenge, [
      {
        id: "a",
        kind: "endurance",
        type: "Running",
        name: "Running",
        startDate: new Date(2026, 10, 12, 8, 0).toISOString(),
        distanceMeters: 6000,
      },
    ] as SportActivity[], now);
    expect(progress.completedCount).toBe(1);
  });

  it("bounds the day walk for an absurd duration rather than iterating forever", () => {
    // `dates` is an unbounded walk from the start date, and its only bound is
    // the challenge's own duration. 400,000 days would be built on every
    // render of the card.
    const progress = computeChallengeProgress(
      { ...base, durationDays: 400_000, startDate: "1000-01-01" } as Challenge,
      [],
      now,
    );
    expect(progress.totalDaysSoFar).toBeLessThanOrEqual(MAX_CHALLENGE_DAYS);
  });

  it("treats a zero duration as one day rather than producing nothing", () => {
    const progress = computeChallengeProgress({ ...base, durationDays: 0 } as Challenge, [], now);
    expect(progress.totalDaysSoFar).toBeGreaterThan(0);
  });

  it("gives real milestone percentages for a zero duration instead of NaN", () => {
    // completedCount / 0 is NaN, and every `NaN >= threshold` below is
    // silently false, so the card showed no milestones at all.
    const progress = computeChallengeProgress({ ...base, durationDays: 0 } as Challenge, [], now);
    const milestones = computeChallengeMilestones({ ...base, durationDays: 0 } as Challenge, progress);
    expect(milestones).toHaveLength(4);
    expect(milestones.every((m) => typeof m.achieved === "boolean")).toBe(true);
  });
});
