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
import { daysUntilInZone } from "./timezone";
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

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Whole calendar days between today and the deadline's day, in local time:
 * 0 for today, 1 for tomorrow, -1 for yesterday.
 *
 * This used to be `Math.ceil((deadline - now) / msPerDay)`, which answers a
 * different question — elapsed 24-hour periods, not calendar days — and got
 * every bucket wrong. At 09:00, a deadline of 17:00 *the same day* returned 1
 * ("due in 1d"), while something 30 minutes overdue returned `Math.ceil(-0.02)`
 * = `-0`, and `-0 === 0` is true, so it reported as due today. The result was
 * that "due-today" only ever meant "overdue within the last 24h" and nothing
 * genuinely due today could reach it.
 *
 * Differencing local midnights also avoids the DST bug in the old version:
 * Math.round absorbs the 23- and 25-hour days a fixed msPerDay divisor cannot.
 */
export function daysUntil(deadline: string, now: Date = new Date()): number {
  const target = new Date(deadline);
  if (Number.isNaN(target.getTime())) return 0;
  const diffMs = startOfLocalDay(target).getTime() - startOfLocalDay(now).getTime();
  return Math.round(diffMs / (24 * 60 * 60 * 1000));
}

export function reminderUrgency(deadline: string, now: Date = new Date()): ReminderUrgency {
  const target = new Date(deadline);
  if (Number.isNaN(target.getTime())) return "upcoming";
  // Overdue is about the instant, not the day: 08:00 today is already past at
  // 09:00 today, even though both fall on the same calendar day.
  if (target.getTime() < now.getTime()) return "overdue";
  const days = daysUntil(deadline, now);
  if (days === 0) return "due-today";
  if (days <= DUE_SOON_DAYS) return "due-soon";
  return "upcoming";
}

/**
 * `reminderUrgency` for a caller whose own clock is not the user's.
 *
 * Server-side code runs on a UTC process clock, so the local-getter version
 * buckets against UTC's calendar day: a reminder due "today" in Tokyo reads as
 * due tomorrow for the nine hours that Tokyo is already into the next date,
 * and the daily digest silently omits it. Overdue stays instant-based and so
 * needs no zone — 08:00 is past at 09:00 everywhere at once.
 */
export function reminderUrgencyInZone(
  deadline: string,
  timeZone: string,
  now: Date = new Date(),
): ReminderUrgency {
  const target = new Date(deadline);
  if (Number.isNaN(target.getTime())) return "upcoming";
  if (target.getTime() < now.getTime()) return "overdue";
  const days = daysUntilInZone(deadline, timeZone, now);
  if (days === 0) return "due-today";
  if (days <= DUE_SOON_DAYS) return "due-soon";
  return "upcoming";
}

export function isDueSoon(deadline: string, now: Date = new Date()): boolean {
  const urgency = reminderUrgency(deadline, now);
  return urgency === "overdue" || urgency === "due-today" || urgency === "due-soon";
}
