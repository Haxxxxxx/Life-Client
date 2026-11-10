"use client";

import {
  describeRecurrence,
  type Goal,
  type PrEvent,
  type Task,
  type TaskStatus,
} from "@life-client/shared";
import { data } from "@life-client/shared";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Badge, Button, Card, Eyebrow } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { EditTaskForm } from "../_components";
import {
  CATEGORY_LABEL,
  DIFFICULTY_LABEL,
  PR_CHECK_STYLE,
  PR_REVIEW_STYLE,
  PR_STATE_STYLE,
  STATUS_LABEL,
  STATUS_ORDER,
  prMetaOf,
  relativeTime,
  shortDateTime,
  styleFor,
} from "../_shared";

function PrPanel({ task }: { task: Task }) {
  const meta = prMetaOf(task);
  if (!meta) return null;
  // styleFor, not a bare index: prMeta holds whatever the provider returned,
  // and an unexpected state used to throw and white-screen this route.
  const state = styleFor(PR_STATE_STYLE, meta.state);
  const check = PR_CHECK_STYLE[meta.checks] ?? null;
  const review = meta.reviewDecision ? styleFor(PR_REVIEW_STYLE, meta.reviewDecision) : null;

  const rows: { label: string; value: ReactNode }[] = [
    {
      label: "State",
      value: (
        <span className="flex items-center gap-2">
          <Badge tone={state.tone}>{state.label}</Badge>
          {meta.resolvedAt && <span className="text-xs text-muted">{relativeTime(meta.resolvedAt)}</span>}
        </span>
      ),
    },
  ];
  if (check) rows.push({ label: "CI", value: <Badge tone={check.tone}>{check.label}</Badge> });
  if (review) rows.push({ label: "Review", value: <Badge tone={review.tone}>{review.label}</Badge> });
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
          <span className="text-success">+{meta.additions ?? 0}</span>{" "}
          <span className="text-danger">−{meta.deletions ?? 0}</span>
        </span>
      ),
    });
  rows.push({ label: "Author", value: <span className="font-mono text-xs">@{meta.author}</span> });
  if (meta.prCreatedAt)
    rows.push({
      label: "Opened",
      value: (
        <span className="text-xs">
          {shortDateTime(meta.prCreatedAt)} <span className="text-muted">· {relativeTime(meta.prCreatedAt)}</span>
        </span>
      ),
    });
  if (meta.prUpdatedAt)
    rows.push({
      label: "Updated",
      value: (
        <span className="text-xs">
          {shortDateTime(meta.prUpdatedAt)} <span className="text-muted">· {relativeTime(meta.prUpdatedAt)}</span>
        </span>
      ),
    });
  if (meta.resolvedAt)
    rows.push({
      label: meta.state === "merged" ? "Merged" : "Closed",
      value: (
        <span className="text-xs">
          {shortDateTime(meta.resolvedAt)} <span className="text-muted">· {relativeTime(meta.resolvedAt)}</span>
        </span>
      ),
    });

  const events = [...((task.prEvents as PrEvent[] | undefined) ?? [])].reverse();

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <Eyebrow>Pull request</Eyebrow>
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
            <dt className="w-24 shrink-0 font-mono text-micro tracking-wide text-muted uppercase">{r.label}</dt>
            <dd>{r.value}</dd>
          </div>
        ))}
      </dl>

      {events.length > 0 && (
        <div>
          <p className="mb-2 font-mono text-micro tracking-wide text-muted uppercase">Activity</p>
          <ul className="flex flex-col gap-1.5">
            {events.map((e, i) => (
              <li key={i} className="flex items-baseline gap-2 text-xs">
                <span className="w-28 shrink-0 text-muted" title={new Date(e.at).toLocaleString()}>
                  {shortDateTime(e.at)}
                </span>
                <span className="font-mono">{e.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
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
    if (!user || !taskId) return;
    return data.subscribeTask(user.uid, taskId, (t) => {
      setTask(t);
      setLoading(false);
    });
  }, [user, taskId]);

  useEffect(() => {
    if (!user) return;
    return data.subscribeGoals(user.uid, setGoals);
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
            <Button
              key={s}
              size="sm"
              variant={task.status === s ? "primary" : "secondary"}
              onClick={() => data.advanceTaskStatus(user.uid, task, s)}
              disabled={task.status === s}
            >
              {STATUS_LABEL[s]}
            </Button>
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

      <Card className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Eyebrow>Edit</Eyebrow>
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
              data.updateTask(user.uid, task.id, patch);
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <p className="text-xs text-muted">Title, category, difficulty, priority, due date, goal and repeat.</p>
        )}
      </Card>

      <div className="flex flex-wrap items-center gap-2">
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
          variant="danger"
          size="sm"
          onClick={async () => {
            await data.deleteTask(user.uid, task.id);
            router.push("/tasks");
          }}
        >
          Delete task
        </Button>
      </div>
    </div>
  );
}
