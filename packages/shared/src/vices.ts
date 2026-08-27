import {
  type Firestore,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import type { CoreCharacteristicId, VicePreset, ViceLog } from "./types";

export const VICE_PRESETS: VicePreset[] = [
  {
    id: "fast_food",
    label: "Fast food",
    penaltyStat: "fitness",
    penaltyXp: 30,
    compensatingTaskTitle: "Log a workout to make up for it",
  },
  {
    id: "drinking",
    label: "Drinking",
    penaltyStat: "discipline",
    penaltyXp: 20,
    compensatingTaskTitle: "Close out a task you've been putting off",
  },
  {
    id: "doomscrolling",
    label: "Doomscrolling",
    penaltyStat: "focus",
    penaltyXp: 25,
    compensatingTaskTitle: "Do a focus session",
  },
  {
    id: "skipped_workout",
    label: "Skipped a workout",
    penaltyStat: "fitness",
    penaltyXp: 25,
    compensatingTaskTitle: "Get today's workout in",
  },
  {
    id: "junk_snacking",
    label: "Junk snacking",
    penaltyStat: "fitness",
    penaltyXp: 15,
    compensatingTaskTitle: "Log a healthy meal or workout",
  },
  {
    id: "skipped_reading",
    label: "Skipped reading",
    penaltyStat: "insight",
    penaltyXp: 15,
    compensatingTaskTitle: "Read an article from your reading list",
  },
];

export function vicePresetById(id: string): VicePreset | undefined {
  return VICE_PRESETS.find((v) => v.id === id);
}

function viceLogsCollection(db: Firestore, uid: string) {
  return collection(db, "users", uid, "viceLogs");
}

export function subscribeViceLogs(
  db: Firestore,
  uid: string,
  onChange: (logs: ViceLog[]) => void,
  onError?: (error: Error) => void,
): () => void {
  const q = query(viceLogsCollection(db, uid), orderBy("createdAt", "desc"));
  return onSnapshot(
    q,
    (snapshot) => onChange(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as ViceLog)),
    (error) => onError?.(error),
  );
}

/**
 * Logs a vice slip and, in the same atomic write, creates its compensating Task
 * (linked back via Task.viceLogId) — completing that task later flips this
 * log's `compensated` field, which excludes its penalty from the docked stat.
 */
export async function logVice(db: Firestore, uid: string, vicePresetId: string): Promise<void> {
  const preset = vicePresetById(vicePresetId);
  if (!preset) throw new Error(`Unknown vice preset: ${vicePresetId}`);

  const batch = writeBatch(db);
  const viceLogRef = doc(viceLogsCollection(db, uid));
  const taskRef = doc(collection(db, "users", uid, "tasks"));

  batch.set(viceLogRef, {
    viceId: preset.id,
    penaltyStat: preset.penaltyStat,
    penaltyXp: preset.penaltyXp,
    compensatingTaskId: taskRef.id,
    compensated: false,
    createdAt: new Date().toISOString(),
  });
  batch.set(taskRef, {
    title: preset.compensatingTaskTitle,
    status: "todo",
    priority: "medium",
    difficulty: "medium",
    category: "health",
    source: "manual",
    tags: [],
    viceLogId: viceLogRef.id,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
}

export async function setViceLogCompensated(db: Firestore, uid: string, viceLogId: string, compensated: boolean): Promise<void> {
  await updateDoc(doc(db, "users", uid, "viceLogs", viceLogId), { compensated });
}

export async function deleteViceLog(db: Firestore, uid: string, viceLogId: string): Promise<void> {
  await deleteDoc(doc(db, "users", uid, "viceLogs", viceLogId));
}

/** Sum of still-uncompensated penalty XP for a given core stat — subtract this from the stat's computed XP before leveling. */
export function computeVicePenalty(viceLogs: ViceLog[], stat: CoreCharacteristicId): number {
  return viceLogs
    .filter((v) => v.penaltyStat === stat && !v.compensated)
    .reduce((sum, v) => sum + v.penaltyXp, 0);
}
