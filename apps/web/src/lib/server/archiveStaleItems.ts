import { adminDb } from "./admin";

// Non-destructive cleanup: items sitting "done" for this long quietly drop out
// of the main lists (Goal -> "archived" status, Task -> archived: true), but
// nothing is ever deleted — both remain fully queryable in Firestore.
const ARCHIVE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

async function allUidsWithGoalsOrTasks(): Promise<string[]> {
  const [goalsSnap, tasksSnap] = await Promise.all([
    adminDb.collectionGroup("goals").get(),
    adminDb.collectionGroup("tasks").get(),
  ]);
  const uids = new Set<string>();
  for (const doc of [...goalsSnap.docs, ...tasksSnap.docs]) {
    const uid = doc.ref.parent.parent?.id;
    if (uid) uids.add(uid);
  }
  return [...uids];
}

async function archiveForUser(uid: string): Promise<{ goals: number; tasks: number }> {
  const cutoff = new Date(Date.now() - ARCHIVE_AFTER_MS).toISOString();
  const userRef = adminDb.collection("users").doc(uid);

  const [completedGoals, doneTasks] = await Promise.all([
    userRef.collection("goals").where("status", "==", "completed").get(),
    userRef.collection("tasks").where("status", "==", "done").get(),
  ]);

  const batch = adminDb.batch();
  let goals = 0;
  for (const doc of completedGoals.docs) {
    const updatedAt = doc.data().updatedAt as string | undefined;
    if (updatedAt && updatedAt < cutoff) {
      batch.update(doc.ref, { status: "archived" });
      goals++;
    }
  }

  let tasks = 0;
  for (const doc of doneTasks.docs) {
    const data = doc.data();
    if (data.archived) continue;
    const updatedAt = data.updatedAt as string | undefined;
    if (updatedAt && updatedAt < cutoff) {
      batch.update(doc.ref, { archived: true });
      tasks++;
    }
  }

  if (goals + tasks > 0) await batch.commit();
  return { goals, tasks };
}

export async function archiveStaleItemsForAllUsers(): Promise<{ users: number; goals: number; tasks: number }> {
  const uids = await allUidsWithGoalsOrTasks();
  let goals = 0;
  let tasks = 0;
  for (const uid of uids) {
    const result = await archiveForUser(uid);
    goals += result.goals;
    tasks += result.tasks;
  }
  return { users: uids.length, goals, tasks };
}
