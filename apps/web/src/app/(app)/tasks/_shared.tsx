import {
  TASK_CATEGORIES,
  TASK_DIFFICULTIES,
  type PrCheckStatus,
  type PrReviewDecision,
  type PrState,
  type Task,
  type TaskCategory,
  type TaskDifficulty,
  type TaskPrMeta,
  type TaskStatus,
} from "@life-client/shared";

export const STATUS_ORDER: TaskStatus[] = ["todo", "in_progress", "done"];
export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
};

export function nextStatus(status: TaskStatus): TaskStatus {
  const idx = STATUS_ORDER.indexOf(status);
  return STATUS_ORDER[(idx + 1) % STATUS_ORDER.length]!;
}

export const CATEGORY_LABEL = Object.fromEntries(TASK_CATEGORIES.map((c) => [c.id, c.label])) as Record<
  TaskCategory,
  string
>;
export const DIFFICULTY_LABEL = Object.fromEntries(TASK_DIFFICULTIES.map((d) => [d.id, d.label])) as Record<
  TaskDifficulty,
  string
>;

/** github/gitlab-sourced tasks carry a prMeta snapshot; everything else doesn't. */
export function prMetaOf(task: Task): TaskPrMeta | null {
  return (task.source === "github" || task.source === "gitlab") && task.prMeta ? task.prMeta : null;
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.round(diffMs / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}

const PILL = "rounded-full border-2 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide";

export const PR_STATE_STYLE: Record<PrState, { label: string; cls: string }> = {
  open: { label: "Open", cls: "border-sky-500 text-sky-600" },
  draft: { label: "Draft", cls: "border-foreground/40 text-muted" },
  merged: { label: "Merged", cls: "border-purple-500 text-purple-600" },
  closed: { label: "Closed", cls: "border-red-500 text-red-600" },
};

export const PR_CHECK_STYLE: Record<PrCheckStatus, { label: string; cls: string } | null> = {
  success: { label: "✓ CI", cls: "border-green-600 text-green-700" },
  failure: { label: "✗ CI", cls: "border-red-500 text-red-600" },
  pending: { label: "● CI", cls: "border-amber-500 text-amber-600" },
  none: null,
};

export const PR_REVIEW_STYLE: Record<PrReviewDecision, { label: string; cls: string }> = {
  approved: { label: "Approved", cls: "border-green-600 text-green-700" },
  changes_requested: { label: "Changes", cls: "border-red-500 text-red-600" },
  review_required: { label: "Review", cls: "border-amber-500 text-amber-600" },
};

export function PrBadges({ meta }: { meta: TaskPrMeta }) {
  const state = PR_STATE_STYLE[meta.state];
  const check = PR_CHECK_STYLE[meta.checks];
  const review = meta.reviewDecision ? PR_REVIEW_STYLE[meta.reviewDecision] : null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5">
      <span className={`${PILL} ${state.cls}`}>{state.label}</span>
      {check && <span className={`${PILL} ${check.cls}`}>{check.label}</span>}
      {review && <span className={`${PILL} ${review.cls}`}>{review.label}</span>}
      {meta.isBot && <span className={`${PILL} border-amber-500 bg-amber-500/10 text-amber-700`}>Bot</span>}
      {!meta.mine && !meta.isBot && (
        <span className={`${PILL} border-foreground/30 text-muted`}>@{meta.author}</span>
      )}
    </div>
  );
}

export { PILL };
