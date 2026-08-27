"use client";

import {
  computeChallengeProgress,
  subscribeChallenges,
  subscribeHabitLogs,
  subscribeJournalEntries,
  subscribeSportActivities,
  subscribeTasks,
  subscribeTransactions,
  subscribeViceLogs,
  type Challenge,
  type HabitLog,
  type JournalEntry,
  type SportActivity,
  type Task,
  type Transaction,
  type ViceLog,
} from "@life-client/shared";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";

type Period = "week" | "month";

function periodRange(period: Period): { start: string; end: string } {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const toStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const end = toStr(now);
  if (period === "week") {
    const start = new Date(now);
    start.setDate(start.getDate() - 6);
    return { start: toStr(start), end };
  }
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { start: toStr(start), end };
}

function inRange(dateStr: string, range: { start: string; end: string }): boolean {
  const d = dateStr.slice(0, 10);
  return d >= range.start && d <= range.end;
}

function formatMoney(amount: number): string {
  return amount.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function StatTile({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="rounded-md border-2 border-foreground bg-surface p-4 text-center">
      <p className="text-3xl font-bold">{value}</p>
      <p className="font-mono text-xs text-muted uppercase">{label}</p>
    </div>
  );
}

export default function ReviewPage() {
  const { user } = useAuth();
  const [period, setPeriod] = useState<Period>("week");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [viceLogs, setViceLogs] = useState<ViceLog[]>([]);
  const [habitLogs, setHabitLogs] = useState<HabitLog[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [activities, setActivities] = useState<SportActivity[]>([]);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  useEffect(() => {
    if (!user || !db) return;
    const unsubs = [
      subscribeTasks(db, user.uid, setTasks),
      subscribeViceLogs(db, user.uid, setViceLogs),
      subscribeHabitLogs(db, user.uid, setHabitLogs),
      subscribeChallenges(db, user.uid, setChallenges),
      subscribeSportActivities(db, user.uid, setActivities),
      subscribeJournalEntries(db, user.uid, setJournalEntries),
      subscribeTransactions(db, user.uid, setTransactions),
    ];
    return () => unsubs.forEach((u) => u());
  }, [user]);

  const range = periodRange(period);

  const tasksCompleted = tasks.filter((t) => t.status === "done" && inRange(t.updatedAt, range)).length;

  const viceLogsInRange = viceLogs.filter((v) => inRange(v.createdAt, range));
  const viceCompensated = viceLogsInRange.filter((v) => v.compensated).length;

  const habitCheckIns = habitLogs.filter((l) => inRange(l.date, range)).length;

  const challengeDaysCompleted = challenges
    .filter((c) => !c.archived)
    .reduce((sum, c) => {
      const progress = computeChallengeProgress(c, activities);
      return sum + progress.days.filter((d) => d.completed && inRange(d.date, range)).length;
    }, 0);

  const journalCount = journalEntries.filter((j) => inRange(j.createdAt, range)).length;

  const moneySpent = transactions
    .filter((t) => t.type === "expense" && inRange(t.date, range))
    .reduce((sum, t) => sum + t.amount, 0);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs font-bold tracking-[0.3em] text-primary uppercase">Review</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Review</h1>
          <p className="text-sm text-muted">
            {period === "week" ? "Last 7 days" : "This month"} — {range.start} to {range.end}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {(["week", "month"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`rounded-full border-2 px-3 py-1.5 text-xs font-bold capitalize ${
                period === p ? "border-foreground bg-primary text-primary-foreground" : "border-foreground/30 text-muted"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile value={tasksCompleted} label="Tasks completed" />
        <StatTile value={habitCheckIns} label="Habit check-ins" />
        <StatTile value={challengeDaysCompleted} label="Challenge days hit" />
        <StatTile value={journalCount} label="Journal entries" />
        <StatTile value={`${viceCompensated}/${viceLogsInRange.length}`} label="Slips compensated" />
        <StatTile value={formatMoney(moneySpent)} label="Money spent" />
      </div>
    </div>
  );
}
