"use client";

import {
  createTask,
  deleteTask,
  setTaskStatus,
  subscribeTasks,
  type Task,
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

export default function TasksPage() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    return subscribeTasks(db, user.uid, setTasks, (err) => setError(err.message));
  }, [user]);

  async function handleAddTask(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !title.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await createTask(db, user.uid, {
        title: title.trim(),
        status: "todo",
        priority: "medium",
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

      <form onSubmit={handleAddTask} className="flex gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a task…"
          className="flex-1 rounded-md border-2 border-foreground bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted focus:shadow-[2px_2px_0_0_var(--primary)]"
        />
        <button
          type="submit"
          disabled={submitting || !title.trim()}
          className="rounded-md border-2 border-foreground bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-[2px_2px_0_0_var(--foreground)] transition hover:-translate-y-0.5 active:translate-y-0 active:shadow-none disabled:opacity-50"
        >
          Add
        </button>
      </form>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <ul className="flex flex-col gap-2">
        {tasks.map((task) => (
          <li
            key={task.id}
            className="flex items-center justify-between gap-3 rounded-md border-2 border-foreground bg-surface px-4 py-3"
          >
            <div className="min-w-0">
              <p className={`truncate text-sm ${task.status === "done" ? "text-muted line-through" : ""}`}>
                {task.title}
              </p>
              <p className="font-mono text-xs tracking-wide text-muted uppercase">
                {STATUS_LABEL[task.status]} · {task.source}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setTaskStatus(db, user!.uid, task.id, nextStatus(task.status))}
                className="rounded-md border-2 border-foreground px-3 py-1.5 font-mono text-xs font-bold uppercase hover:bg-accent/20"
              >
                Mark {STATUS_LABEL[nextStatus(task.status)]}
              </button>
              <button
                type="button"
                onClick={() => deleteTask(db, user!.uid, task.id)}
                className="rounded-md px-3 py-1.5 font-mono text-xs font-bold text-red-600 uppercase hover:bg-red-600/10"
              >
                Delete
              </button>
            </div>
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
