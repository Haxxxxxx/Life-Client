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
import { Badge, type BadgeTone } from "@/components/ui";

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
  const then = new Date(iso).getTime();
  // Firestore documents are unvalidated and some timestamp fields are written
  // as Firestore Timestamps despite being typed `string`, so an unparseable
  // value reaches here and used to render "NaNd ago".
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  const min = Math.round(diffMs / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}

/** "8 Sep, 14:32" — absolute date + time in the viewer's locale/zone. */
export function shortDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  // Same reason as relativeTime: this used to print "Invalid Date".
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const PR_STATE_STYLE: Record<PrState, { label: string; tone: BadgeTone }> = {
  open: { label: "Open", tone: "info" },
  draft: { label: "Draft", tone: "neutral" },
  merged: { label: "Merged", tone: "primary" },
  closed: { label: "Closed", tone: "danger" },
};

export const PR_CHECK_STYLE: Record<PrCheckStatus, { label: string; tone: BadgeTone } | null> = {
  success: { label: "✓ CI", tone: "success" },
  failure: { label: "✗ CI", tone: "danger" },
  pending: { label: "● CI", tone: "warning" },
  none: null,
};

export const PR_REVIEW_STYLE: Record<PrReviewDecision, { label: string; tone: BadgeTone }> = {
  approved: { label: "Approved", tone: "success" },
  changes_requested: { label: "Changes", tone: "danger" },
  review_required: { label: "Review", tone: "warning" },
};

/**
 * Looks up a badge style, falling back to a neutral badge.
 *
 * `PR_STATE_STYLE[meta.state].tone` threw on any value outside the union —
 * and prMeta comes from whatever GitHub or GitLab returned, stored in
 * Firestore without validation. A provider adding a state, or a malformed
 * document, would take out the whole Tasks list rather than render one odd
 * badge.
 */
export function styleFor<K extends string>(
  map: Record<K, { label: string; tone: BadgeTone }>,
  key: K | string,
): { label: string; tone: BadgeTone } {
  return map[key as K] ?? { label: String(key), tone: "neutral" };
}

export function PrBadges({ meta }: { meta: TaskPrMeta }) {
  const state = styleFor(PR_STATE_STYLE, meta.state);
  const check = PR_CHECK_STYLE[meta.checks] ?? null;
  const review = meta.reviewDecision ? styleFor(PR_REVIEW_STYLE, meta.reviewDecision) : null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5">
      <Badge tone={state.tone}>{state.label}</Badge>
      {check && <Badge tone={check.tone}>{check.label}</Badge>}
      {review && <Badge tone={review.tone}>{review.label}</Badge>}
      {meta.isBot && (
        <Badge tone="warning" subtle>
          Bot
        </Badge>
      )}
      {!meta.mine && !meta.isBot && <Badge>@{meta.author}</Badge>}
    </div>
  );
}
