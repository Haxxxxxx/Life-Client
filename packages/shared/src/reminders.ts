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
import type { NewReminder, Reminder } from "./types";

function remindersCollection(db: Firestore, uid: string) {
  return collection(db, "users", uid, "reminders");
}

export function subscribeReminders(
  db: Firestore,
  uid: string,
  onChange: (reminders: Reminder[]) => void,
  onError?: (error: Error) => void,
): () => void {
  const q = query(remindersCollection(db, uid), orderBy("deadline", "asc"));
  return onSnapshot(
    q,
    (snapshot) => {
      const reminders = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Reminder);
      onChange(reminders);
    },
    (error) => onError?.(error),
  );
}

export async function createReminder(
  db: Firestore,
  uid: string,
  reminder: NewReminder,
): Promise<string> {
  const ref = await addDoc(remindersCollection(db, uid), {
    ...reminder,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateReminder(
  db: Firestore,
  uid: string,
  reminderId: string,
  patch: Partial<NewReminder>,
): Promise<void> {
  await updateDoc(doc(db, "users", uid, "reminders", reminderId), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteReminder(db: Firestore, uid: string, reminderId: string): Promise<void> {
  await deleteDoc(doc(db, "users", uid, "reminders", reminderId));
}

export type ReminderUrgency = "overdue" | "due-today" | "due-soon" | "upcoming";

const DUE_SOON_DAYS = 2;

/** Days remaining until the deadline, rounded up (negative once overdue). */
export function daysUntil(deadline: string, now: Date = new Date()): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.ceil((new Date(deadline).getTime() - now.getTime()) / msPerDay);
}

export function reminderUrgency(deadline: string, now: Date = new Date()): ReminderUrgency {
  const days = daysUntil(deadline, now);
  if (days < 0) return "overdue";
  if (days === 0) return "due-today";
  if (days <= DUE_SOON_DAYS) return "due-soon";
  return "upcoming";
}

export function isDueSoon(deadline: string, now: Date = new Date()): boolean {
  const urgency = reminderUrgency(deadline, now);
  return urgency === "overdue" || urgency === "due-today" || urgency === "due-soon";
}
