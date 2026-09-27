"use client";

import {
  VICE_PRESETS,
  type Goal,
  type GoalStatus,
  type NewGoal,
  type Task,
  type ViceLog,
  computeGoalProgress,
} from "@life-client/shared";
import { data } from "@life-client/shared";
import { useEffect, useState } from "react";
import { GoalStatusChart } from "@/components/charts";
import { Button, Card, ErrorText, Eyebrow, Input, PageHeader, SectionHeader, StatTile } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";

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
    <Card className="flex flex-col gap-3">
      <Eyebrow>New goal</Eyebrow>

      <label className="flex flex-col gap-1">
        <span className="font-mono text-xs text-muted uppercase">What are you working toward?</span>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Ship WeSplit v2" />
      </label>

      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="flex flex-1 flex-col gap-1">
          <span className="font-mono text-xs text-muted uppercase">Description</span>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional context" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-xs text-muted uppercase">Target date</span>
          <Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
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
              className="rounded-full border border-border px-2.5 py-1 text-xs text-muted hover:border-border-strong hover:text-foreground"
            >
              {example}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-3">
        <Button
          size="sm"
          disabled={!title.trim()}
          onClick={() =>
            onSubmit({
              title: title.trim(),
              description: description.trim() || undefined,
              targetDate: targetDate || undefined,
            })
          }
        >
          Set goal
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Card>
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
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        {editing ? (
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="rounded-xl border border-border-strong bg-background px-2 py-1 text-sm font-bold"
            />
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description"
              className="rounded-xl border border-border-strong bg-background px-2 py-1 text-sm"
            />
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="w-fit rounded-xl border border-border-strong bg-background px-2 py-1 text-sm"
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
              <p className={`font-mono text-xs uppercase ${days < 0 ? "text-danger" : "text-muted"}`}>
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
              className={`rounded-full border border-border-strong px-2.5 py-1 font-mono text-[10px] font-bold uppercase ${
                goal.status === "completed" ? "bg-primary text-primary-foreground" : "bg-primary/15"
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
                className="font-mono text-xs font-bold text-danger uppercase hover:underline"
              >
                Delete
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full border border-border-strong bg-background">
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

      <div className="flex flex-col gap-1.5 border-t border-border pt-2">
        <span className="font-mono text-[10px] text-muted uppercase">Link tasks to this goal</span>
        <div className="flex flex-wrap gap-2">
          {unlinkedTasks.length > 0 && (
            <div className="flex gap-1">
              <select
                value={linkPick}
                onChange={(e) => setLinkPick(e.target.value)}
                className="rounded-xl border border-border-strong bg-background px-2 py-1 text-xs"
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
                className="rounded-xl border border-border-strong px-2 py-1 font-mono text-xs font-bold uppercase hover:bg-primary/10 disabled:opacity-50"
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
              className="rounded-xl border border-border-strong bg-background px-2 py-1 text-xs outline-none placeholder:text-muted"
            />
            <button
              type="button"
              disabled={!newTaskTitle.trim()}
              onClick={() => {
                onNewTask(newTaskTitle.trim());
                setNewTaskTitle("");
              }}
              className="rounded-xl border border-border-strong px-2 py-1 font-mono text-xs font-bold uppercase hover:bg-primary/10 disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function GoalsPage() {
  const { user } = useAuth();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [viceLogs, setViceLogs] = useState<ViceLog[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    return data.subscribeGoals(user.uid, setGoals, (err) => setError(err.message));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return data.subscribeTasks(user.uid, setTasks);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return data.subscribeViceLogs(user.uid, setViceLogs);
  }, [user]);

  async function handleCreate(input: NewGoal) {
    if (!user) return;
    setError(null);
    try {
      await data.createGoal(user.uid, input);
      setFormOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create goal");
    }
  }

  async function handleLogVice(vicePresetId: string) {
    if (!user) return;
    setError(null);
    try {
      await data.logVice(user.uid, vicePresetId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not log slip");
    }
  }

  const activeViceLogs = viceLogs.filter((v) => !v.compensated);

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
        onEdit={(patch) => user && data.updateGoal(user.uid, goal.id, patch)}
        onComplete={() => user && data.setGoalStatus(user.uid, goal.id, "completed" as GoalStatus)}
        onArchive={() => user && data.setGoalStatus(user.uid, goal.id, "archived" as GoalStatus)}
        onDelete={() => user && data.deleteGoal(user.uid, goal.id)}
        onLinkTask={(taskId) => user && data.updateTask(user.uid, taskId, { goalId: goal.id })}
        onUnlinkTask={(taskId) => user && data.updateTask(user.uid, taskId, { goalId: undefined })}
        onNewTask={(title) =>
          user &&

          data.createTask(user.uid, {
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
      <PageHeader
        eyebrow="Long-term"
        title="Goals"
        description="Bigger objectives made up of several Tasks — progress tracks automatically as you complete them."
        action={
          !formOpen && (
            <Button size="sm" onClick={() => setFormOpen(true)}>
              New goal
            </Button>
          )
        }
      />

      <div className="grid grid-cols-3 gap-3">
        <StatTile value={activeGoals.length} label="Active" tone="primary" />
        <StatTile value={completedGoals.length} label="Completed" />
        <StatTile value={`${overallPercent}%`} label="Avg. progress" />
      </div>

      {goals.length > 0 && <GoalStatusChart goals={goals} />}

      {formOpen && <GoalForm onSubmit={handleCreate} onCancel={() => setFormOpen(false)} />}
      <ErrorText>{error}</ErrorText>

      {activeGoals.length > 0 && <div className="flex flex-col gap-3">{activeGoals.map(renderGoalCard)}</div>}

      {activeGoals.length === 0 && !formOpen && (
        <div className="rounded-xl border border-dashed border-border bg-surface px-4 py-8 text-center text-sm text-muted">
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

      <div className="flex flex-col gap-2 border-t-2 border-dashed border-border pt-6">
        <div>
          <SectionHeader eyebrow="Slipped up?" title="Log a slip" />
          <p className="mt-1 text-sm text-muted">
            Docks XP from a relevant stat and auto-creates a compensating task — complete it to refund the XP.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {VICE_PRESETS.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => handleLogVice(v.id)}
              className="rounded-full border border-border-strong px-3 py-1.5 text-xs hover:bg-primary/10"
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
                  className="flex items-center justify-between gap-3 rounded-xl border border-border-strong bg-surface px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-bold">{preset?.label ?? v.viceId}</p>
                    <p className="font-mono text-xs text-muted uppercase">
                      -{v.penaltyXp} XP · {task ? `Task: ${task.title} (${task.status})` : "Compensating task missing"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => user && data.deleteViceLog(user.uid, v.id)}
                    className="shrink-0 font-mono text-xs font-bold text-danger uppercase hover:underline"
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
