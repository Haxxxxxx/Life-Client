import {
  type Firestore,
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";
import { addDays, computeCurrentStreak, computeLongestStreak, dateRange, toDateStr } from "./streaks";
import { canonicalExerciseType } from "./types";
import type {
  Challenge,
  ChallengeDayStatus,
  ChallengeMilestone,
  ChallengeProgress,
  NewChallenge,
  SportActivity,
} from "./types";

function challengesCollection(db: Firestore, uid: string) {
  return collection(db, "users", uid, "challenges");
}

export function subscribeChallenges(
  db: Firestore,
  uid: string,
  onChange: (challenges: Challenge[]) => void,
  onError?: (error: Error) => void,
): () => void {
  const q = query(challengesCollection(db, uid), orderBy("createdAt", "desc"));
  return onSnapshot(
    q,
    (snapshot) => onChange(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Challenge)),
    (error) => onError?.(error),
  );
}

export async function createChallenge(db: Firestore, uid: string, challenge: NewChallenge): Promise<string> {
  const ref = await addDoc(challengesCollection(db, uid), {
    ...challenge,
    createdAt: new Date().toISOString(),
  });
  return ref.id;
}

export async function updateChallenge(
  db: Firestore,
  uid: string,
  challengeId: string,
  patch: Partial<Pick<Challenge, "title" | "dailyTarget" | "durationDays">>,
): Promise<void> {
  await updateDoc(doc(db, "users", uid, "challenges", challengeId), patch);
}

export async function archiveChallenge(db: Firestore, uid: string, challengeId: string): Promise<void> {
  await updateDoc(doc(db, "users", uid, "challenges", challengeId), { archived: true });
}

export async function deleteChallenge(db: Firestore, uid: string, challengeId: string): Promise<void> {
  await deleteDoc(doc(db, "users", uid, "challenges", challengeId));
}

/** Derives daily completion/streak from actual logged SportActivity entries — no separate manual check-in needed. */
export function computeChallengeProgress(
  challenge: Challenge,
  activities: SportActivity[],
  now: Date = new Date(),
): ChallengeProgress {
  const today = toDateStr(now);
  // Clamped rather than trusted. These values reach us from a form and from
  // whatever is already stored, and `dates` below is an unbounded walk from the
  // start date, so a duration of 0 or 400,000 is the difference between a
  // rendered card and a frozen one.
  const durationDays = Math.min(Math.max(1, Math.floor(challenge.durationDays || 1)), MAX_CHALLENGE_DAYS);
  const endDate = addDays(challenge.startDate, durationDays - 1);
  const isFinished = today > endDate;
  const lastDay = isFinished ? endDate : today;
  const dates = challenge.startDate <= lastDay ? dateRange(challenge.startDate, lastDay) : [];

  const valueByDate = new Map<string, number>();
  for (const activity of activities) {
    // Canonical on both sides: Strava writes "Run"/"TrailRun", the challenge
    // form stores "Running". A raw !== compare never matched a synced activity.
    if (canonicalExerciseType(activity.type) !== canonicalExerciseType(challenge.exerciseType)) continue;
    const date = toDateStr(new Date(activity.startDate));
    if (date < challenge.startDate || date > lastDay) continue;
    const contribution =
      challenge.metric === "reps"
        ? (activity.reps ?? 0) * (activity.sets ?? 1)
        : challenge.metric === "distanceMeters"
          ? (activity.distanceMeters ?? 0)
          : 1; // sessions: each logged activity counts once
    valueByDate.set(date, (valueByDate.get(date) ?? 0) + contribution);
  }

  // A non-positive daily target is unreachable, not trivially met. Stored as
  // -5000 (a "-5 km" target typed into the form), `value >= dailyTarget` held
  // on every single day, so an untouched challenge reported a full streak and
  // a 100% completion rate without a single logged activity.
  const target = challenge.dailyTarget;
  const days: ChallengeDayStatus[] = dates.map((date) => {
    const value = valueByDate.get(date) ?? 0;
    return { date, value, completed: target > 0 && value >= target };
  });

  return {
    days,
    currentStreak: computeCurrentStreak(days),
    longestStreak: computeLongestStreak(days),
    completedCount: days.filter((d) => d.completed).length,
    totalDaysSoFar: days.length,
    isFinished,
  };
}

/**
 * Upper bound on a challenge's length, in days.
 *
 * computeChallengeProgress walks every day from the start date, so the only
 * thing keeping that loop small is the challenge's own duration. A year-1000
 * start date once made it iterate about 365,000 days on every render of every
 * card. Mobile clamped its form input to this; it belongs here, where the
 * invariant it protects actually lives.
 */
export const MAX_CHALLENGE_DAYS = 3660;

const MILESTONE_THRESHOLDS = [25, 50, 75, 100];

/** Fixed checkpoints at 25/50/75/100% of the challenge's duration, derived from already-tracked progress. */
export function computeChallengeMilestones(
  challenge: Challenge,
  progress: ChallengeProgress,
): ChallengeMilestone[] {
  // durationDays of 0 would make this NaN, and every `NaN >= threshold`
  // comparison below silently false.
  const durationDays = Math.max(1, Math.floor(challenge.durationDays || 1));
  const percentDone = (progress.completedCount / durationDays) * 100;
  return MILESTONE_THRESHOLDS.map((thresholdPercent) => ({
    thresholdPercent,
    label: thresholdPercent === 100 ? "Complete" : `${thresholdPercent}%`,
    achieved: percentDone >= thresholdPercent,
  }));
}
