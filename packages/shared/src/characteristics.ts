import {
  type Firestore,
  doc,
  increment,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import type {
  CharacteristicId,
  CharacteristicLevel,
  DevActivitySummary,
  ManualProgress,
  SportActivity,
  Task,
} from "./types";

const XP_PER_MANUAL_SESSION = 20;
const XP_PER_TASK_DONE = 15;
const XP_PER_KM = 10;
const XP_PER_SPORT_SESSION = 5;
const XP_PER_MERGED_PR = 25;
const XP_PER_OPEN_PR = 5;

/** Linear level curve: level N -> N+1 costs 100*N xp. */
export function levelFromXp(totalXp: number): CharacteristicLevel {
  let level = 1;
  let remaining = Math.max(0, totalXp);
  let xpForNextLevel = 100 * level;

  while (remaining >= xpForNextLevel) {
    remaining -= xpForNextLevel;
    level += 1;
    xpForNextLevel = 100 * level;
  }

  return {
    level,
    totalXp,
    xpIntoLevel: remaining,
    xpForNextLevel,
    progress: remaining / xpForNextLevel,
  };
}

export function computeDisciplineXp(tasks: Task[]): number {
  return tasks.filter((t) => t.status === "done").length * XP_PER_TASK_DONE;
}

export function computeFitnessXp(activities: SportActivity[]): number {
  const totalKm = activities.reduce((sum, a) => sum + (a.distanceMeters ?? 0), 0) / 1000;
  return Math.round(totalKm * XP_PER_KM) + activities.length * XP_PER_SPORT_SESSION;
}

export function computeCraftXp(
  github: DevActivitySummary | null,
  gitlab: DevActivitySummary | null,
): number {
  const merged = (github?.totalMergedCount ?? 0) + (gitlab?.totalMergedCount ?? 0);
  const open = (github?.openPullRequests.length ?? 0) + (gitlab?.openPullRequests.length ?? 0);
  return merged * XP_PER_MERGED_PR + open * XP_PER_OPEN_PR;
}

function manualProgressDoc(db: Firestore, uid: string, characteristicId: CharacteristicId) {
  return doc(db, "users", uid, "manualProgress", characteristicId);
}

export function subscribeManualProgress(
  db: Firestore,
  uid: string,
  characteristicId: CharacteristicId,
  onChange: (progress: ManualProgress | null) => void,
): () => void {
  return onSnapshot(manualProgressDoc(db, uid, characteristicId), (snapshot) => {
    onChange(snapshot.exists() ? (snapshot.data() as ManualProgress) : null);
  });
}

export async function logManualSession(
  db: Firestore,
  uid: string,
  characteristicId: CharacteristicId,
): Promise<void> {
  await setDoc(
    manualProgressDoc(db, uid, characteristicId),
    {
      characteristicId,
      sessionCount: increment(1),
      xp: increment(XP_PER_MANUAL_SESSION),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}
