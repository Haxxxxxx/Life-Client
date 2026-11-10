import {
  type Firestore,
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import type { SportActivity } from "./types";

export type NewManualSportActivity = Omit<SportActivity, "id" | "provider" | "externalId" | "externalUrl">;

export async function createManualSportActivity(
  db: Firestore,
  uid: string,
  activity: NewManualSportActivity,
): Promise<string> {
  const ref = await addDoc(collection(db, "users", uid, "sportActivities"), {
    ...activity,
    provider: "manual",
  });
  return ref.id;
}

export async function deleteSportActivity(db: Firestore, uid: string, activityId: string): Promise<void> {
  await deleteDoc(doc(db, "users", uid, "sportActivities", activityId));
}

/**
 * `max` defaults to null (no limit) on purpose.
 *
 * It used to default to 50, but every caller takes the default and every
 * caller feeds the result into something that needs the *whole* history:
 * `computeFitnessXp` and `computeChallengeProgress`. A capped window made both
 * wrong. XP stopped being monotonic — logging a 5 km run (+55) evicted the
 * 51st-oldest activity, so if that was a 20 km run (−205) your fitness level
 * went *down* because you exercised. And a challenge longer than the window
 * could never complete: a 100-day challenge read its early days as zero and
 * capped at 50/100, so the 75% and 100% milestones were unreachable.
 *
 * Pass an explicit `max` only for a genuinely display-only "most recent N"
 * list, never for anything that aggregates.
 */
export function subscribeSportActivities(
  db: Firestore,
  uid: string,
  onChange: (activities: SportActivity[]) => void,
  onError?: (error: Error) => void,
  max: number | null = null,
): () => void {
  const q = query(
    collection(db, "users", uid, "sportActivities"),
    orderBy("startDate", "desc"),
    ...(max === null ? [] : [limit(max)]),
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const activities = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as SportActivity);
      onChange(activities);
    },
    (error) => onError?.(error),
  );
}
