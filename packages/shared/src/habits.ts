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
import { addDays, computeCurrentStreak, computeLongestStreak, dateRange, toDateStr } from "./streaks";
import type { Habit, HabitLog, HabitProgress, NewHabit } from "./types";

function habitsCollection(db: Firestore, uid: string) {
  return collection(db, "users", uid, "habits");
}

function habitLogsCollection(db: Firestore, uid: string) {
  return collection(db, "users", uid, "habitLogs");
}

export function subscribeHabits(
  db: Firestore,
  uid: string,
  onChange: (habits: Habit[]) => void,
  onError?: (error: Error) => void,
): () => void {
  const q = query(habitsCollection(db, uid), orderBy("createdAt", "desc"));
  return onSnapshot(
    q,
    (snapshot) => onChange(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Habit)),
    (error) => onError?.(error),
  );
}

export function subscribeHabitLogs(
  db: Firestore,
  uid: string,
  onChange: (logs: HabitLog[]) => void,
  onError?: (error: Error) => void,
): () => void {
  const q = query(habitLogsCollection(db, uid), orderBy("date", "desc"));
  return onSnapshot(
    q,
    (snapshot) => onChange(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as HabitLog)),
    (error) => onError?.(error),
  );
}

export async function createHabit(db: Firestore, uid: string, habit: NewHabit): Promise<string> {
  const ref = await addDoc(habitsCollection(db, uid), { ...habit, createdAt: new Date().toISOString() });
  return ref.id;
}

export async function archiveHabit(db: Firestore, uid: string, habitId: string): Promise<void> {
  await updateDoc(doc(db, "users", uid, "habits", habitId), { archived: true });
}

export async function deleteHabit(db: Firestore, uid: string, habitId: string): Promise<void> {
  await deleteDoc(doc(db, "users", uid, "habits", habitId));
}

/** Logs today's (or a given day's) check-in for a habit — one log per habit per day. */
export async function logHabitDay(db: Firestore, uid: string, habitId: string, date: string = toDateStr(new Date())): Promise<string> {
  const ref = await addDoc(habitLogsCollection(db, uid), { habitId, date, createdAt: new Date().toISOString() });
  return ref.id;
}

export async function deleteHabitLog(db: Firestore, uid: string, logId: string): Promise<void> {
  await deleteDoc(doc(db, "users", uid, "habitLogs", logId));
}

/** Derives daily completion/streak from HabitLog check-ins — mirrors computeChallengeProgress's shape for a consistent day-grid UI. */
export function computeHabitProgress(habit: Habit, logs: HabitLog[], now: Date = new Date()): HabitProgress {
  const today = toDateStr(now);
  const endDate = habit.durationDays ? addDays(habit.startDate, habit.durationDays - 1) : today;
  const lastDay = today < endDate ? today : endDate;
  const dates = habit.startDate <= lastDay ? dateRange(habit.startDate, lastDay) : [];

  const countByDate = new Map<string, number>();
  for (const log of logs) {
    if (log.habitId !== habit.id) continue;
    if (log.date < habit.startDate || log.date > lastDay) continue;
    countByDate.set(log.date, (countByDate.get(log.date) ?? 0) + 1);
  }

  const days = dates.map((date) => ({ date, completed: (countByDate.get(date) ?? 0) >= habit.targetPerCadence }));

  return {
    days,
    currentStreak: computeCurrentStreak(days),
    longestStreak: computeLongestStreak(days),
    completedCount: days.filter((d) => d.completed).length,
    totalDaysSoFar: days.length,
  };
}
