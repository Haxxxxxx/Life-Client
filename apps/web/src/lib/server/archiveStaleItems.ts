import type { DocumentReference, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "./admin";

// Non-destructive cleanup: items sitting "done" for this long quietly drop out
// of the main lists (Goal -> "archived" status, Task -> archived: true), but
// nothing is ever deleted — both remain fully queryable in Firestore.
const ARCHIVE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Goal.updatedAt is written as a plain ISO string (see goals.ts), but
 * Task.updatedAt is written via serverTimestamp() (see tasks.ts) and comes
 * back from the Admin SDK as a Firestore Timestamp — despite both being
 * typed `string` on the shared Task/Goal interfaces. Handle either shape
 * rather than assuming the TS type matches the runtime value.
 */
function toMillis(value: string | Timestamp | undefined): number | null {
  if (!value) return null;
  if (typeof value === "string") {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : ms;
  }
  return value.toDate().getTime();
}

interface StaleRefs {
  goalRefs: DocumentReference[];
  taskRefs: DocumentReference[];
}

export async function archiveStaleItemsForAllUsers(): Promise<{ users: number; goals: number; tasks: number }> {
  const cutoffMs = Date.now() - ARCHIVE_AFTER_MS;

  // One collectionGroup read per type covers every user in one pass — grouped
  // below by uid so each user gets their own WriteBatch (a batch is capped at
  // 500 ops, and one user's failure/overflow shouldn't skip everyone else's).
  const [completedGoals, doneTasks] = await Promise.all([
    adminDb.collectionGroup("goals").where("status", "==", "completed").get(),
    adminDb.collectionGroup("tasks").where("status", "==", "done").get(),
  ]);

  const byUid = new Map<string, StaleRefs>();
  function refsFor(uid: string): StaleRefs {
    let entry = byUid.get(uid);
    if (!entry) {
      entry = { goalRefs: [], taskRefs: [] };
      byUid.set(uid, entry);
    }
    return entry;
  }

  for (const doc of completedGoals.docs) {
    const uid = doc.ref.parent.parent?.id;
    if (!uid) continue;
    const updatedAtMs = toMillis(doc.data().updatedAt);
    if (updatedAtMs !== null && updatedAtMs < cutoffMs) refsFor(uid).goalRefs.push(doc.ref);
  }

  for (const doc of doneTasks.docs) {
    const uid = doc.ref.parent.parent?.id;
    if (!uid) continue;
    const data = doc.data();
    if (data.archived) continue;
    const updatedAtMs = toMillis(data.updatedAt);
    if (updatedAtMs !== null && updatedAtMs < cutoffMs) refsFor(uid).taskRefs.push(doc.ref);
  }

  let goals = 0;
  let tasks = 0;
  for (const [uid, { goalRefs, taskRefs }] of byUid) {
    if (goalRefs.length + taskRefs.length === 0) continue;
    try {
      const batch = adminDb.batch();
      for (const ref of goalRefs) batch.update(ref, { status: "archived" });
      for (const ref of taskRefs) batch.update(ref, { archived: true });
      await batch.commit();
      goals += goalRefs.length;
      tasks += taskRefs.length;
    } catch (err) {
      // Isolated per user (e.g. a single user with 500+ stale items in one
      // run) so it can't skip archiving for anyone else in the same cron run.
      console.error(`archiveStaleItems: failed for uid ${uid}`, err);
    }
  }

  return { users: byUid.size, goals, tasks };
}
