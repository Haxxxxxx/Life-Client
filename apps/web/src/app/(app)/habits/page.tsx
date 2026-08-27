"use client";

import {
  VICE_PRESETS,
  archiveHabit,
  computeHabitProgress,
  createHabit,
  deleteHabit,
  deleteViceLog,
  logHabitDay,
  logVice,
  subscribeHabitLogs,
  subscribeHabits,
  subscribeTasks,
  subscribeViceLogs,
  type Habit,
  type HabitCadence,
  type HabitLog,
  type Task,
  type ViceLog,
} from "@life-client/shared";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";

function todayStr(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function HabitForm({ onSubmit }: { onSubmit: (input: { title: string; cadence: HabitCadence; targetPerCadence: number; startDate: string }) => void }) {
  const [title, setTitle] = useState("");
  const [cadence, setCadence] = useState<HabitCadence>("daily");
  const [targetPerCadence, setTargetPerCadence] = useState(1);

  return (
    <div className="flex flex-col gap-2 rounded-md border-2 border-dashed border-foreground/40 p-3">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="e.g. Meditate, No phone after 10pm"
        className="rounded-md border-2 border-foreground bg-background px-3 py-2 text-sm outline-none placeholder:text-muted"
      />
      <div className="flex flex-wrap items-center gap-2">
        {(["daily", "weekly"] as const).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCadence(c)}
            className={`rounded-full border-2 px-3 py-1 text-xs capitalize ${
              cadence === c ? "border-foreground bg-accent" : "border-foreground/30 text-muted"
            }`}
          >
            {c}
          </button>
        ))}
        <label className="flex items-center gap-1 text-xs text-muted">
          target
          <input
            type="number"
            min={1}
            value={targetPerCadence}
            onChange={(e) => setTargetPerCadence(Number(e.target.value) || 1)}
            className="w-14 rounded-md border-2 border-foreground bg-background px-1 py-0.5 text-xs"
          />
          x per {cadence === "daily" ? "day" : "week"}
        </label>
      </div>
      <button
        type="button"
        disabled={!title.trim()}
        onClick={() => onSubmit({ title: title.trim(), cadence, targetPerCadence, startDate: todayStr() })}
        className="self-start rounded-md border-2 border-foreground bg-primary px-4 py-1.5 font-mono text-xs font-bold text-primary-foreground shadow-[2px_2px_0_0_var(--foreground)] transition hover:-translate-y-0.5 active:translate-y-0 active:shadow-none disabled:opacity-50"
      >
        Start habit
      </button>
    </div>
  );
}

