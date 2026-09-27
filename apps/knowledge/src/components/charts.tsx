"use client";

import type { CodeDrill, DailyLesson, ReadingListItem, VocabWord } from "@life-client/shared";
import { todayLessonId } from "@life-client/shared";
import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, EmptyState, Eyebrow, SectionHeader } from "@/components/ui";

const AXIS_TICK = { fill: "var(--muted)", fontSize: 11, fontFamily: "var(--font-mono-retro)" };
const CURSOR_FILL = { fill: "var(--surface-2)" };
const ACTIVITY_DAYS = 30;
const PASSING_SCORE = 7;

function ChartTooltip({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border-strong bg-surface-2 px-3 py-2 text-xs shadow-lg shadow-black/30">
      <p className="font-mono font-bold text-foreground">{title}</p>
      <div className="mt-1 text-muted">{children}</div>
    </div>
  );
}

function ChartCard({
  eyebrow,
  headline,
  children,
}: {
  eyebrow: string;
  headline: ReactNode;
  children: ReactNode;
}) {
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

interface ActivityDay {
  id: string;
  label: string;
  lessons: number;
  drills: number;
  words: number;
  total: number;
}

// Timestamps are ISO strings written by the API routes; bucket them by the viewer's local day so
// a late-evening drill lands on the day the user actually did it.
function buildActivity(lessons: DailyLesson[], drills: CodeDrill[], words: VocabWord[]): ActivityDay[] {
  const days = new Map<string, ActivityDay>();
  const cursor = new Date();
  cursor.setDate(cursor.getDate() - (ACTIVITY_DAYS - 1));
  for (let i = 0; i < ACTIVITY_DAYS; i++) {
    const id = todayLessonId(cursor);
    days.set(id, {
      id,
      label: cursor.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      lessons: 0,
      drills: 0,
      words: 0,
      total: 0,
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  const tally = (createdAt: string, key: "lessons" | "drills" | "words") => {
    const day = days.get(todayLessonId(new Date(createdAt)));
    if (!day) return;
    day[key] += 1;
    day.total += 1;
  };
  lessons.forEach((l) => tally(l.createdAt, "lessons"));
  drills.forEach((d) => tally(d.createdAt, "drills"));
  words.forEach((w) => tally(w.createdAt, "words"));

  return [...days.values()];
}

function ActivityChart({ lessons, drills, words }: { lessons: DailyLesson[]; drills: CodeDrill[]; words: VocabWord[] }) {
  const activity = buildActivity(lessons, drills, words);
  const activeDays = activity.filter((d) => d.total > 0).length;

  return (
    <ChartCard eyebrow={`Last ${ACTIVITY_DAYS} days`} headline={`${activeDays} active days`}>
      {activeDays === 0 ? (
        <EmptyState className="flex h-40 items-center justify-center">
          Generate a lesson, drill, or vocab word to start your streak.
        </EmptyState>
      ) : (
        <BarChart
          responsive
          style={{ width: "100%", height: 160 }}
          data={activity}
          margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
          barCategoryGap={2}
          accessibilityLayer
        >
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="label"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            interval={6}
            minTickGap={8}
          />
          <YAxis allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} width={24} />
          <Tooltip
            cursor={CURSOR_FILL}
            isAnimationActive={false}
            content={({ active, payload }) => {
              const day = payload?.[0]?.payload as ActivityDay | undefined;
              if (!active || !day) return null;
              return (
                <ChartTooltip title={day.label}>
                  <p>{day.lessons} lesson{day.lessons === 1 ? "" : "s"}</p>
                  <p>{day.drills} drill{day.drills === 1 ? "" : "s"}</p>
                  <p>{day.words} word{day.words === 1 ? "" : "s"}</p>
                </ChartTooltip>
              );
            }}
          />
          <Bar dataKey="total" name="Items" fill="var(--primary)" radius={[4, 4, 0, 0]} />
        </BarChart>
      )}
    </ChartCard>
  );
}

interface ScorePoint {
  attempt: number;
  score: number;
  topic: string;
  date: string;
}

function DrillScoreChart({ drills }: { drills: CodeDrill[] }) {
  const points: ScorePoint[] = drills
    .filter((d): d is CodeDrill & { score: number } => d.graded === true && typeof d.score === "number")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((d, i) => ({
      attempt: i + 1,
      score: d.score,
      topic: d.topic,
      date: new Date(d.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    }));

  const recent = points.slice(-10);
  const average = recent.length ? recent.reduce((sum, p) => sum + p.score, 0) / recent.length : 0;
  // Gated on the same points.length < 2 threshold as the chart body below —
  // otherwise a single graded drill shows a headline average while the body
  // still claims there's no data yet.
  const headline =
    points.length >= 2
      ? `${average.toFixed(1)} / 10 recent avg`
      : points.length === 1
        ? "1 drill graded so far"
        : "No graded drills yet";

  return (
    <ChartCard eyebrow="Drill scores" headline={headline}>
      {points.length < 2 ? (
        <EmptyState className="flex h-40 items-center justify-center">
          Grade a couple of drills to see your trend.
        </EmptyState>
      ) : (
        <LineChart
          responsive
          style={{ width: "100%", height: 160 }}
          data={points}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          accessibilityLayer
        >
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="attempt" tick={AXIS_TICK} tickLine={false} axisLine={false} minTickGap={16} />
          <YAxis
            domain={[0, 10]}
            ticks={[0, 5, 10]}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={24}
          />
          <ReferenceLine
            y={PASSING_SCORE}
            stroke="var(--border-strong)"
            strokeDasharray="4 4"
            label={{ value: "pass", position: "insideTopRight", ...AXIS_TICK }}
          />
          <Tooltip
            cursor={{ stroke: "var(--border-strong)" }}
            isAnimationActive={false}
            content={({ active, payload }) => {
              const point = payload?.[0]?.payload as ScorePoint | undefined;
              if (!active || !point) return null;
              return (
                <ChartTooltip title={`${point.score}/10`}>
                  <p>{point.topic}</p>
                  <p>{point.date}</p>
                </ChartTooltip>
              );
            }}
          />
          <Line
            type="monotone"
            dataKey="score"
            name="Score"
            stroke="var(--primary)"
            strokeWidth={2}
            dot={{ r: 4, fill: "var(--primary)", stroke: "var(--surface)", strokeWidth: 2 }}
            activeDot={{ r: 6, fill: "var(--primary)", stroke: "var(--surface)", strokeWidth: 2 }}
          />
        </LineChart>
      )}
    </ChartCard>
  );
}

const READING_STATUSES: { id: ReadingListItem["status"]; label: string }[] = [
  { id: "pending", label: "Pending" },
  { id: "summarized", label: "Summarized" },
  { id: "read", label: "Read" },
  { id: "error", label: "Failed" },
];

function ReadingStatusChart({ items }: { items: ReadingListItem[] }) {
  const counts = new Map<ReadingListItem["status"], number>();
  for (const item of items) counts.set(item.status, (counts.get(item.status) ?? 0) + 1);
  const rows = READING_STATUSES.map((s) => ({ label: s.label, count: counts.get(s.id) ?? 0 })).filter(
    (row) => row.label !== "Failed" || row.count > 0,
  );
  const read = rows.find((r) => r.label === "Read")?.count ?? 0;

  return (
    <ChartCard eyebrow="Reading list" headline={items.length ? `${read} of ${items.length} read` : "Nothing saved yet"}>
      {items.length === 0 ? (
        <EmptyState className="flex h-40 items-center justify-center">Add a link to start tracking.</EmptyState>
      ) : (
        <BarChart
          responsive
          style={{ width: "100%", height: 160 }}
          data={rows}
          layout="vertical"
          margin={{ top: 0, right: 28, bottom: 0, left: 0 }}
          barCategoryGap={8}
          accessibilityLayer
        >
          <XAxis type="number" hide allowDecimals={false} />
          <YAxis
            type="category"
            dataKey="label"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={84}
          />
          <Tooltip
            cursor={CURSOR_FILL}
            isAnimationActive={false}
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as (typeof rows)[number] | undefined;
              if (!active || !row) return null;
              return (
                <ChartTooltip title={row.label}>
                  <p>
                    {row.count} item{row.count === 1 ? "" : "s"}
                  </p>
                </ChartTooltip>
              );
            }}
          />
          <Bar dataKey="count" name="Items" fill="var(--primary)" radius={[0, 4, 4, 0]} minPointSize={2}>
            <LabelList dataKey="count" position="right" fill="var(--foreground)" fontSize={11} />
          </Bar>
        </BarChart>
      )}
    </ChartCard>
  );
}

export function ProgressCharts({
  lessons,
  drills,
  words,
  readingItems,
}: {
  lessons: DailyLesson[];
  drills: CodeDrill[];
  words: VocabWord[];
  readingItems: ReadingListItem[];
}) {
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader eyebrow="Progress" title="Your Learning" />
      <ActivityChart lessons={lessons} drills={drills} words={words} />
      <div className="grid gap-3 md:grid-cols-2">
        <DrillScoreChart drills={drills} />
        <ReadingStatusChart items={readingItems} />
      </div>
    </section>
  );
}
