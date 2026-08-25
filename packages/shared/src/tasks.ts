import {
  type Firestore,
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
import type { NewTask, Task, TaskStatus } from "./types";

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
  patch: Partial<NewTask>,
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
  await updateTask(db, uid, taskId, { status });
}

export async function deleteTask(db: Firestore, uid: string, taskId: string): Promise<void> {
  await deleteDoc(doc(db, "users", uid, "tasks", taskId));
}
