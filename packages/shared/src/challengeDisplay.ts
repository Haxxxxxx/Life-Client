import type { ChallengeMetric, SportActivityKind } from "./types";

/**
 * Presentation rules for challenges, shared by both clients.
 *
 * Kept out of challenges.ts on purpose: that module imports firebase/firestore
 * for its subscribe/create helpers, so anything living there drags the
 * Firestore SDK into every consumer. These are pure functions of their
 * arguments, so they belong in a module with no I/O — which also makes them
 * testable without a backend, as prOutcome.ts and format.ts already are.
 *
 * Both sports screens had their own copy of all five. They were identical
 * apart from quote style, which is the only reason the two platforms still
 * agreed on what a challenge is called.
 */

/** Which metrics make sense for a given activity kind. */
export const METRICS_FOR_KIND: Record<SportActivityKind, ChallengeMetric[]> = {
  endurance: ["distanceMeters", "sessions"],
  strength: ["reps", "sessions"],
};

/**
 * Sensible starting target per metric, in the unit the *form* shows.
 *
 * distanceMeters is offered in kilometres and converted to metres — the unit
 * Challenge.dailyTarget is stored in — when the form is submitted. The two
 * screens typed this differently, number on web and string on mobile, because
 * mobile holds form state as text. The shared value is the number; mobile
 * stringifies at the point of use, so the default itself cannot drift.
 */
export const DEFAULT_TARGET_FOR_METRIC: Record<ChallengeMetric, number> = {
  reps: 100,
  distanceMeters: 5,
  sessions: 1,
};

/** Short unit label for a metric, as it appears beside an input. */
export function metricUnitLabel(metric: ChallengeMetric): string {
  return metric === "distanceMeters" ? "km" : metric === "sessions" ? "sessions" : "reps";
}

/**
 * A stored metric value rendered for display.
 *
 * Distance is stored in metres and shown in kilometres, dropping the decimals
 * when they would read as `.00`.
 */
export function formatMetricValue(metric: ChallengeMetric, value: number): string {
  if (metric === "distanceMeters") {
    const km = value / 1000;
    return `${km % 1 === 0 ? km.toFixed(0) : km.toFixed(2)}km`;
  }
  if (metric === "sessions") return `${value} ${value === 1 ? "session" : "sessions"}`;
  return `${value} reps`;
}

/**
 * The auto-generated name for a challenge, e.g. "30 Days of 5km Running".
 *
 * `dailyTargetDisplay` is in the form's unit, not the stored one — kilometres
 * for distance — because this names what the user typed.
 */
export function buildChallengeTitle(
  durationDays: number,
  metric: ChallengeMetric,
  dailyTargetDisplay: number,
  type: string,
): string {
  if (metric === "sessions") return `${durationDays} Days of ${type}`;
  const target = dailyTargetDisplay % 1 === 0 ? dailyTargetDisplay.toFixed(0) : dailyTargetDisplay.toFixed(1);
  return `${durationDays} Days of ${target}${metric === "distanceMeters" ? "km" : ""} ${type}`;
}
