"use client";

import {
  type Challenge,
  type Goal,
  type Reminder,
  type SportActivity,
  type Task,
  type TaskStatus,
  archiveChallenge,
  computeChallengeProgress,
  computeGoalProgress,
  deleteChallenge,
  deleteGoal,
  deleteReminderEverywhere,
  deleteTask,
  setGoalStatus,
  setTaskStatus,
  subscribeChallenges,
  subscribeGoals,
  subscribeReminders,
  subscribeSportActivities,
  subscribeTasks,
  syncReminderToCalendar,
  updateChallenge,
  updateGoal,
  updateReminder,
  updateTask,
} from "@life-client/shared";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import { webApiClient } from "@/lib/webApiClient";

function RenameField({
  value,
  onSave,
  className,
}: {
  value: string;
  onSave: (next: string) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <button type="button" onClick={() => { setDraft(value); setEditing(true); }} className={`text-left hover:underline ${className ?? ""}`}>
        {value}
      </button>
    );
  }

  function commit() {
    if (draft.trim() && draft.trim() !== value) onSave(draft.trim());
    setEditing(false);
  }

  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setEditing(false);
      }}
      className={`rounded border-2 border-foreground bg-background px-1.5 py-0.5 text-sm ${className ?? ""}`}
    />
  );
}

function SectionHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <p className="font-mono text-xs font-bold tracking-[0.2em] text-primary uppercase">{eyebrow}</p>
      <h2 className="text-lg font-bold tracking-tight">{title}</h2>
    </div>
  );
}

function TasksSection({ user }: { user: { uid: string } }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!db) return;
    return subscribeTasks(db, user.uid, setTasks);
  }, [user]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulkMarkDone() {
    if (!db) return;
    await Promise.all([...selected].map((id) => setTaskStatus(db!, user.uid, id, "done" as TaskStatus)));
    setSelected(new Set());
  }

  async function bulkDelete() {
    if (!db) return;
    await Promise.all([...selected].map((id) => deleteTask(db!, user.uid, id)));
    setSelected(new Set());
  }

  async function clearCompleted() {
    if (!db) return;
    const done = tasks.filter((t) => t.status === "done");
    await Promise.all(done.map((t) => deleteTask(db!, user.uid, t.id)));
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <SectionHeader eyebrow="Today" title="Tasks" />
        <button
          type="button"
          onClick={clearCompleted}
          className="rounded-md border-2 border-foreground px-2.5 py-1 font-mono text-xs font-bold uppercase hover:bg-accent/20"
        >
          Clear completed
        </button>
      </div>
      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-md border-2 border-primary bg-primary/10 px-3 py-2">
          <span className="font-mono text-xs font-bold">{selected.size} selected</span>
          <button type="button" onClick={bulkMarkDone} className="font-mono text-xs font-bold text-primary uppercase hover:underline">
            Mark done
          </button>
          <button type="button" onClick={bulkDelete} className="font-mono text-xs font-bold text-red-600 uppercase hover:underline">
            Delete selected
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="ml-auto font-mono text-xs font-bold text-muted uppercase hover:underline"
          >
            Clear
          </button>
        </div>
      )}
      <ul className="flex flex-col gap-1">
        {tasks.map((task) => (
          <li key={task.id} className="flex items-center gap-2 rounded-md border-2 border-foreground bg-surface px-3 py-2">
            <input type="checkbox" checked={selected.has(task.id)} onChange={() => toggle(task.id)} />
            <RenameField
              value={task.title}
              onSave={(next) => db && updateTask(db, user.uid, task.id, { title: next })}
              className={`min-w-0 flex-1 truncate text-sm ${task.status === "done" ? "text-muted line-through" : ""}`}
            />
            <span className="shrink-0 font-mono text-[10px] text-muted uppercase">{task.status}</span>
            <button
              type="button"
              onClick={() => db && deleteTask(db, user.uid, task.id)}
              className="shrink-0 font-mono text-xs font-bold text-red-600 uppercase hover:underline"
            >
              Delete
            </button>
          </li>
        ))}
        {tasks.length === 0 && <li className="px-3 py-4 text-center text-sm text-muted">No tasks.</li>}
      </ul>
    </div>
  );
}