function HabitCard({
  habit,
  logs,
  onLogToday,
  onArchive,
  onDelete,
}: {
  habit: Habit;
  logs: HabitLog[];
  onLogToday: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const progress = computeHabitProgress(habit, logs);
  const today = todayStr();
  const loggedToday = progress.days.some((d) => d.date === today && d.completed);

  return (
    <div className="flex flex-col gap-3 rounded-md border-2 border-foreground bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-bold">{habit.title}</p>
          <p className="text-xs text-muted">
            {habit.targetPerCadence}x / {habit.cadence === "daily" ? "day" : "week"}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={onArchive} className="font-mono text-xs font-bold text-muted uppercase hover:underline">
            Archive
          </button>
          <button type="button" onClick={onDelete} className="font-mono text-xs font-bold text-red-600 uppercase hover:underline">
            Delete
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <div>
          <p className="text-2xl font-bold text-primary">{progress.currentStreak}</p>
          <p className="font-mono text-xs text-muted uppercase">current streak</p>
        </div>
        <div>
          <p className="text-2xl font-bold">{progress.longestStreak}</p>
          <p className="font-mono text-xs text-muted uppercase">longest streak</p>
        </div>
        <button
          type="button"
          disabled={loggedToday}
          onClick={onLogToday}
          className="ml-auto rounded-md border-2 border-foreground bg-primary px-3 py-1.5 font-mono text-xs font-bold text-primary-foreground shadow-[2px_2px_0_0_var(--foreground)] transition hover:-translate-y-0.5 active:translate-y-0 active:shadow-none disabled:opacity-50"
        >
          {loggedToday ? "Done today" : "Log today"}
        </button>
      </div>
      <div className="flex flex-wrap gap-1">
        {progress.days.map((day) => (
          <div
            key={day.date}
            title={day.date}
            className={`h-3 w-3 rounded-sm border ${
              day.completed ? "border-primary bg-primary" : "border-foreground/30 bg-background"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

export default function HabitsPage() {
  const { user } = useAuth();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [logs, setLogs] = useState<HabitLog[]>([]);
  const [viceLogs, setViceLogs] = useState<ViceLog[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !db) return;
    return subscribeHabits(db, user.uid, setHabits, (err) => setError(err.message));
  }, [user]);

  useEffect(() => {
    if (!user || !db) return;
    return subscribeHabitLogs(db, user.uid, setLogs);
  }, [user]);

  useEffect(() => {
    if (!user || !db) return;
    return subscribeViceLogs(db, user.uid, setViceLogs);
  }, [user]);

  useEffect(() => {
    if (!user || !db) return;
    return subscribeTasks(db, user.uid, setTasks);
  }, [user]);

  async function handleCreate(input: { title: string; cadence: HabitCadence; targetPerCadence: number; startDate: string }) {
    if (!user || !db) return;
    setError(null);
    try {
      await createHabit(db, user.uid, input);
      setFormOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start habit");
    }
  }

  async function handleLogVice(vicePresetId: string) {
    if (!user || !db) return;
    setError(null);
    try {
      await logVice(db, user.uid, vicePresetId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not log slip");
    }
  }

  const activeHabits = habits.filter((h) => !h.archived);
  const activeViceLogs = viceLogs.filter((v) => !v.compensated);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs font-bold tracking-[0.3em] text-primary uppercase">Habits</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Habits</h1>
          <p className="text-sm text-muted">
            Non-sport daily/weekly habits — checked in by hand, streaks tracked automatically.
          </p>
        </div>
        {!formOpen && (
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="shrink-0 rounded-md border-2 border-foreground bg-primary px-3 py-1.5 font-mono text-xs font-bold text-primary-foreground shadow-[2px_2px_0_0_var(--foreground)] transition hover:-translate-y-0.5 active:translate-y-0 active:shadow-none"
          >
            New habit
          </button>
        )}
      </div>

      {formOpen && <HabitForm onSubmit={handleCreate} />}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {activeHabits.length > 0 ? (
        <div className="flex flex-col gap-3">
          {activeHabits.map((habit) => (
            <HabitCard
              key={habit.id}
              habit={habit}
              logs={logs}
              onLogToday={() => user && db && logHabitDay(db, user.uid, habit.id)}
              onArchive={() => user && db && archiveHabit(db, user.uid, habit.id)}
              onDelete={() => user && db && deleteHabit(db, user.uid, habit.id)}
            />
          ))}
        </div>
      ) : (
        !formOpen && (
          <div className="rounded-md border-2 border-dashed border-foreground/30 bg-surface px-4 py-8 text-center text-sm text-muted">
            No habits yet — e.g. &ldquo;Meditate&rdquo; or &ldquo;No phone after 10pm&rdquo;.
          </div>
        )
      )}

      <div className="flex flex-col gap-2">
        <div>
          <p className="font-mono text-xs font-bold tracking-[0.2em] text-primary uppercase">Slipped up?</p>
          <h2 className="text-lg font-bold tracking-tight">Log a slip</h2>
          <p className="text-sm text-muted">
            Docks XP from a relevant stat and auto-creates a compensating task — complete it to refund the XP.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {VICE_PRESETS.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => handleLogVice(v.id)}
              className="rounded-full border-2 border-foreground px-3 py-1.5 text-xs hover:bg-accent/20"
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {activeViceLogs.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-bold tracking-tight">Active slips</h2>
          <ul className="flex flex-col gap-2">
            {activeViceLogs.map((v) => {
              const preset = VICE_PRESETS.find((p) => p.id === v.viceId);
              const task = tasks.find((t) => t.id === v.compensatingTaskId);
              return (
                <li
                  key={v.id}
                  className="flex items-center justify-between gap-3 rounded-md border-2 border-foreground bg-surface px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-bold">{preset?.label ?? v.viceId}</p>
                    <p className="font-mono text-xs text-muted uppercase">
                      -{v.penaltyXp} XP · {task ? `Task: ${task.title} (${task.status})` : "Compensating task missing"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => user && db && deleteViceLog(db, user.uid, v.id)}
                    className="shrink-0 font-mono text-xs font-bold text-red-600 uppercase hover:underline"
                  >
                    Dismiss
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
