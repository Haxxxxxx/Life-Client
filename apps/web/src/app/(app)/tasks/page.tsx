"use client";

import {
  TASK_CATEGORIES,
  TASK_DIFFICULTIES,
  advanceTaskStatus,
  createTask,
  deleteTask,
  describeRecurrence,
  subscribeGoals,
  subscribeTasks,
  type Goal,
  type Task,
  type TaskCategory,
  type TaskDifficulty,
} from "@life-client/shared";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import {
  CATEGORY_LABEL,
  DIFFICULTY_LABEL,
  PrBadges,
  STATUS_LABEL,
  nextStatus,
  prMetaOf,
  shortDateTime,
} from "./_shared";

export default function TasksPage() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [title, setTitle] = useState("");
  const [difficulty, setDifficulty] = useState<TaskDifficulty>("medium");
  const [category, setCategory] = useState<TaskCategory>("work");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // Keep the createdAt-desc order from Firestore, but layer it: my work first,
  // then teammates' PRs, then bot bumps, then done — sort is stable so order
  // within each band is preserved.
  const sortedTasks = useMemo(() => {
    const rank = (t: Task) => {
      if (t.status === "done") return 3;
      const meta = prMetaOf(t);
      if (meta?.isBot) return 2;
      if (meta && !meta.mine) return 1;
      return 0;
    };
    return [...tasks].sort((a, b) => rank(a) - rank(b));
  }, [tasks]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <p className="font-mono text-xs font-bold tracking-[0.3em] text-primary uppercase">Today</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Tasks</h1>
        <p className="text-sm text-muted">
          Everything you need to do — added by hand, or pulled in from GitHub, GitLab, and your
          calendar once connected. Your work sits up top; teammates&rsquo; open PRs and bot bumps
          sink below it.
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
        {sortedTasks.map((task) => {
          const meta = prMetaOf(task);
          const diff =
            meta && (meta.additions != null || meta.deletions != null)
              ? `+${meta.additions ?? 0} −${meta.deletions ?? 0}`
              : null;
          const prTime = meta ? shortDateTime(meta.resolvedAt ?? meta.prUpdatedAt) : "";
          const prTimeLabel = meta?.resolvedAt ? "resolved" : "updated";
          return (
            <li
              key={task.id}
              className={`flex flex-col gap-3 rounded-md border-2 bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
                meta?.isBot ? "border-amber-500 bg-amber-500/5" : "border-foreground"
              }`}
            >
              <Link href={`/tasks/${task.id}`} className="min-w-0 flex-1">
                <p
                  className={`truncate text-sm hover:underline ${task.status === "done" ? "text-muted line-through" : ""}`}
                >
                  {task.title}
                </p>
                {meta && <PrBadges meta={meta} />}
                <p className="mt-1 font-mono text-xs tracking-wide text-muted uppercase">
                  {meta ? (
                    <>
                      {task.sourceRef ?? task.source}
                      {diff && ` · ${diff}`}
                      {` · ${STATUS_LABEL[task.status]}`}
                      {prTime && ` · ${prTimeLabel} ${prTime}`}
                    </>
                  ) : (
                    <>
                      {STATUS_LABEL[task.status]} · {task.source}
                      {task.category && ` · ${CATEGORY_LABEL[task.category]}`}
                      {task.difficulty && ` · ${DIFFICULTY_LABEL[task.difficulty]}`}
                      {task.goalId && ` · ${goals.find((g) => g.id === task.goalId)?.title ?? "Goal"}`}
                      {task.recurrence && ` · ↻ ${describeRecurrence(task.recurrence)}`}
                    </>
                  )}
                </p>
              </Link>
              <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                {task.sourceUrl && (
                  <a
                    href={task.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-md border-2 border-foreground px-3 py-1.5 font-mono text-xs font-bold uppercase hover:bg-accent/20"
                  >
                    View on {task.source === "gitlab" ? "GitLab" : "GitHub"} ↗
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => advanceTaskStatus(db!, user!.uid, task, nextStatus(task.status))}
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
            </li>
          );
        })}
        {tasks.length === 0 && (
          <li className="rounded-md border-2 border-dashed border-foreground/30 px-4 py-8 text-center text-sm text-muted">
            No tasks yet — add your first one above.
          </li>
        )}
      </ul>
    </div>
  );
}