function GoalsSection({ user }: { user: { uid: string } }) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    if (!db) return;
    return subscribeGoals(db, user.uid, setGoals);
  }, [user]);
  useEffect(() => {
    if (!db) return;
    return subscribeTasks(db, user.uid, setTasks);
  }, [user]);

  return (
    <div className="flex flex-col gap-2">
      <SectionHeader eyebrow="Long-term" title="Goals" />
      <ul className="flex flex-col gap-1">
        {goals.map((goal) => {
          const progress = computeGoalProgress(goal, tasks);
          return (
            <li key={goal.id} className="flex items-center gap-2 rounded-md border-2 border-foreground bg-surface px-3 py-2">
              <RenameField
                value={goal.title}
                onSave={(next) => db && updateGoal(db, user.uid, goal.id, { title: next })}
                className="min-w-0 flex-1 truncate text-sm"
              />
              <span className="shrink-0 font-mono text-[10px] text-muted uppercase">
                {progress.completedTaskCount}/{progress.linkedTaskCount} · {goal.status}
              </span>
              {goal.status === "active" && (
                <button
                  type="button"
                  onClick={() => db && setGoalStatus(db, user.uid, goal.id, "completed")}
                  className="shrink-0 font-mono text-xs font-bold text-primary uppercase hover:underline"
                >
                  Complete
                </button>
              )}
              <button
                type="button"
                onClick={() => db && setGoalStatus(db, user.uid, goal.id, "archived")}
                className="shrink-0 font-mono text-xs font-bold text-muted uppercase hover:underline"
              >
                Archive
              </button>
              <button
                type="button"
                onClick={() => db && deleteGoal(db, user.uid, goal.id)}
                className="shrink-0 font-mono text-xs font-bold text-red-600 uppercase hover:underline"
              >
                Delete
              </button>
            </li>
          );
        })}
        {goals.length === 0 && <li className="px-3 py-4 text-center text-sm text-muted">No goals.</li>}
      </ul>
    </div>
  );
}

function ChallengesSection({ user }: { user: { uid: string } }) {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [activities, setActivities] = useState<SportActivity[]>([]);

  useEffect(() => {
    if (!db) return;
    return subscribeChallenges(db, user.uid, setChallenges);
  }, [user]);
  useEffect(() => {
    if (!db) return;
    return subscribeSportActivities(db, user.uid, setActivities);
  }, [user]);

  return (
    <div className="flex flex-col gap-2">
      <SectionHeader eyebrow="Streaks" title="Challenges" />
      <ul className="flex flex-col gap-1">
        {challenges.map((challenge) => {
          const progress = computeChallengeProgress(challenge, activities);
          return (
            <li key={challenge.id} className="flex items-center gap-2 rounded-md border-2 border-foreground bg-surface px-3 py-2">
              <RenameField
                value={challenge.title}
                onSave={(next) => db && updateChallenge(db, user.uid, challenge.id, { title: next })}
                className="min-w-0 flex-1 truncate text-sm"
              />
              <span className="shrink-0 font-mono text-[10px] text-muted uppercase">
                {progress.currentStreak}d streak{challenge.archived ? " · archived" : ""}
              </span>
              {!challenge.archived && (
                <button
                  type="button"
                  onClick={() => db && archiveChallenge(db, user.uid, challenge.id)}
                  className="shrink-0 font-mono text-xs font-bold text-muted uppercase hover:underline"
                >
                  Archive
                </button>
              )}
              <button
                type="button"
                onClick={() => db && deleteChallenge(db, user.uid, challenge.id)}
                className="shrink-0 font-mono text-xs font-bold text-red-600 uppercase hover:underline"
              >
                Delete
              </button>
            </li>
          );
        })}
        {challenges.length === 0 && <li className="px-3 py-4 text-center text-sm text-muted">No challenges.</li>}
      </ul>
    </div>
  );
}

function RemindersSection({ user }: { user: { uid: string } }) {
  const [reminders, setReminders] = useState<Reminder[]>([]);

  useEffect(() => {
    if (!db) return;
    return subscribeReminders(db, user.uid, setReminders);
  }, [user]);

  async function rename(reminderId: string, title: string) {
    if (!db) return;
    await updateReminder(db, user.uid, reminderId, { title });
    syncReminderToCalendar(webApiClient, reminderId).catch((err) =>
      console.error("Could not sync reminder to Google Calendar", err),
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <SectionHeader eyebrow="Deadlines" title="Reminders" />
      <ul className="flex flex-col gap-1">
        {reminders.map((reminder) => (
          <li key={reminder.id} className="flex items-center gap-2 rounded-md border-2 border-foreground bg-surface px-3 py-2">
            <RenameField
              value={reminder.title}
              onSave={(next) => rename(reminder.id, next)}
              className="min-w-0 flex-1 truncate text-sm"
            />
            <span className="shrink-0 font-mono text-[10px] text-muted uppercase">
              {new Date(reminder.deadline).toLocaleDateString()}
            </span>
            <button
              type="button"
              onClick={() => deleteReminderEverywhere(webApiClient, reminder.id)}
              className="shrink-0 font-mono text-xs font-bold text-red-600 uppercase hover:underline"
            >
              Delete
            </button>
          </li>
        ))}
        {reminders.length === 0 && <li className="px-3 py-4 text-center text-sm text-muted">No reminders.</li>}
      </ul>
    </div>
  );
}

export default function ManagePage() {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <div>
        <p className="font-mono text-xs font-bold tracking-[0.3em] text-primary uppercase">Everything</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Manage</h1>
        <p className="text-sm text-muted">
          A single place to review and edit everything you&apos;ve created — rename anything inline, bulk-manage
          Tasks below.
        </p>
      </div>
      <TasksSection user={user} />
      <GoalsSection user={user} />
      <ChallengesSection user={user} />
      <RemindersSection user={user} />
    </div>
  );
}
