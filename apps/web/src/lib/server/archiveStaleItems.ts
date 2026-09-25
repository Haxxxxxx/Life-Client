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

// Firestore caps a WriteBatch at 500 operations.
const BATCH_LIMIT = 500;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
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
    const updates = [
      ...goalRefs.map((ref) => ({ ref, kind: "goal" as const, patch: { status: "archived" } })),
      ...taskRefs.map((ref) => ({ ref, kind: "task" as const, patch: { archived: true } })),
    ];
    if (updates.length === 0) continue;

    // Chunked so a user with 500+ combined stale items still gets archived in
    // full (across multiple batches) instead of the whole write failing, and
    // one chunk/user failing doesn't stop any other chunk or user from running.
    for (const group of chunk(updates, BATCH_LIMIT)) {
      try {
        const batch = adminDb.batch();
        for (const { ref, patch } of group) batch.update(ref, patch);
        await batch.commit();
        for (const { kind } of group) {
          if (kind === "goal") goals++;
          else tasks++;
        }
      } catch (err) {
        console.error(`archiveStaleItems: failed for uid ${uid}`, err);
      }
    }
  }

  return { users: byUid.size, goals, tasks };
}
