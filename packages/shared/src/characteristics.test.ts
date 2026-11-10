import { describe, expect, it } from "vitest";
import { computeFitnessXp, levelFromXp } from "./characteristics";
import type { SportActivity } from "./types";

function run(id: string, km: number, day: number): SportActivity {
  return {
    id,
    provider: "strava",
    kind: "endurance",
    type: "Run",
    name: `${km}km`,
    startDate: new Date(2026, 9, day, 7, 0).toISOString(),
    distanceMeters: km * 1000,
  } as SportActivity;
}

describe("computeFitnessXp", () => {
  it("is monotonic — adding an activity never lowers XP", () => {
    // The regression #29 describes: subscribeSportActivities capped at 50, so
    // logging a short run evicted the 51st-oldest activity. If that was a long
    // run, total fitness XP *fell* and the level could drop. The cap is gone;
    // this pins the property so it cannot come back via a new default limit.
    const history = Array.from({ length: 60 }, (_, i) => run(`long-${i}`, 20, (i % 28) + 1));
    const before = computeFitnessXp(history);
    const after = computeFitnessXp([run("short", 5, 1), ...history]);

    expect(after).toBeGreaterThanOrEqual(before);
  });

  it("grows with a longer history rather than plateauing at a window size", () => {
    const xpAt = (n: number) =>
      computeFitnessXp(Array.from({ length: n }, (_, i) => run(`r-${i}`, 10, (i % 28) + 1)));

    // If a 50-row cap were reinstated anywhere in this path, 50 and 120 would
    // produce the same number.
    expect(xpAt(120)).toBeGreaterThan(xpAt(50));
  });

  it("handles an empty history", () => {
    expect(computeFitnessXp([])).toBe(0);
  });
});

describe("levelFromXp", () => {
  it("is monotonic in xp", () => {
    let previous = -1;
    for (const xp of [0, 1, 99, 100, 101, 299, 300, 301, 1000, 5000]) {
      const { level } = levelFromXp(xp);
      expect(level).toBeGreaterThanOrEqual(previous);
      previous = level;
    }
  });

  it("puts exact thresholds on the right side", () => {
    // Cumulative thresholds are 50*L*(L-1): 100 -> L2, 300 -> L3.
    expect(levelFromXp(99).level).toBe(1);
    expect(levelFromXp(100).level).toBe(2);
    expect(levelFromXp(299).level).toBe(2);
    expect(levelFromXp(300).level).toBe(3);
  });

  it("clamps negative xp instead of returning a negative level", () => {
    expect(levelFromXp(-50).level).toBeGreaterThanOrEqual(1);
  });

  it("terminates on a non-finite input rather than looping forever", () => {
    // levelFromXp walks levels in a while loop; Infinity made it spin forever.
    expect(() => levelFromXp(Number.POSITIVE_INFINITY)).not.toThrow();
    expect(Number.isFinite(levelFromXp(Number.POSITIVE_INFINITY).level)).toBe(true);
    expect(() => levelFromXp(Number.NaN)).not.toThrow();
  });
});
