import {
  Timestamp,
  type Firestore,
  type PartialWithFieldValue,
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";
import { nextOccurrenceDate } from "./recurrence";
import type { TaskPatch, NewTask, Task, TaskStatus } from "./types";
import { setViceLogCompensated } from "./vices";

function tasksCollection(db: Firestore, uid: string) {
  return collection(db, "users", uid, "tasks");
}

/**
 * Normalises a timestamp field to an ISO string.
 *
 * `createdAt` was written two different ways into the same collection:
 * `serverTimestamp()` (a Firestore Timestamp) by createTask, and an ISO string
 * by the dev-activity sync. Firestore orders by *type* before value, so the
 * two never interleaved and `orderBy("createdAt", "desc")` returned two
 * separate blocks — the task list was simply in the wrong order. The `as Task`
 * cast hid it, because the declared type says `string`.
 *
 * New writes are ISO strings (below), but documents written the old way are
 * still in the database, so reads normalise rather than assume.
 */
function toIsoString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const ts = value as { toDate?: () => Date; seconds?: number };
    if (typeof ts.toDate === "function") return ts.toDate().toISOString();
    if (typeof ts.seconds === "number") return new Date(ts.seconds * 1000).toISOString();
  }
  return new Date(0).toISOString();
}

/** Shapes a raw Firestore document into a Task with consistent timestamps. */
function toTask(id: string, raw: Record<string, unknown>): Task {
  return {
    ...(raw as Omit<Task, "id">),
    id,
    createdAt: toIsoString(raw.createdAt),
    updatedAt: toIsoString(raw.updatedAt),
  };
}

export function subscribeTasks(
  db: Firestore,
  uid: string,
  onChange: (tasks: Task[]) => void,
  onError?: (error: Error) => void,
): () => void {
  const q = query(tasksCollection(db, uid), orderBy("createdAt", "desc"));
  return onSnapshot(
    q,
    (snapshot) => {
      const tasks = snapshot.docs.map((d) => toTask(d.id, d.data()));
      onChange(tasks);
    },
    (error) => onError?.(error),
  );
}

export function subscribeTask(
  db: Firestore,
  uid: string,
  taskId: string,
  onChange: (task: Task | null) => void,
  onError?: (error: Error) => void,
): () => void {
  return onSnapshot(
    doc(db, "users", uid, "tasks", taskId),
    (snapshot) => onChange(snapshot.exists() ? toTask(snapshot.id, snapshot.data()) : null),
    (error) => onError?.(error),
  );
}

export async function createTask(db: Firestore, uid: string, task: NewTask): Promise<string> {
  // ISO strings, not serverTimestamp(): the dev-activity sync and challenges
  // already write strings, and mixing the two types in one ordered collection
  // broke `orderBy("createdAt")` (see toIsoString above). One representation
  // for every writer; reads normalise whatever is already stored.
  const now = new Date().toISOString();
  const ref = await addDoc(tasksCollection(db, uid), {
    ...task,
    createdAt: now,
    updatedAt: now,
  });
  return ref.id;
}

/**
 * `null` in a patch means "clear this field"; `undefined` means "leave it".
 *
 * This used to rely on `ignoreUndefinedProperties`, and the comment in
 * firebase.ts claimed `dueDate: undefined` would clear it. It does the
 * opposite: the flag makes Firestore *drop* undefined keys from the write, and
 * `updateDoc` only touches the keys it is given — so the old value survived.
 * Choosing "No repeat", clearing a due date or unlinking a goal was a silent
 * no-op: the form closed as though it had saved, and the old value reappeared
 * on the next snapshot.
 *
 * `null` was already the convention here (setTaskStatus clears completedAt
 * that way), so it is the one that now actually deletes. Readers are
 * unaffected: every consumer treats a missing field and a null field the same.
 */
