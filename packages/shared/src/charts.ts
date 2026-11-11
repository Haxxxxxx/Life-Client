import { monthKey } from "./finance";
import { toDateStr } from "./streaks";
import type { Goal, Transaction } from "./types";

/**
 * Chart transforms shared by every client.
 *
 * These were implemented separately in apps/web, apps/mobile and
 * apps/knowledge, and they drifted — web and mobile showed *different numbers*
 * for the same goals, and the money trend rendered an empty chart on mobile
 * where web suppressed it. They are pure functions of their inputs plus an
 * injected `now`, so a client can never disagree with another about what the
 * same data means, and midnight/month-rollover behaviour is testable.
 */

export interface GoalStatusCounts {
  active: number;
  completed: number;
  archived: number;
  /** Everything, archived included. */
  total: number;
  /** Goals that reached an outcome: active + completed, excluding archived. */
  decided: number;
  /** completed / decided, 0..1. Zero when nothing has been decided. */
  hitRate: number;
}

/**
 * Counts goals by status and derives the completion rate.
 *
 * Archived goals are excluded from the hit-rate denominator: they were
 * dropped, not finished, so counting them as misses punishes you for tidying
 * up. Web used `completed / goals.length` and mobile used
 * `completed / (active + completed)`, so with 2 completed, 2 active and 6
 * archived, web said "2 of 10" while mobile said 50%. Mobile was right; this
 * is mobile's rule, in one place.
 */
export function goalStatusCounts(goals: Goal[]): GoalStatusCounts {
  let active = 0;
  let completed = 0;
  let archived = 0;
  for (const goal of goals) {
    if (goal.status === "active") active++;
    else if (goal.status === "completed") completed++;
    else if (goal.status === "archived") archived++;
  }
  const decided = active + completed;
  return {
    active,
    completed,
    archived,
    total: goals.length,
    decided,
    hitRate: decided > 0 ? completed / decided : 0,
  };
}

export interface MoneyTrendRow {
  /** YYYY-MM */
  key: string;
  /** Short month name in the viewer's locale. */
  label: string;
  income: number;
  spend: number;
}

export interface MoneyTrend {
  rows: MoneyTrendRow[];
  net: number;
  /**
   * False when every month in the window is empty.
   *
   * Mobile rendered the trend whenever *any* transaction existed, so a user
   * whose transactions were all older than the window got six invisible bars
   * and a "Net +$0" summary — a chart confidently showing nothing. Web already
   * checked this; now both get the same answer.
   */
  hasTrend: boolean;
}

/**
 * Income and spend per month over the last `months` months, ending with the
 * month containing `now`.
 *
 * `Transaction.date` is a plain YYYY-MM-DD string, so the month is taken by
 * slicing the string rather than via `new Date`, which would parse it as UTC
 * midnight and shift first-of-month entries into the previous month west of
 * UTC. `now` is injected so the window is testable across a month rollover.
 */
export function monthlyMoneyTrend(
  transactions: Transaction[],
  months: number,
  now: Date = new Date(),
): MoneyTrend {
  const rows: MoneyTrendRow[] = Array.from({ length: Math.max(0, months) }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
    return {
      key: monthKey(d),
      label: d.toLocaleDateString(undefined, { month: "short" }),
      income: 0,
      spend: 0,
    };
  });
  const byKey = new Map(rows.map((r) => [r.key, r]));

  for (const t of transactions) {
    const row = byKey.get(t.date.slice(0, 7));
    if (!row) continue;
    // Explicit on "income", so adding a third TransactionType later can't be
    // silently counted as spend.
    if (t.type === "income") row.income += t.amount;
    else if (t.type === "expense") row.spend += t.amount;
  }

  return {
    rows,
    net: rows.reduce((sum, r) => sum + r.income - r.spend, 0),
    hasTrend: rows.some((r) => r.income > 0 || r.spend > 0),
  };
}

/**
 * The last `count` local calendar days, oldest first, as YYYY-MM-DD.
 *
 * Built by constructing each date from local year/month/day parts rather than
 * by subtracting 24-hour spans, so a DST boundary inside the window cannot
 * skip or repeat a day.
 *
 * `now` is injectable because this was previously two copies — apps/web's took
 * no parameter and so could not be tested at all, while apps/mobile's could.
 */
export function lastNDays(count: number, now: Date = new Date()): string[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (count - 1 - i));
    return toDateStr(d);
  });
}

/**
 * Counts ISO timestamps per local day, index-aligned with `days` from
 * `lastNDays`. Timestamps outside the window are ignored rather than clamped
 * into the first or last bucket, which would overstate those two days.
 */
export function countPerDay(timestamps: string[], days: string[]): number[] {
  const index = new Map(days.map((d, i) => [d, i]));
  const counts = days.map(() => 0);
  for (const ts of timestamps) {
    const parsed = new Date(ts);
    if (Number.isNaN(parsed.getTime())) continue;
    const i = index.get(toDateStr(parsed));
    if (i !== undefined) counts[i]! += 1;
  }
  return counts;
}

/**
 * Local midnight on the Monday of `date`'s week.
 *
 * `(getDay() + 6) % 7` maps Sunday (0) to 6 and Monday (1) to 0, which is what
 * makes the week start on Monday rather than Sunday. Rebuilding from
 * year/month/day drops the time component without touching the instant's zone.
 */
export function startOfWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}
