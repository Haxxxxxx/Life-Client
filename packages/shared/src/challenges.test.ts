import { describe, expect, it } from "vitest";
import { computeChallengeProgress } from "./challenges";
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
