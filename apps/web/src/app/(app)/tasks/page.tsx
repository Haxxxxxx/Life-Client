"use client";

import {
  TASK_CATEGORIES,
  TASK_DIFFICULTIES,
  TASK_PRIORITIES,
  createTask,
  deleteTask,
  setTaskStatus,
  subscribeGoals,
  subscribeTasks,
  updateTask,
  type Goal,
  type Task,
  type TaskCategory,
  type TaskDifficulty,
  type TaskPriority,
  type TaskStatus,
} from "@life-client/shared";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";

const STATUS_ORDER: TaskStatus[] = ["todo", "in_progress", "done"];
const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
};

const CATEGORY_LABEL = Object.fromEntries(TASK_CATEGORIES.map((c) => [c.id, c.label])) as Record<
  TaskCategory,
  string
>;
const DIFFICULTY_LABEL = Object.fromEntries(TASK_DIFFICULTIES.map((d) => [d.id, d.label])) as Record<
  TaskDifficulty,
  string
>;

function EditTaskForm({
  task,
  goals,
  onSave,
  onCancel,
}: {
  task: Task;
  goals: Goal[];
  onSave: (patch: Partial<Task>) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [category, setCategory] = useState<TaskCategory>(task.category);
  const [difficulty, setDifficulty] = useState<TaskDifficulty>(task.difficulty);
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [dueDate, setDueDate] = useState(task.dueDate ?? "");
  const [goalId, setGoalId] = useState(task.goalId ?? "");

  return (
    <div className="flex flex-1 flex-col gap-2">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="rounded-md border-2 border-foreground bg-background px-2 py-1.5 text-sm"
      />
      <div className="flex flex-wrap gap-2">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as TaskCategory)}
          className="rounded-md border-2 border-foreground bg-background px-2 py-1 text-xs"
        >
          {TASK_CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <select
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value as TaskDifficulty)}
          className="rounded-md border-2 border-foreground bg-background px-2 py-1 text-xs"
        >
          {TASK_DIFFICULTIES.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as TaskPriority)}
          className="rounded-md border-2 border-foreground bg-background px-2 py-1 text-xs"
        >
          {TASK_PRIORITIES.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label} priority
            </option>
          ))}
        </select>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="rounded-md border-2 border-foreground bg-background px-2 py-1 text-xs"
        />
        <select
          value={goalId}
          onChange={(e) => setGoalId(e.target.value)}
          className="rounded-md border-2 border-foreground bg-background px-2 py-1 text-xs"
        >
          <option value="">No goal</option>
          {goals.map((g) => (
            <option key={g.id} value={g.id}>
              {g.title}
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() =>
            onSave({
              title: title.trim() || task.title,
              category,
              difficulty,
              priority,
              dueDate: dueDate || undefined,
              goalId: goalId || undefined,
            })
          }
          className="font-mono text-xs font-bold text-primary uppercase hover:underline"
        >
          Save
        </button>
        <button type="button" onClick={onCancel} className="font-mono text-xs font-bold text-muted uppercase hover:underline">
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function TasksPage() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [title, setTitle] = useState("");
  const [difficulty, setDifficulty] = useState<TaskDifficulty>("medium");
  const [category, setCategory] = useState<TaskCategory>("work");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !db) return;
    return subscribeTasks(db, user.uid, setTasks, (err) => setError(err.message));
  }, [user]);

  useEffect(() => {
    if (!user || !db) return;
    return subscribeGoals(db, user.uid, setGoals);
  }, [user]);

  async function handleAddTask(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !db || !title.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await createTask(db, user.uid, {
        title: title.trim(),
        status: "todo",
        priority: "medium",
        difficulty,
        category,
        source: "manual",
        tags: [],
      });
      setTitle("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create task");
    } finally {
      setSubmitting(false);
    }
  }

  function nextStatus(status: TaskStatus): TaskStatus {
    const idx = STATUS_ORDER.indexOf(status);
    return STATUS_ORDER[(idx + 1) % STATUS_ORDER.length]!;
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <p className="font-mono text-xs font-bold tracking-[0.3em] text-primary uppercase">Today</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Tasks</h1>
        <p className="text-sm text-muted">
          Everything you need to do — added by hand, or pulled in from GitHub, GitLab, and your
          calendar once connected.
        </p>
      </div>

      <form onSubmit={handleAddTask} className="flex flex-col gap-2 rounded-md border-2 border-foreground bg-surface p-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a task…"
          className="rounded-md border-2 border-foreground bg-background px-3 py-2 text-sm outline-none placeholder:text-muted focus:shadow-[2px_2px_0_0_var(--primary)]"
        />
        <div className="flex flex-wrap gap-2">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as TaskCategory)}
            className="rounded-md border-2 border-foreground bg-background px-2 py-1.5 text-xs"
          >
            {TASK_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as TaskDifficulty)}
            className="rounded-md border-2 border-foreground bg-background px-2 py-1.5 text-xs"
          >
            {TASK_DIFFICULTIES.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={submitting || !title.trim()}
            className="ml-auto rounded-md border-2 border-foreground bg-primary px-4 py-1.5 text-sm font-bold text-primary-foreground shadow-[2px_2px_0_0_var(--foreground)] transition hover:-translate-y-0.5 active:translate-y-0 active:shadow-none disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </form>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <ul className="flex flex-col gap-2">
        {tasks.map((task) => (
          <li
            key={task.id}
            className="flex items-center justify-between gap-3 rounded-md border-2 border-foreground bg-surface px-4 py-3"
          >
            {editingId === task.id ? (
              <EditTaskForm
                task={task}
                goals={goals}
                onSave={(patch) => {
                  updateTask(db!, user!.uid, task.id, patch);
                  setEditingId(null);
                }}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <>
                <button type="button" onClick={() => setEditingId(task.id)} className="min-w-0 flex-1 text-left">
                  <p
                    className={`truncate text-sm hover:underline ${task.status === "done" ? "text-muted line-through" : ""}`}
                  >
                    {task.title}
                  </p>
                  <p className="font-mono text-xs tracking-wide text-muted uppercase">
                    {STATUS_LABEL[task.status]} · {task.source}
                    {task.category && ` · ${CATEGORY_LABEL[task.category]}`}
                    {task.difficulty && ` · ${DIFFICULTY_LABEL[task.difficulty]}`}
                    {task.goalId && ` · ${goals.find((g) => g.id === task.goalId)?.title ?? "Goal"}`}
                  </p>
                </button>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setTaskStatus(db!, user!.uid, task.id, nextStatus(task.status))}
                    className="rounded-md border-2 border-foreground px-3 py-1.5 font-mono text-xs font-bold uppercase hover:bg-accent/20"
                  >
                    Mark {STATUS_LABEL[nextStatus(task.status)]}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteTask(db!, user!.uid, task.id)}
                    className="rounded-md px-3 py-1.5 font-mono text-xs font-bold text-red-600 uppercase hover:bg-red-600/10"
                  >
                    Delete
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
        {tasks.length === 0 && (
          <li className="rounded-md border-2 border-dashed border-foreground/30 px-4 py-8 text-center text-sm text-muted">
            No tasks yet — add your first one above.
          </li>
        )}
      </ul>
    </div>
  );
}
