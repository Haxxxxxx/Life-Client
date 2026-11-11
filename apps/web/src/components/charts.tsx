"use client";

import {
  TRANSACTION_CATEGORIES,
  countPerDay,
  goalStatusCounts,
  lastNDays,
  monthKey,
  monthlyMoneyTrend,
  taskCompletedIso,
  type Goal,
  type GoalStatus,
  type SportActivity,
  type Task,
  type Transaction,
  type TransactionCategory,
} from "@life-client/shared";
import { useMemo, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Pie, PieChart, Tooltip, XAxis, YAxis } from "recharts";
import { Card, EmptyState, Eyebrow } from "@/components/ui";

const AXIS_TICK = { fill: "var(--muted)", fontSize: 11, fontFamily: "var(--font-mono-retro)" };
const CURSOR_FILL = { fill: "var(--surface-2)" };
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// One accent color: series are told apart by how much of it they carry. Mixed
// against the card surface (not transparency) so overlapping tooltip cursors
// and slice gaps don't bleed through.
function tint(percent: number, color = "var(--primary)"): string {
  return `color-mix(in srgb, ${color} ${percent}%, var(--surface))`;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function ChartTooltip({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border-strong bg-surface-2 px-3 py-2 text-xs shadow-lg shadow-black/30">
      <p className="font-mono font-bold text-foreground">{title}</p>
      <div className="mt-1 text-muted">{children}</div>
    </div>
  );
}

function ChartCard({ eyebrow, headline, children }: { eyebrow: string; headline: ReactNode; children: ReactNode }) {
  return (
    <Card className="flex min-w-0 flex-col gap-3">
      <div>
        <Eyebrow>{eyebrow}</Eyebrow>
        <p className="mt-0.5 text-lg font-bold tracking-tight text-foreground">{headline}</p>
      </div>
      {children}
    </Card>
  );
}

interface LegendItem {
  label: string;
  color: string;
  value?: string;
}

function Legend({ items, vertical = false }: { items: LegendItem[]; vertical?: boolean }) {
  return (
    <ul className={vertical ? "flex w-full min-w-0 flex-1 flex-col gap-1.5" : "flex flex-wrap gap-x-4 gap-y-1"}>
      {items.map((item) => (
        <li key={item.label} className="flex min-w-0 items-center gap-2 text-xs text-muted">
          <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: item.color }} />
          <span className={vertical ? "min-w-0 flex-1 truncate" : undefined}>{item.label}</span>
          {item.value !== undefined && <span className="font-mono text-foreground">{item.value}</span>}
        </li>
      ))}
    </ul>
  );
}

interface DonutSlice {
  label: string;
  value: number;
  fill: string;
}

function Donut({
  slices,
  centerValue,
  centerCaption,
  formatValue,
}: {
  slices: DonutSlice[];
  centerValue: string;
  centerCaption: string;
  formatValue: (value: number) => string;
}) {
  const visible = slices.filter((s) => s.value > 0);
  return (
    <div className="relative h-36 w-36 shrink-0">
      <PieChart width={144} height={144} accessibilityLayer>
        <Pie
          data={visible}
          dataKey="value"
          nameKey="label"
          innerRadius={50}
          outerRadius={70}
          startAngle={90}
          endAngle={-270}
          paddingAngle={visible.length > 1 ? 2 : 0}
          stroke="var(--surface)"
          strokeWidth={2}
          isAnimationActive={false}
        />
        <Tooltip
          isAnimationActive={false}
          content={({ active, payload }) => {
            const slice = payload?.[0]?.payload as DonutSlice | undefined;
            if (!active || !slice) return null;
            return (
              <ChartTooltip title={slice.label}>
                <p>{formatValue(slice.value)}</p>
              </ChartTooltip>
            );
          }}
        />
      </PieChart>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <p className="text-base font-bold text-foreground">{centerValue}</p>
        <p className="font-mono text-micro text-muted uppercase">{centerCaption}</p>
      </div>
    </div>
  );
}



function parseLocalDay(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
}

