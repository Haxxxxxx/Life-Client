"use client";

import {
  TASK_CATEGORIES,
  TASK_DIFFICULTIES,
  describeRecurrence,
  visibleTasks,
  type Goal,
  type Task,
  type TaskCategory,
  type TaskDifficulty,
} from "@life-client/shared";
import { data } from "@life-client/shared";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button, ErrorText, Input, PageHeader } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
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
    if (!user) return;
    return data.subscribeTasks(user.uid, setTasks, (err) => setError(err.message));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return data.subscribeGoals(user.uid, setGoals);
  }, [user]);

  async function handleAddTask(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !title.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await data.createTask(user.uid, {
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
  // within each band is preserved. Auto-archived tasks (done 30+ days) are
  // hidden here but never deleted — they're still in Firestore if ever needed.
  const sortedTasks = useMemo(() => {
    const rank = (t: Task) => {
      if (t.status === "done") return 3;
      const meta = prMetaOf(t);
      if (meta?.isBot) return 2;
      if (meta && !meta.mine) return 1;
      return 0;
    };
    return visibleTasks(tasks).sort((a, b) => rank(a) - rank(b));
  }, [tasks]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <PageHeader
        eyebrow="Today"
        title="Tasks"
        description="Everything you need to do — added by hand, or pulled in from GitHub, GitLab, and your calendar once connected. Your work sits up top; teammates’ open PRs and bot bumps sink below it."
      />

      <form onSubmit={handleAddTask} className="flex flex-col gap-2 rounded-xl border border-border-strong bg-surface p-3">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a task…" />
        <div className="flex flex-wrap gap-2">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as TaskCategory)}
            className="rounded-xl border border-border-strong bg-background px-2 py-1.5 text-xs"
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
            className="rounded-xl border border-border-strong bg-background px-2 py-1.5 text-xs"
          >
            {TASK_DIFFICULTIES.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
          <Button type="submit" size="sm" disabled={submitting || !title.trim()} className="ml-auto">
            Add
          </Button>
        </div>
      </form>

      <ErrorText>{error}</ErrorText>

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
              className={`flex flex-col gap-3 rounded-xl border bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
                meta?.isBot ? "border-warning bg-warning/5" : "border-border-strong"
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
                    className="rounded-xl border border-border-strong px-3 py-1.5 font-mono text-xs font-bold uppercase hover:bg-primary/10"
                  >
                    View on {task.source === "gitlab" ? "GitLab" : "GitHub"} ↗
                  </a>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => data.advanceTaskStatus(user!.uid, task, nextStatus(task.status))}
                >
                  Mark {STATUS_LABEL[nextStatus(task.status)]}
                </Button>
                <button
                  type="button"
                  onClick={() => data.deleteTask(user!.uid, task.id)}
                  className="rounded-xl px-3 py-1.5 font-mono text-xs font-bold text-danger uppercase hover:bg-danger/10"
                >
                  Delete
                </button>
              </div>
            </li>
          );
        })}
        {sortedTasks.length === 0 && (
          <li className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
            No tasks yet — add your first one above.
          </li>
        )}
      </ul>
    </div>
  );
}