export async function updateTask(
  db: Firestore,
  uid: string,
  taskId: string,
  patch: TaskPatch,
): Promise<void> {
  const resolved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    resolved[key] = value === null ? deleteField() : value;
  }
  await updateDoc(doc(db, "users", uid, "tasks", taskId), {
    ...resolved,
    // ISO string, matching createTask and the sync — see toIsoString above.
    updatedAt: new Date().toISOString(),
  });
}

export async function setTaskStatus(
  db: Firestore,
  uid: string,
  taskId: string,
  status: TaskStatus,
): Promise<void> {
  // Moving a task off "done" un-archives it too — otherwise a task the cron
  // auto-archived (done 30+ days) would stay invisible forever even after
  // being reopened, since nothing else ever clears the flag. completedAt is
  // set/cleared here too, alongside status — see its doc comment on Task.
  await updateTask(
    db,
    uid,
    taskId,
    status === "done"
      ? { status, completedAt: new Date().toISOString() }
      : { status, archived: false, completedAt: null },
  );
}

export async function deleteTask(db: Firestore, uid: string, taskId: string): Promise<void> {
  await deleteDoc(doc(db, "users", uid, "tasks", taskId));
}

/** Drops tasks the daily cleanup cron auto-archived (done 30+ days) from a list view — they're never deleted, just hidden here. */
export function visibleTasks(tasks: Task[]): Task[] {
  return tasks.filter((t) => !t.archived);
}

/**
 * The complement of `visibleTasks`, for the archive view.
 *
 * Kept an exact complement on purpose: the cron archives unattended, so a task
 * hidden by one and not surfaced by the other is unreachable. The predicate is
 * the truthiness of `archived`, matching visibleTasks, so a task with the
 * field absent reads as "not archived" on both sides.
 */
export function archivedTasks(tasks: Task[]): Task[] {
  return tasks.filter((t) => Boolean(t.archived));
}

/**
 * Task.completedAt/updatedAt are typed as ISO strings but are actually set via
 * serverTimestamp(), which resolves to a Firestore Timestamp once read back from
 * a live listener — code that trusts the declared string type (e.g. `new Date(...)`
 * for charting) silently gets an Invalid Date. Normalizes either shape to a real ISO
 * string.
 */
export function taskTimestampToIso(value: string | Timestamp | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Timestamp ? value.toDate().toISOString() : value;
}

/**
 * Best available "when was this actually finished" timestamp for a done task.
 * completedAt is only set going forward from when that field shipped — tasks
 * completed before that have none, so anything charting completion history
 * falls back to updatedAt (imperfect — see setTaskStatus — but a closer
 * approximation than omitting historical completions entirely).
 */
export function taskCompletedIso(task: Task): string | null {
  return taskTimestampToIso(task.completedAt) ?? taskTimestampToIso(task.updatedAt);
}

/**
 * Sets a task's status, and — if it's a recurring task transitioning to "done" —
 * also creates the next occurrence (same fields, advanced dueDate, status reset to "todo").
 * If the task is a vice's compensating task (Task.viceLogId), marking it done also
 * flips the linked ViceLog to compensated, excluding its penalty going forward.
 */
export async function advanceTaskStatus(
  db: Firestore,
  uid: string,
  task: Task,
  nextStatus: TaskStatus,
): Promise<void> {
  if (nextStatus === "done" && task.recurrence && task.dueDate) {
    // archived/completedAt must NOT carry over — the source task is the one
    // becoming done (and getting those set by setTaskStatus below), while the
    // occurrence created here starts fresh as "todo".
    const {
      id: _id,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      archived: _archived,
      completedAt: _completedAt,
      ...rest
    } = task;
    await createTask(db, uid, {
      ...rest,
      dueDate: nextOccurrenceDate(task.dueDate, task.recurrence),
      status: "todo",
    });
  }
  if (task.viceLogId) {
    await setViceLogCompensated(db, uid, task.viceLogId, nextStatus === "done");
  }
  await setTaskStatus(db, uid, task.id, nextStatus);
}
