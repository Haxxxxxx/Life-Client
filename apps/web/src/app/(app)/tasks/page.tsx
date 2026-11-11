"use client";

import {
  TASK_CATEGORIES,
  TASK_DIFFICULTIES,
  archivedTasks,
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
import { TasksCompletedChart } from "@/components/charts";
import { ConfirmButton } from "@/components/confirm-button";
import { Button, ErrorText, Input, PageHeader, SkeletonRows, pageShellClassName } from "@/components/ui";
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

  // Keyed on uid rather than a boolean reset inside the effect: setState in an
  // effect body cascades a render, and deriving it stops a user switch from
  // briefly showing the previous account's rows as loaded.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const loaded = Boolean(user) && loadedFor === user?.uid;

  useEffect(() => {
    if (!user) return;
    const uid = user.uid;
    return data.subscribeTasks(
      uid,
      (next) => {
        setTasks(next);
        setLoadedFor(uid);
      },
      (err) => setError(err.message),
    );
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return data.subscribeGoals(user.uid, setGoals, (err) => setError(err.message));
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

  const archived = useMemo(() => archivedTasks(tasks), [tasks]);

  /**
   * Un-archiving keeps the task's status. `archived` is a separate flag from
   * status (unlike goals, where archived *is* the status), so restoring one
   * puts a done task back in the list still done — which is what the user
   * expects from something the cleanup filed away.
   */
  async function handleRestoreTask(taskId: string) {
    if (!user) return;
    setError(null);
    try {
      await data.updateTask(user.uid, taskId, { archived: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not restore this task");
    }
  }

  return (
    <div className={pageShellClassName()}>
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

      {tasks.length > 0 && <TasksCompletedChart tasks={tasks} />}

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
                <ConfirmButton onConfirm={() => data.deleteTask(user!.uid, task.id)} />
              </div>
            </li>
          );
        })}
        {!loaded && (
          <li>
            <SkeletonRows rows={4} />
          </li>
        )}
        {loaded && sortedTasks.length === 0 && (
          <li className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
            {tasks.length === 0
              ? "No tasks yet — add your first one above."
              : "All caught up — everything here has been done long enough to auto-archive."}
          </li>
        )}
      </ul>

      {archived.length > 0 && (
        <details className="flex flex-col gap-3">
          <summary className="cursor-pointer font-mono text-xs font-bold tracking-[0.2em] text-muted uppercase">
            Archived ({archived.length})
          </summary>
          <p className="mt-3 text-xs text-muted">
            Tasks the daily cleanup filed away after being done for 30 days. Nothing here is deleted — restore one
            to put it back in the list above.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {archived.map((task) => (
              <li
                key={task.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3"
              >
                <Link href={`/tasks/${task.id}`} className="min-w-0 flex-1 truncate text-sm hover:underline">
                  {task.title}
                </Link>
                <div className="flex shrink-0 items-center gap-2">
                  <Button size="sm" variant="secondary" onClick={() => handleRestoreTask(task.id)}>
                    Restore
                  </Button>
                  <ConfirmButton onConfirm={() => user && data.deleteTask(user.uid, task.id)} />
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
