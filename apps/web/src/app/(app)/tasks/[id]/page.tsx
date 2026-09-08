"use client";

import {
  advanceTaskStatus,
  deleteTask,
  describeRecurrence,
  subscribeGoals,
  subscribeTask,
  updateTask,
  type Goal,
  type PrEvent,
  type Task,
  type TaskStatus,
} from "@life-client/shared";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import { EditTaskForm } from "../_components";
import {
  CATEGORY_LABEL,
  DIFFICULTY_LABEL,
  PILL,
  PR_CHECK_STYLE,
  PR_REVIEW_STYLE,
  PR_STATE_STYLE,
  STATUS_LABEL,
  STATUS_ORDER,
  prMetaOf,
  relativeTime,
} from "../_shared";

function PrPanel({ task }: { task: Task }) {
  const meta = prMetaOf(task);
  if (!meta) return null;
  const state = PR_STATE_STYLE[meta.state];
  const check = PR_CHECK_STYLE[meta.checks];
  const review = meta.reviewDecision ? PR_REVIEW_STYLE[meta.reviewDecision] : null;

  const rows: { label: string; value: ReactNode }[] = [
    {
      label: "State",
      value: (
        <span className="flex items-center gap-2">
          <span className={`${PILL} ${state.cls}`}>{state.label}</span>
          {meta.resolvedAt && <span className="text-xs text-muted">{relativeTime(meta.resolvedAt)}</span>}
        </span>
      ),
    },
  ];
  if (check) rows.push({ label: "CI", value: <span className={`${PILL} ${check.cls}`}>{check.label}</span> });
  if (review) rows.push({ label: "Review", value: <span className={`${PILL} ${review.cls}`}>{review.label}</span> });
  if (meta.headRef || meta.baseRef)
    rows.push({
      label: "Branch",
      value: (
        <span className="font-mono text-xs">
          {meta.headRef ?? "?"} <span className="text-muted">→</span> {meta.baseRef ?? "?"}
        </span>
      ),
    });
  if (meta.additions != null || meta.deletions != null)
    rows.push({
      label: "Size",
      value: (
        <span className="font-mono text-xs">
          <span className="text-green-700">+{meta.additions ?? 0}</span>{" "}
          <span className="text-red-600">−{meta.deletions ?? 0}</span>
        </span>
      ),
    });
  rows.push({ label: "Author", value: <span className="font-mono text-xs">@{meta.author}</span> });
  if (meta.prUpdatedAt)
    rows.push({ label: "PR updated", value: <span className="text-xs text-muted">{relativeTime(meta.prUpdatedAt)}</span> });

  const events = [...((task.prEvents as PrEvent[] | undefined) ?? [])].reverse();

  return (
    <div className="flex flex-col gap-4 rounded-md border-2 border-foreground bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-xs font-bold tracking-[0.2em] text-primary uppercase">Pull request</p>
        {task.sourceUrl && (
          <a
            href={task.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-xs font-bold uppercase hover:underline"
          >
            {task.sourceRef ?? "Open"} ↗
          </a>
        )}
      </div>

      <dl className="flex flex-col gap-2">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline gap-3">
            <dt className="w-24 shrink-0 font-mono text-[10px] tracking-wide text-muted uppercase">{r.label}</dt>
            <dd>{r.value}</dd>
          </div>
        ))}
      </dl>

      {events.length > 0 && (
        <div>
          <p className="mb-2 font-mono text-[10px] tracking-wide text-muted uppercase">Activity</p>
          <ul className="flex flex-col gap-1.5">
            {events.map((e, i) => (
              <li key={i} className="flex items-baseline gap-2 text-xs">
                <span className="w-16 shrink-0 text-muted">{relativeTime(e.at)}</span>
                <span className="font-mono">{e.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function TaskDetailPage() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const taskId = params.id;

  const [task, setTask] = useState<Task | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!user || !db || !taskId) return;
    return subscribeTask(db, user.uid, taskId, (t) => {
      setTask(t);
      setLoading(false);
    });
  }, [user, taskId]);

  useEffect(() => {
    if (!user || !db) return;
    return subscribeGoals(db, user.uid, setGoals);
  }, [user]);

  if (!user) return null;

  if (loading) {
    return <p className="mx-auto max-w-2xl text-sm text-muted">Loading…</p>;
  }

  if (!task) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <Link href="/tasks" className="font-mono text-xs font-bold uppercase text-muted hover:underline">
          ← Tasks
        </Link>
        <p className="text-sm text-muted">This task no longer exists.</p>
      </div>
    );
  }

  const goal = task.goalId ? goals.find((g) => g.id === task.goalId) : undefined;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <Link href="/tasks" className="font-mono text-xs font-bold uppercase text-muted hover:underline">
        ← Tasks
      </Link>

      <div className="flex flex-col gap-3">
        <h1
          className={`text-2xl font-bold tracking-tight ${task.status === "done" ? "text-muted line-through" : ""}`}
        >
          {task.title}
        </h1>

        <div className="flex flex-wrap items-center gap-2">
          {STATUS_ORDER.map((s: TaskStatus) => (
            <button
              key={s}
              type="button"
              onClick={() => advanceTaskStatus(db!, user.uid, task, s)}
              disabled={task.status === s}
              className={`rounded-md border-2 border-foreground px-3 py-1.5 font-mono text-xs font-bold uppercase transition ${
                task.status === s
                  ? "bg-primary text-primary-foreground"
                  : "bg-surface hover:bg-accent/20"
              }`}
            >
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>

        <p className="font-mono text-xs tracking-wide text-muted uppercase">
          {task.source}
          {` · ${CATEGORY_LABEL[task.category]}`}
          {` · ${DIFFICULTY_LABEL[task.difficulty]}`}
          {` · ${task.priority} priority`}
          {task.dueDate && ` · due ${task.dueDate}`}
          {goal && ` · ${goal.title}`}
          {task.recurrence && ` · ↻ ${describeRecurrence(task.recurrence)}`}
        </p>

        {task.description && <p className="text-sm whitespace-pre-wrap">{task.description}</p>}
      </div>

      <PrPanel task={task} />

      <div className="flex flex-col gap-3 rounded-md border-2 border-foreground bg-surface p-4">
        <div className="flex items-center justify-between">
          <p className="font-mono text-xs font-bold tracking-[0.2em] text-primary uppercase">Edit</p>
          {!editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="font-mono text-xs font-bold text-primary uppercase hover:underline"
            >
              Edit fields
            </button>
          )}
        </div>
        {editing ? (
          <EditTaskForm
            task={task}
            goals={goals}
            onSave={(patch) => {
              updateTask(db!, user.uid, task.id, patch);
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <p className="text-xs text-muted">Title, category, difficulty, priority, due date, goal and repeat.</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
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
          onClick={async () => {
            await deleteTask(db!, user.uid, task.id);
            router.push("/tasks");
          }}
          className="rounded-md px-3 py-1.5 font-mono text-xs font-bold text-red-600 uppercase hover:bg-red-600/10"
        >
          Delete task
        </button>
      </div>
    </div>
  );
}
