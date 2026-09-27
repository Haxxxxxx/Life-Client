import {
  Timestamp,
  type Firestore,
  type PartialWithFieldValue,
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { nextOccurrenceDate } from "./recurrence";
import type { NewTask, Task, TaskStatus } from "./types";
import { setViceLogCompensated } from "./vices";

function tasksCollection(db: Firestore, uid: string) {
  return collection(db, "users", uid, "tasks");
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
      const tasks = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Task);
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
    (snapshot) => onChange(snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as Task) : null),
    (error) => onError?.(error),
  );
}

export async function createTask(db: Firestore, uid: string, task: NewTask): Promise<string> {
  const ref = await addDoc(tasksCollection(db, uid), {
    ...task,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateTask(
  db: Firestore,
  uid: string,
  taskId: string,
  patch: PartialWithFieldValue<NewTask>,
): Promise<void> {
  await updateDoc(doc(db, "users", uid, "tasks", taskId), {
    ...patch,
    updatedAt: serverTimestamp(),
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
      ? { status, completedAt: serverTimestamp() }
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