function completedTimestamps(tasks: Task[]): string[] {
  return tasks
    .filter((t) => t.status === "done")
    .map(taskCompletedIso)
    .filter((iso): iso is string => iso !== null);
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

const CATEGORY_LABEL = Object.fromEntries(TRANSACTION_CATEGORIES.map((c) => [c.id, c.label])) as Record<
  TransactionCategory,
  string
>;
const DONUT_TINTS = [100, 72, 50, 34, 22];
const TREND_MONTHS = 6;

const moneyShort = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const moneyCompact = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

interface MonthRow {
  key: string;
  label: string;
  income: number;
  spend: number;
}

// Transaction.date is a plain YYYY-MM-DD string, so month bucketing slices the
// string instead of going through `new Date`, which would parse it as UTC
// midnight and shift first-of-month entries into the previous month west of UTC.
function buildMoneyCharts(transactions: Transaction[]) {
  const thisMonth = monthKey();
  const byCategory = new Map<TransactionCategory, number>();
  // Shared with mobile so the two cannot drift — mobile used to render this
  // trend whenever any transaction existed, however old, producing six
  // invisible bars and a "Net +$0" summary.
  const { rows: trend, net, hasTrend } = monthlyMoneyTrend(transactions, TREND_MONTHS);

  for (const t of transactions) {
    const month = t.date.slice(0, 7);
    if (t.type === "expense" && month === thisMonth) {
      byCategory.set(t.category, (byCategory.get(t.category) ?? 0) + t.amount);
    }
  }

  const ranked = [...byCategory]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
  // The real "other" category always folds into the tail bucket so it can't
  // collide with the rolled-up "Other" slice.
  const named = ranked.filter((c) => c.category !== "other");
  const top = named.slice(0, DONUT_TINTS.length - 1);
  const rest = [...named.slice(DONUT_TINTS.length - 1), ...ranked.filter((c) => c.category === "other")];
  const slices: DonutSlice[] = top.map((c, i) => ({
    label: CATEGORY_LABEL[c.category],
    value: c.amount,
    fill: tint(DONUT_TINTS[i]!),
  }));
  if (rest.length > 0) {
    slices.push({
      label: rest.length === 1 ? CATEGORY_LABEL[rest[0]!.category] : CATEGORY_LABEL.other,
      value: rest.reduce((sum, c) => sum + c.amount, 0),
      fill: tint(DONUT_TINTS[DONUT_TINTS.length - 1]!),
    });
  }

  return {
    slices,
    monthTotal: ranked.reduce((sum, c) => sum + c.amount, 0),
    trend,
    net,
    hasTrend,
  };
}

export function MoneyCharts({ transactions }: { transactions: Transaction[] }) {
  const { slices, monthTotal, trend, net, hasTrend } = useMemo(() => buildMoneyCharts(transactions), [transactions]);
  const incomeColor = "var(--primary)";
  const spendColor = tint(55, "var(--muted)");

  return (
    <section className="flex flex-col gap-3">
      <ChartCard eyebrow="Spending by category" headline={monthTotal > 0 ? "This month" : "Nothing spent yet"}>
        {monthTotal > 0 ? (
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <Donut
              slices={slices}
              centerValue={moneyShort.format(monthTotal)}
              centerCaption="spent"
              formatValue={(v) => moneyShort.format(v)}
            />
            <Legend
              vertical
              items={slices.map((s) => ({
                label: s.label,
                color: s.fill,
                value: `${moneyShort.format(s.value)} · ${Math.round((s.value / monthTotal) * 100)}%`,
              }))}
            />
          </div>
        ) : (
          <EmptyState>No expenses logged this month yet.</EmptyState>
        )}
      </ChartCard>

      <ChartCard
        eyebrow={`Last ${TREND_MONTHS} months`}
        headline={hasTrend ? `Net ${net >= 0 ? "+" : "−"}${moneyShort.format(Math.abs(net))}` : "No activity yet"}
      >
        {hasTrend ? (
          <>
            <BarChart
              responsive
              style={{ width: "100%", height: 160 }}
              data={trend}
              margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
              barGap={2}
              barCategoryGap="24%"
              accessibilityLayer
            >
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} />
              <YAxis
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
                width={48}
                tickFormatter={(v: number) => moneyCompact.format(v)}
              />
              <Tooltip
                cursor={CURSOR_FILL}
                isAnimationActive={false}
                content={({ active, payload }) => {
                  const row = payload?.[0]?.payload as MonthRow | undefined;
                  if (!active || !row) return null;
                  return (
                    <ChartTooltip title={row.label}>
                      <p>Income {moneyShort.format(row.income)}</p>
                      <p>Spend {moneyShort.format(row.spend)}</p>
                    </ChartTooltip>
                  );
                }}
              />
              <Bar dataKey="income" name="Income" fill={incomeColor} radius={[4, 4, 0, 0]} />
              <Bar dataKey="spend" name="Spend" fill={spendColor} radius={[4, 4, 0, 0]} />
            </BarChart>
            <Legend
              items={[
                { label: "Income", color: incomeColor },
                { label: "Spend", color: spendColor },
              ]}
            />
          </>
        ) : (
          <EmptyState>No transactions in the last {TREND_MONTHS} months.</EmptyState>
        )}
      </ChartCard>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Sports
// ---------------------------------------------------------------------------

const TREND_WEEKS = 12;

interface WeekRow {
  start: Date;
  label: string;
  endurance: number;
  strength: number;
}

function startOfWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

function buildWeeklySessions(activities: SportActivity[], truncated: boolean): WeekRow[] {
  const firstStart = startOfWeek(new Date());
  firstStart.setDate(firstStart.getDate() - 7 * (TREND_WEEKS - 1));
  const rows: WeekRow[] = Array.from({ length: TREND_WEEKS }, (_, i) => {
    const start = new Date(firstStart.getFullYear(), firstStart.getMonth(), firstStart.getDate() + 7 * i);
    return {
      start,
      label: start.toLocaleDateString(undefined, { month: "numeric", day: "numeric" }),
      endurance: 0,
      strength: 0,
    };
  });
  for (const activity of activities) {
    const d = new Date(activity.startDate);
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    // Rounded because DST shifts make a local-midnight difference an hour off a whole number of days.
    const row = rows[Math.floor(Math.round((day.getTime() - firstStart.getTime()) / MS_PER_DAY) / 7)];
    if (row) row[activity.kind] += 1;
  }
  if (!truncated || activities.length === 0) return rows;
  // The listener is capped (newest first), so weeks at or before the oldest
  // loaded activity may be missing sessions — drop them rather than chart a
  // false dip. Always keep the current week.
  const oldestWeek = startOfWeek(new Date(activities[activities.length - 1]!.startDate)).getTime();
  const complete = rows.filter((r) => r.start.getTime() > oldestWeek);
  return complete.length > 0 ? complete : rows.slice(-1);
}

export function WeeklySessionsChart({ activities, limit }: { activities: SportActivity[]; limit: number }) {
  const weeks = useMemo(() => buildWeeklySessions(activities, activities.length >= limit), [activities, limit]);
  const thisWeek = weeks[weeks.length - 1]!;
  const enduranceColor = "var(--primary)";
  const strengthColor = tint(45);

  return (
    <ChartCard
      eyebrow={`Sessions · last ${weeks.length} week${weeks.length === 1 ? "" : "s"}`}
      headline={`${plural(thisWeek.endurance + thisWeek.strength, "session")} this week`}
    >
      <BarChart
        responsive
        style={{ width: "100%", height: 140 }}
        data={weeks}
        margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
        barCategoryGap="20%"
        accessibilityLayer
      >
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} interval={2} minTickGap={8} />
        <YAxis allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} width={24} />
        <Tooltip
          cursor={CURSOR_FILL}
          isAnimationActive={false}
          content={({ active, payload }) => {
            const week = payload?.[0]?.payload as WeekRow | undefined;
            if (!active || !week) return null;
            return (
              <ChartTooltip
                title={`Week of ${week.start.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}
              >
                <p>{week.endurance} endurance</p>
                <p>{week.strength} strength</p>
              </ChartTooltip>
            );
          }}
        />
        <Bar dataKey="endurance" name="Endurance" stackId="sessions" fill={enduranceColor} />
        <Bar dataKey="strength" name="Strength" stackId="sessions" fill={strengthColor} radius={[4, 4, 0, 0]} />
      </BarChart>
      <Legend
        items={[
          { label: "Endurance", color: enduranceColor },
          { label: "Strength", color: strengthColor },
        ]}
      />
    </ChartCard>
  );
}

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

const GOAL_STATUS_SLICES: { status: GoalStatus; label: string; fill: string }[] = [
  { status: "active", label: "Active", fill: "var(--primary)" },
  { status: "completed", label: "Completed", fill: tint(50) },
  { status: "archived", label: "Archived", fill: tint(35, "var(--muted)") },
];

export function GoalStatusChart({ goals }: { goals: Goal[] }) {
  const counts = useMemo(() => goalStatusCounts(goals), [goals]);
  const slices = useMemo(
    () => GOAL_STATUS_SLICES.map((s) => ({ label: s.label, value: counts[s.status], fill: s.fill })),
    [counts],
  );

  return (
    // "of decided", not "of every goal". Archived goals were dropped rather
    // than missed, so counting them as failures punishes tidying up — and web
    // used to do exactly that while mobile did not, so the same data read
    // differently depending on which device you picked up.
    <ChartCard
      eyebrow="All goals"
      headline={`${counts.completed} of ${counts.decided} completed`}
    >
      <div className="flex flex-col items-center gap-4 sm:flex-row">
        <Donut slices={slices} centerValue={String(goals.length)} centerCaption="goals" formatValue={(v) => plural(v, "goal")} />
        <Legend vertical items={slices.map((s) => ({ label: s.label, color: s.fill, value: String(s.value) }))} />
      </div>
    </ChartCard>
  );
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

const COMPLETED_DAYS = 30;

interface DayRow {
  day: string;
  label: string;
  count: number;
}

export function TasksCompletedChart({ tasks }: { tasks: Task[] }) {
  const { rows, total } = useMemo(() => {
    const days = lastNDays(COMPLETED_DAYS);
    const counts = countPerDay(completedTimestamps(tasks), days);
    return {
      rows: days.map<DayRow>((day, i) => ({
        day,
        label: parseLocalDay(day).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        count: counts[i]!,
      })),
      total: counts.reduce((a, b) => a + b, 0),
    };
  }, [tasks]);

  return (
    <ChartCard eyebrow={`Completed · last ${COMPLETED_DAYS} days`} headline={`${plural(total, "task")} done`}>
      {total === 0 ? (
        <EmptyState className="flex h-32 items-center justify-center">
          Tasks you mark done will show up here.
        </EmptyState>
      ) : (
        <BarChart
          responsive
          style={{ width: "100%", height: 128 }}
          data={rows}
          margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
          barCategoryGap={2}
          accessibilityLayer
        >
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} interval={6} minTickGap={8} />
          <YAxis allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} width={24} />
          <Tooltip
            cursor={CURSOR_FILL}
            isAnimationActive={false}
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as DayRow | undefined;
              if (!active || !row) return null;
              return (
                <ChartTooltip title={row.label}>
                  <p>{plural(row.count, "task")} done</p>
                </ChartTooltip>
              );
            }}
          />
          <Bar dataKey="count" name="Done" fill="var(--primary)" radius={[4, 4, 0, 0]} />
        </BarChart>
      )}
    </ChartCard>
  );
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

interface WeekDayRow {
  label: string;
  fullLabel: string;
  tasks: number;
  sessions: number;
}

/** Rolls up two already-subscribed streams into one "did I show up this week" view; renders nothing on an empty week. */
export function WeekActivityChart({ tasks, activities }: { tasks: Task[]; activities: SportActivity[] }) {
  const { rows, total, activeDays } = useMemo(() => {
    const days = lastNDays(7);
    const taskCounts = countPerDay(completedTimestamps(tasks), days);
    const sessionCounts = countPerDay(
      activities.map((a) => a.startDate),
      days,
    );
    const rows = days.map<WeekDayRow>((day, i) => {
      const date = parseLocalDay(day);
      return {
        label: date.toLocaleDateString(undefined, { weekday: "short" }),
        fullLabel: date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }),
        tasks: taskCounts[i]!,
        sessions: sessionCounts[i]!,
      };
    });
    return {
      rows,
      total: rows.reduce((sum, r) => sum + r.tasks + r.sessions, 0),
      activeDays: rows.filter((r) => r.tasks + r.sessions > 0).length,
    };
  }, [tasks, activities]);
  const taskColor = "var(--primary)";
  const sessionColor = tint(45);

  if (total === 0) return null;

  return (
    <ChartCard eyebrow="This week" headline={`${activeDays}/7 active days`}>
      <BarChart
        responsive
        style={{ width: "100%", height: 120 }}
        data={rows}
        margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
        barCategoryGap="28%"
        accessibilityLayer
      >
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} />
        <YAxis allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} width={24} />
        <Tooltip
          cursor={CURSOR_FILL}
          isAnimationActive={false}
          content={({ active, payload }) => {
            const row = payload?.[0]?.payload as WeekDayRow | undefined;
            if (!active || !row) return null;
            return (
              <ChartTooltip title={row.fullLabel}>
                <p>{plural(row.tasks, "task")} done</p>
                <p>{plural(row.sessions, "sport session")}</p>
              </ChartTooltip>
            );
          }}
        />
        <Bar dataKey="tasks" name="Tasks done" stackId="week" fill={taskColor} />
        <Bar dataKey="sessions" name="Sport sessions" stackId="week" fill={sessionColor} radius={[4, 4, 0, 0]} />
      </BarChart>
      <Legend
        items={[
          { label: "Tasks done", color: taskColor },
          { label: "Sport sessions", color: sessionColor },
        ]}
      />
    </ChartCard>
  );
}
