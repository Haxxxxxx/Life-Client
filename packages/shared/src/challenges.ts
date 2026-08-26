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

function toDateStr(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y!, m! - 1, d!);
  date.setDate(date.getDate() + days);
  return toDateStr(date);
}

function dateRange(start: string, end: string): string[] {
  const result: string[] = [];
  let cur = start;
  while (cur <= end) {
    result.push(cur);
    cur = addDays(cur, 1);
  }
  return result;
}

function computeCurrentStreak(days: ChallengeDayStatus[]): number {
  let i = days.length - 1;
  // Today may simply not be logged yet — don't treat that as breaking the
  // streak, just don't count it until it's actually done.
  if (i >= 0 && !days[i]!.completed) i -= 1;
  let streak = 0;
  for (; i >= 0; i--) {
    if (!days[i]!.completed) break;
    streak += 1;
  }
  return streak;
}

function computeLongestStreak(days: ChallengeDayStatus[]): number {
  let longest = 0;
  let current = 0;
  for (const day of days) {
    if (day.completed) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  return longest;
}

/** Derives daily completion/streak from actual logged SportActivity entries — no separate manual check-in needed. */
export function computeChallengeProgress(
  challenge: Challenge,
  activities: SportActivity[],
  now: Date = new Date(),
): ChallengeProgress {
  const today = toDateStr(now);
  const endDate = addDays(challenge.startDate, challenge.durationDays - 1);
  const isFinished = today > endDate;
  const lastDay = isFinished ? endDate : today;
  const dates = challenge.startDate <= lastDay ? dateRange(challenge.startDate, lastDay) : [];

  const valueByDate = new Map<string, number>();
  for (const activity of activities) {
    if (activity.type !== challenge.exerciseType) continue;
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

  const days: ChallengeDayStatus[] = dates.map((date) => {
    const value = valueByDate.get(date) ?? 0;
    return { date, value, completed: value >= challenge.dailyTarget };
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

const MILESTONE_THRESHOLDS = [25, 50, 75, 100];

/** Fixed checkpoints at 25/50/75/100% of the challenge's duration, derived from already-tracked progress. */
export function computeChallengeMilestones(
  challenge: Challenge,
  progress: ChallengeProgress,
): ChallengeMilestone[] {
  const percentDone = (progress.completedCount / challenge.durationDays) * 100;
  return MILESTONE_THRESHOLDS.map((thresholdPercent) => ({
    thresholdPercent,
    label: thresholdPercent === 100 ? "Complete" : `${thresholdPercent}%`,
    achieved: percentDone >= thresholdPercent,
  }));
}
