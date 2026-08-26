"use client";

import {
  type Goal,
  type GoalStatus,
  type NewGoal,
  type Task,
  computeGoalProgress,
  createGoal,
  createTask,
  deleteGoal,
  setGoalStatus,
  subscribeGoals,
  subscribeTasks,
  updateGoal,
  updateTask,
} from "@life-client/shared";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";

function daysUntil(dateStr: string): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / msPerDay);
}

const GOAL_EXAMPLES = ["Ship WeSplit v2", "Read 12 books this year", "Run a half marathon"];

function GoalForm({ onSubmit, onCancel }: { onSubmit: (input: NewGoal) => void; onCancel: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetDate, setTargetDate] = useState("");

  return (
    <div className="flex flex-col gap-3 rounded-md border-2 border-foreground bg-surface p-4">
      <p className="font-mono text-xs font-bold tracking-[0.2em] text-primary uppercase">New goal</p>

      <label className="flex flex-col gap-1">
        <span className="font-mono text-xs text-muted uppercase">What are you working toward?</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Ship WeSplit v2"
          className="rounded-md border-2 border-foreground bg-background px-3 py-2 text-sm outline-none placeholder:text-muted focus:shadow-[2px_2px_0_0_var(--primary)]"
        />
      </label>

      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="flex flex-1 flex-col gap-1">
          <span className="font-mono text-xs text-muted uppercase">Description</span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional context"
            className="rounded-md border-2 border-foreground bg-background px-3 py-2 text-sm outline-none placeholder:text-muted focus:shadow-[2px_2px_0_0_var(--primary)]"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-xs text-muted uppercase">Target date</span>
          <input
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            className="rounded-md border-2 border-foreground bg-background px-3 py-2 text-sm"
          />
        </label>
      </div>

      {!title.trim() && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10px] text-muted uppercase">Try</span>
          {GOAL_EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setTitle(example)}
              className="rounded-full border-2 border-foreground/30 px-2.5 py-1 text-xs text-muted hover:border-foreground hover:text-foreground"
            >
              {example}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          disabled={!title.trim()}
          onClick={() =>
            onSubmit({
              title: title.trim(),
              description: description.trim() || undefined,
              targetDate: targetDate || undefined,
            })
          }
          className="rounded-md border-2 border-foreground bg-primary px-4 py-1.5 font-mono text-xs font-bold text-primary-foreground shadow-[2px_2px_0_0_var(--foreground)] transition hover:-translate-y-0.5 active:translate-y-0 active:shadow-none disabled:opacity-50"
        >
          Set goal
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-1.5 font-mono text-xs font-bold text-muted uppercase hover:bg-foreground/5"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function GoalCard({
  goal,
  tasks,
  onEdit,
  onComplete,
  onArchive,
  onDelete,
  onLinkTask,
  onUnlinkTask,
  onNewTask,
}: {
  goal: Goal;
  tasks: Task[];
  onEdit: (patch: Partial<NewGoal>) => void;
  onComplete: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onLinkTask: (taskId: string) => void;
  onUnlinkTask: (taskId: string) => void;
  onNewTask: (title: string) => void;
}) {
  const progress = computeGoalProgress(goal, tasks);
  const linkedTasks = tasks.filter((t) => t.goalId === goal.id);
  const unlinkedTasks = tasks.filter((t) => !t.goalId);

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(goal.title);
  const [description, setDescription] = useState(goal.description ?? "");
  const [targetDate, setTargetDate] = useState(goal.targetDate ?? "");
  const [linkPick, setLinkPick] = useState("");
  const [newTaskTitle, setNewTaskTitle] = useState("");

  const days = goal.targetDate ? daysUntil(goal.targetDate) : null;

  return (
    <div className="flex flex-col gap-3 rounded-md border-2 border-foreground bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        {editing ? (
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="rounded-md border-2 border-foreground bg-background px-2 py-1 text-sm font-bold"
            />
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description"
              className="rounded-md border-2 border-foreground bg-background px-2 py-1 text-sm"
            />
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="w-fit rounded-md border-2 border-foreground bg-background px-2 py-1 text-sm"
            />
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  onEdit({
                    title: title.trim() || goal.title,
                    description: description.trim() || undefined,
                    targetDate: targetDate || undefined,
                  });
                  setEditing(false);
                }}
                className="font-mono text-xs font-bold text-primary uppercase hover:underline"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="font-mono text-xs font-bold text-muted uppercase hover:underline"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setEditing(true)} className="min-w-0 flex-1 text-left">
            <p className="font-bold hover:underline">{goal.title}</p>
            {goal.description && <p className="text-xs text-muted">{goal.description}</p>}
            {days !== null && (
              <p className={`font-mono text-xs uppercase ${days < 0 ? "text-red-600" : "text-muted"}`}>
                {days < 0
                  ? `${Math.abs(days)}d overdue`
                  : days === 0
                    ? "Due today"
                    : `${days}d left · ${new Date(goal.targetDate!).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}
              </p>
            )}
          </button>
        )}
        {!editing && (
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span
              className={`rounded-full border-2 border-foreground px-2.5 py-1 font-mono text-[10px] font-bold uppercase ${
                goal.status === "completed" ? "bg-primary text-primary-foreground" : "bg-accent"
              }`}
            >
              {goal.status}
            </span>
            <div className="flex gap-2">
              {goal.status === "active" && (
                <button
                  type="button"
                  onClick={onComplete}
                  className="font-mono text-xs font-bold text-primary uppercase hover:underline"
                >
                  Complete
                </button>
              )}
              <button
                type="button"
                onClick={onArchive}
                className="font-mono text-xs font-bold text-muted uppercase hover:underline"
              >
                Archive
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="font-mono text-xs font-bold text-red-600 uppercase hover:underline"
              >
                Delete
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full border-2 border-foreground bg-background">
          <div className="h-full bg-primary" style={{ width: `${Math.round(progress.percent * 100)}%` }} />
        </div>
        <p className="font-mono text-xs text-muted">
          {progress.completedTaskCount}/{progress.linkedTaskCount} tasks
        </p>
      </div>

      {linkedTasks.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {linkedTasks.map((task) => (
            <li key={task.id} className="flex items-center justify-between gap-2 text-sm">
              <span className={task.status === "done" ? "text-muted line-through" : ""}>{task.title}</span>
              <button
                type="button"
                onClick={() => onUnlinkTask(task.id)}
                className="shrink-0 font-mono text-[10px] font-bold text-muted uppercase hover:underline"
              >
                Unlink
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted italic">No tasks linked yet — link one or add a new one below.</p>
      )}

      <div className="flex flex-col gap-1.5 border-t border-foreground/20 pt-2">
        <span className="font-mono text-[10px] text-muted uppercase">Link tasks to this goal</span>
        <div className="flex flex-wrap gap-2">
          {unlinkedTasks.length > 0 && (
            <div className="flex gap-1">
              <select
                value={linkPick}
                onChange={(e) => setLinkPick(e.target.value)}
                className="rounded-md border-2 border-foreground bg-background px-2 py-1 text-xs"
              >
                <option value="">Existing task…</option>
                {unlinkedTasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!linkPick}
                onClick={() => {
                  onLinkTask(linkPick);
                  setLinkPick("");
                }}
                className="rounded-md border-2 border-foreground px-2 py-1 font-mono text-xs font-bold uppercase hover:bg-accent/20 disabled:opacity-50"
              >
                Link
              </button>
            </div>
          )}
          <div className="flex gap-1">
            <input
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              placeholder="Or create a new task…"
              className="rounded-md border-2 border-foreground bg-background px-2 py-1 text-xs outline-none placeholder:text-muted"
            />
            <button
              type="button"
              disabled={!newTaskTitle.trim()}
              onClick={() => {
                onNewTask(newTaskTitle.trim());
                setNewTaskTitle("");
              }}
              className="rounded-md border-2 border-foreground px-2 py-1 font-mono text-xs font-bold uppercase hover:bg-accent/20 disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function GoalsPage() {
  const { user } = useAuth();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !db) return;
    return subscribeGoals(db, user.uid, setGoals, (err) => setError(err.message));
  }, [user]);

  useEffect(() => {
    if (!user || !db) return;
    return subscribeTasks(db, user.uid, setTasks);
  }, [user]);

  async function handleCreate(input: NewGoal) {
    if (!user || !db) return;
    setError(null);
    try {
      await createGoal(db, user.uid, input);
      setFormOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create goal");
    }
  }

  const activeGoals = goals.filter((g) => g.status === "active");
  const completedGoals = goals.filter((g) => g.status === "completed");
  const overallPercent =
    activeGoals.length > 0
      ? Math.round(
          (activeGoals.reduce((sum, g) => sum + computeGoalProgress(g, tasks).percent, 0) / activeGoals.length) * 100,
        )
      : 0;

  function renderGoalCard(goal: Goal) {
    return (
      <GoalCard
        key={goal.id}
        goal={goal}
        tasks={tasks}
        onEdit={(patch) => user && db && updateGoal(db, user.uid, goal.id, patch)}
        onComplete={() => user && db && setGoalStatus(db, user.uid, goal.id, "completed" as GoalStatus)}
        onArchive={() => user && db && setGoalStatus(db, user.uid, goal.id, "archived" as GoalStatus)}
        onDelete={() => user && db && deleteGoal(db, user.uid, goal.id)}
        onLinkTask={(taskId) => user && db && updateTask(db, user.uid, taskId, { goalId: goal.id })}
        onUnlinkTask={(taskId) => user && db && updateTask(db, user.uid, taskId, { goalId: undefined })}
        onNewTask={(title) =>
          user &&
          db &&
          createTask(db, user.uid, {
            title,
            status: "todo",
            priority: "medium",
            difficulty: "medium",
            category: "personal",
            source: "manual",
            tags: [],
            goalId: goal.id,
          })
        }
      />
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs font-bold tracking-[0.3em] text-primary uppercase">Long-term</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Goals</h1>
          <p className="text-sm text-muted">
            Bigger objectives made up of several Tasks — progress tracks automatically as you complete them.
          </p>
        </div>
        {!formOpen && (
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="shrink-0 rounded-md border-2 border-foreground bg-primary px-3 py-1.5 font-mono text-xs font-bold text-primary-foreground shadow-[2px_2px_0_0_var(--foreground)] transition hover:-translate-y-0.5 active:translate-y-0 active:shadow-none"
          >
            New goal
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-md border-2 border-foreground bg-surface p-3 text-center">
          <p className="text-2xl font-bold text-primary">{activeGoals.length}</p>
          <p className="font-mono text-[10px] text-muted uppercase">Active</p>
        </div>
        <div className="rounded-md border-2 border-foreground bg-surface p-3 text-center">
          <p className="text-2xl font-bold">{completedGoals.length}</p>
          <p className="font-mono text-[10px] text-muted uppercase">Completed</p>
        </div>
        <div className="rounded-md border-2 border-foreground bg-surface p-3 text-center">
          <p className="text-2xl font-bold">{overallPercent}%</p>
          <p className="font-mono text-[10px] text-muted uppercase">Avg. progress</p>
        </div>
      </div>

      {formOpen && <GoalForm onSubmit={handleCreate} onCancel={() => setFormOpen(false)} />}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {activeGoals.length > 0 && <div className="flex flex-col gap-3">{activeGoals.map(renderGoalCard)}</div>}

      {activeGoals.length === 0 && !formOpen && (
        <div className="rounded-md border-2 border-dashed border-foreground/30 bg-surface px-4 py-8 text-center text-sm text-muted">
          No active goals yet — set one above, e.g. &ldquo;Ship WeSplit v2&rdquo;, then link Tasks to it.
        </div>
      )}

      {completedGoals.length > 0 && (
        <details className="flex flex-col gap-3">
          <summary className="cursor-pointer font-mono text-xs font-bold tracking-[0.2em] text-muted uppercase">
            Completed ({completedGoals.length})
          </summary>
          <div className="mt-3 flex flex-col gap-3">{completedGoals.map(renderGoalCard)}</div>
        </details>
      )}
    </div>
  );
}
