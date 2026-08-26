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
import type { Goal, GoalProgress, GoalStatus, NewGoal, Task } from "./types";

function goalsCollection(db: Firestore, uid: string) {
  return collection(db, "users", uid, "goals");
}

export function subscribeGoals(
  db: Firestore,
  uid: string,
  onChange: (goals: Goal[]) => void,
  onError?: (error: Error) => void,
): () => void {
  const q = query(goalsCollection(db, uid), orderBy("createdAt", "desc"));
  return onSnapshot(
    q,
    (snapshot) => onChange(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Goal)),
    (error) => onError?.(error),
  );
}

export async function createGoal(db: Firestore, uid: string, goal: NewGoal): Promise<string> {
  const now = new Date().toISOString();
  const ref = await addDoc(goalsCollection(db, uid), {
    ...goal,
    status: "active" satisfies GoalStatus,
    createdAt: now,
    updatedAt: now,
  });
  return ref.id;
}

export async function updateGoal(
  db: Firestore,
  uid: string,
  goalId: string,
  patch: Partial<NewGoal>,
): Promise<void> {
  await updateDoc(doc(db, "users", uid, "goals", goalId), {
    ...patch,
    updatedAt: new Date().toISOString(),
  });
}

export async function setGoalStatus(db: Firestore, uid: string, goalId: string, status: GoalStatus): Promise<void> {
  await updateDoc(doc(db, "users", uid, "goals", goalId), { status, updatedAt: new Date().toISOString() });
}

export async function deleteGoal(db: Firestore, uid: string, goalId: string): Promise<void> {
  await deleteDoc(doc(db, "users", uid, "goals", goalId));
}

export function computeGoalProgress(goal: Goal, tasks: Task[]): GoalProgress {
  const linked = tasks.filter((t) => t.goalId === goal.id);
  const completed = linked.filter((t) => t.status === "done");
  return {
    linkedTaskCount: linked.length,
    completedTaskCount: completed.length,
    percent: linked.length > 0 ? completed.length / linked.length : 0,
  };
}
