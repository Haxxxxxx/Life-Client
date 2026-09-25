"use client";

import {
  WEEKDAY_LABELS,
  type CalendarEvent,
  type Challenge,
  type CodeDrill,
  type DailyLesson,
  type DevActivitySummary,
  type Goal,
  type ReadingListItem,
  type Recurrence,
  type RecurrenceFreq,
  type Reminder,
  type ReminderUrgency,
  type SportActivity,
  type SpotifySummary,
  type Task,
  type VocabWord,
  computeChallengeProgress,
  computeGoalProgress,
  computeInsightXp,
  daysUntil,
  deleteReminderEverywhere,
  describeRecurrence,
  levelFromXp,
  nextOccurrenceDate,
  reminderUrgency,
  syncReminderToCalendar,
  todayLessonId,
  visibleTasks,
} from "@life-client/shared";
import { data } from "@life-client/shared";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, CardExternalLink, CardLink, ErrorText, Eyebrow, Input, PageHeader, SectionHeader } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import { webApiClient } from "@/lib/webApiClient";

// Knowledge lives in its own deployable app (apps/knowledge) — same link-out as the sidebar nav.
const KNOWLEDGE_APP_URL = process.env.NEXT_PUBLIC_KNOWLEDGE_APP_URL;

function Card({ title, href, children }: { title: string; href: string; children: React.ReactNode }) {
  return (
    <CardLink href={href} className="flex flex-col gap-3">
      <Eyebrow>{title}</Eyebrow>
      {children}
    </CardLink>
  );
}

function ExternalCard({ title, href, children }: { title: string; href: string; children: React.ReactNode }) {
  return (
    <CardExternalLink href={href} className="flex flex-col gap-3">
      <Eyebrow>{title}</Eyebrow>
      {children}
    </CardExternalLink>
  );
}

function RenameField({
  value,
  onSave,
  className,
}: {
  value: string;
  onSave: (next: string) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        className={`text-left hover:underline ${className ?? ""}`}
      >
        {value}
      </button>
    );
  }

  function commit() {
    if (draft.trim() && draft.trim() !== value) onSave(draft.trim());
    setEditing(false);
  }

  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setEditing(false);
      }}
      className={`rounded border border-border-strong bg-background px-1.5 py-0.5 text-sm ${className ?? ""}`}
    />
  );
}

function TasksSection({ tasks, uid }: { tasks: Task[]; uid: string }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulkMarkDone() {
    if (!db) return;
    await Promise.all(
      [...selected].map((id) => {
        const task = tasks.find((t) => t.id === id);
        return task ? data.advanceTaskStatus(uid, task, "done") : undefined;
      }),
    );
    setSelected(new Set());
  }

  async function bulkDelete() {
    if (!db) return;
    await Promise.all([...selected].map((id) => data.deleteTask(uid, id)));
    setSelected(new Set());
  }

  async function clearCompleted() {
    if (!db) return;
    const done = tasks.filter((t) => t.status === "done");
    await Promise.all(done.map((t) => data.deleteTask(uid, t.id)));
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <SectionHeader eyebrow="Today" title="Tasks" />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={clearCompleted}
            className="rounded-xl border border-border-strong px-2.5 py-1 font-mono text-xs font-bold uppercase hover:bg-primary/10"
          >
            Clear completed
          </button>
          <Link
            href="/tasks"
            className="rounded-xl px-2.5 py-1 font-mono text-xs font-bold text-primary uppercase hover:underline"
          >
            Open Tasks →
          </Link>
        </div>
      </div>
      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-primary bg-primary/10 px-3 py-2">
          <span className="font-mono text-xs font-bold">{selected.size} selected</span>
          <button type="button" onClick={bulkMarkDone} className="font-mono text-xs font-bold text-primary uppercase hover:underline">
            Mark done
          </button>
          <button type="button" onClick={bulkDelete} className="font-mono text-xs font-bold text-danger uppercase hover:underline">
            Delete selected
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="ml-auto font-mono text-xs font-bold text-muted uppercase hover:underline"
          >
            Clear
          </button>
        </div>
      )}
      <ul className="flex flex-col gap-1">
        {tasks.map((task) => (
          <li key={task.id} className="flex items-center gap-2 rounded-xl border border-border-strong bg-surface px-3 py-2">
            <input type="checkbox" checked={selected.has(task.id)} onChange={() => toggle(task.id)} />
            <RenameField
              value={task.title}
              onSave={(next) => db && data.updateTask(uid, task.id, { title: next })}
              className={`min-w-0 flex-1 truncate text-sm ${task.status === "done" ? "text-muted line-through" : ""}`}
            />
            <span className="shrink-0 font-mono text-[10px] text-muted uppercase">{task.status}</span>
            {task.sourceUrl && (
              <a
                href={task.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 font-mono text-xs font-bold text-primary uppercase hover:underline"
              >
                {task.source === "gitlab" ? "GitLab" : "GitHub"} ↗
              </a>
            )}
            <button
              type="button"
              onClick={() => db && data.deleteTask(uid, task.id)}
              className="shrink-0 font-mono text-xs font-bold text-danger uppercase hover:underline"
            >
              Delete
            </button>
          </li>
        ))}
        {tasks.length === 0 && <li className="px-3 py-4 text-center text-sm text-muted">No tasks.</li>}
      </ul>
    </div>
  );
}

function GoalsSection({ goals, tasks, uid }: { goals: Goal[]; tasks: Task[]; uid: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <SectionHeader eyebrow="Long-term" title="Goals" />
        <Link href="/goals" className="font-mono text-xs font-bold text-primary uppercase hover:underline">
          Open Goals →
        </Link>
      </div>
      <ul className="flex flex-col gap-1">
        {goals.map((goal) => {
          const progress = computeGoalProgress(goal, tasks);
          return (
            <li key={goal.id} className="flex items-center gap-2 rounded-xl border border-border-strong bg-surface px-3 py-2">
              <RenameField
                value={goal.title}
                onSave={(next) => db && data.updateGoal(uid, goal.id, { title: next })}
                className="min-w-0 flex-1 truncate text-sm"
              />
              <span className="shrink-0 font-mono text-[10px] text-muted uppercase">
                {progress.completedTaskCount}/{progress.linkedTaskCount} · {goal.status}
              </span>
              {goal.status === "active" && (
                <button
                  type="button"
                  onClick={() => db && data.setGoalStatus(uid, goal.id, "completed")}
                  className="shrink-0 font-mono text-xs font-bold text-primary uppercase hover:underline"
                >
                  Complete
                </button>
              )}
              <button
                type="button"
                onClick={() => db && data.setGoalStatus(uid, goal.id, "archived")}
                className="shrink-0 font-mono text-xs font-bold text-muted uppercase hover:underline"
              >
                Archive
              </button>
              <button
                type="button"
                onClick={() => db && data.deleteGoal(uid, goal.id)}
                className="shrink-0 font-mono text-xs font-bold text-danger uppercase hover:underline"
              >
                Delete
              </button>
            </li>
          );
        })}
        {goals.length === 0 && <li className="px-3 py-4 text-center text-sm text-muted">No goals yet.</li>}
      </ul>
    </div>
  );
}

function ChallengesSection({ challenges, activities, uid }: { challenges: Challenge[]; activities: SportActivity[]; uid: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <SectionHeader eyebrow="Streaks" title="Challenges" />
        <Link href="/sports" className="font-mono text-xs font-bold text-primary uppercase hover:underline">
          Open Sports →
        </Link>
      </div>
      <ul className="flex flex-col gap-1">
        {challenges.map((challenge) => {
          const progress = computeChallengeProgress(challenge, activities);
          return (
            <li key={challenge.id} className="flex items-center gap-2 rounded-xl border border-border-strong bg-surface px-3 py-2">
              <RenameField
                value={challenge.title}
                onSave={(next) => db && data.updateChallenge(uid, challenge.id, { title: next })}
                className="min-w-0 flex-1 truncate text-sm"
              />
              <span className="shrink-0 font-mono text-[10px] text-muted uppercase">
                {progress.currentStreak}d streak{challenge.archived ? " · archived" : ""}
              </span>
              {!challenge.archived && (
                <button
                  type="button"
                  onClick={() => db && data.archiveChallenge(uid, challenge.id)}
                  className="shrink-0 font-mono text-xs font-bold text-muted uppercase hover:underline"
                >
                  Archive
                </button>
              )}
              <button
                type="button"
                onClick={() => db && data.deleteChallenge(uid, challenge.id)}
                className="shrink-0 font-mono text-xs font-bold text-danger uppercase hover:underline"
              >
                Delete
              </button>
            </li>
          );
        })}
        {challenges.length === 0 && <li className="px-3 py-4 text-center text-sm text-muted">No challenges yet.</li>}
      </ul>
    </div>
  );
}

const URGENCY_STYLE: Record<ReminderUrgency, string> = {
  overdue: "border-danger bg-danger/10",
  "due-today": "border-primary bg-primary/10",
  "due-soon": "border-primary bg-primary/5",
  upcoming: "border-border-strong bg-surface",
};

function urgencyLabel(urgency: ReminderUrgency, days: number): string {
  if (urgency === "overdue") return `Overdue by ${Math.abs(days)}d`;
  if (urgency === "due-today") return "Due today";
  if (urgency === "due-soon") return `Due in ${days}d`;
  return `In ${days}d`;
}

function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function RecurrencePicker({
  value,
  onChange,
}: {
  value: Recurrence | undefined;
  onChange: (next: Recurrence | undefined) => void;
}) {
  const freq = value?.freq;
  const interval = value?.interval ?? 1;
  const daysOfWeek = value?.daysOfWeek ?? [];

  function setFreq(next: RecurrenceFreq | undefined) {
    if (!next) {
      onChange(undefined);
      return;
    }
    onChange({ freq: next, interval, daysOfWeek: next === "weekly" ? daysOfWeek : undefined });
  }

  function toggleDay(day: number) {
    const next = daysOfWeek.includes(day) ? daysOfWeek.filter((d) => d !== day) : [...daysOfWeek, day];
    onChange({ freq: "weekly", interval, daysOfWeek: next });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {(["none", "daily", "weekly", "monthly"] as const).map((f) => (
        <button
          key={f}
          type="button"
          onClick={() => setFreq(f === "none" ? undefined : f)}
          className={`rounded-full border px-2.5 py-1 text-xs capitalize ${
            (f === "none" && !freq) || f === freq ? "border-border-strong bg-primary/15" : "border-border text-muted"
          }`}
        >
          {f === "none" ? "No repeat" : f}
        </button>
      ))}
      {freq && (
        <label className="flex items-center gap-1 text-xs text-muted">
          every
          <input
            type="number"
            min={1}
            value={interval}
            onChange={(e) => onChange({ freq, interval: Number(e.target.value) || 1, daysOfWeek: value?.daysOfWeek })}
            className="w-12 rounded-xl border border-border-strong bg-background px-1 py-0.5 text-xs"
          />
          {freq === "daily" ? "day(s)" : freq === "weekly" ? "week(s)" : "month(s)"}
        </label>
      )}
      {freq === "weekly" && (
        <div className="flex gap-1">
          {WEEKDAY_LABELS.map((label, i) => (
            <button
              key={i}
              type="button"
              onClick={() => toggleDay(i)}
              className={`rounded-full border px-1.5 py-1 text-[10px] font-bold ${
                daysOfWeek.includes(i) ? "border-border-strong bg-primary text-primary-foreground" : "border-border text-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function EditReminderForm({
  reminder,
  onSave,
  onCancel,
}: {
  reminder: Reminder;
  onSave: (patch: { title: string; note?: string; deadline: string; recurrence?: Recurrence }) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(reminder.title);
  const [note, setNote] = useState(reminder.note ?? "");
  const [deadline, setDeadline] = useState(toDatetimeLocalValue(new Date(reminder.deadline)));
  const [recurrence, setRecurrence] = useState<Recurrence | undefined>(reminder.recurrence);

  return (
    <div className="flex flex-1 flex-col gap-2">
      <Input size="sm" value={title} onChange={(e) => setTitle(e.target.value)} />
      <Input size="sm" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Notes" />
      <Input size="sm" type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
      <RecurrencePicker value={recurrence} onChange={setRecurrence} />
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() =>
            onSave({
              title: title.trim() || reminder.title,
              note: note.trim() || undefined,
              deadline: new Date(deadline).toISOString(),
              recurrence,
            })
          }
          className="font-mono text-xs font-bold text-primary uppercase hover:underline"
        >
          Save
        </button>
        <button type="button" onClick={onCancel} className="font-mono text-xs font-bold text-muted uppercase hover:underline">
          Cancel
        </button>
      </div>
    </div>
  );
}

function RemindersSection({ reminders, uid }: { reminders: Reminder[]; uid: string }) {
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [deadline, setDeadline] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return toDatetimeLocalValue(tomorrow);
  });
  const [recurrence, setRecurrence] = useState<Recurrence | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!db || !title.trim() || !deadline) return;
    setSubmitting(true);
    setError(null);
    try {
      const reminderId = await data.createReminder(uid, {
        title: title.trim(),
        note: note.trim() || undefined,
        deadline: new Date(deadline).toISOString(),
        recurrence,
      });
      setTitle("");
      setNote("");
      setRecurrence(undefined);
      setFormOpen(false);
      syncReminderToCalendar(webApiClient, reminderId).catch((err) =>
        console.error("Could not sync reminder to Google Calendar", err),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create reminder");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(reminder: Reminder) {
    try {
      if (db && reminder.recurrence) {
        await data.createReminder(uid, {
          title: reminder.title,
          note: reminder.note,
          deadline: nextOccurrenceDate(reminder.deadline, reminder.recurrence),
          recurrence: reminder.recurrence,
        });
      }
      await deleteReminderEverywhere(webApiClient, reminder.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete reminder");
    }
  }

  async function handleSaveEdit(
    reminderId: string,
    patch: { title: string; note?: string; deadline: string; recurrence?: Recurrence },
  ) {
    if (!db) return;
    try {
      await data.updateReminder(uid, reminderId, patch);
      setEditingId(null);
      syncReminderToCalendar(webApiClient, reminderId).catch((err) =>
        console.error("Could not sync reminder to Google Calendar", err),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update reminder");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <SectionHeader eyebrow="Deadlines" title="Remember" />
        {!formOpen && (
          <Button size="sm" onClick={() => setFormOpen(true)}>
            New reminder
          </Button>
        )}
      </div>

      {formOpen && (
        <form onSubmit={handleAdd} className="flex flex-col gap-2 rounded-xl border border-border-strong bg-surface p-4">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What do you need to remember?" />
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Notes (e.g. account it's linked to)"
          />
          <div className="flex gap-2">
            <Input
              type="datetime-local"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="min-w-0 flex-1"
            />
          </div>
          <RecurrencePicker value={recurrence} onChange={setRecurrence} />
          <div className="flex gap-2">
            <Button type="submit" disabled={submitting || !title.trim() || !deadline}>
              Add
            </Button>
            <Button type="button" variant="ghost" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      <ErrorText>{error}</ErrorText>

      <ul className="flex flex-col gap-2">
        {reminders.map((reminder) => {
          const urgency = reminderUrgency(reminder.deadline);
          const days = daysUntil(reminder.deadline);
          return (
            <li
              key={reminder.id}
              className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${URGENCY_STYLE[urgency]}`}
            >
              {editingId === reminder.id ? (
                <EditReminderForm
                  reminder={reminder}
                  onSave={(patch) => handleSaveEdit(reminder.id, patch)}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <>
                  <button type="button" onClick={() => setEditingId(reminder.id)} className="min-w-0 flex-1 text-left">
                    <p className="truncate text-sm font-bold hover:underline">{reminder.title}</p>
                    {reminder.note && <p className="truncate text-xs text-muted">{reminder.note}</p>}
                    <p className="font-mono text-xs tracking-wide text-muted uppercase">
                      {new Date(reminder.deadline).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                      {reminder.recurrence && ` · ↻ ${describeRecurrence(reminder.recurrence)}`}
                    </p>
                  </button>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="rounded-full border border-border-strong bg-primary/15 px-2.5 py-1 font-mono text-xs font-bold">
                      {urgencyLabel(urgency, days)}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDelete(reminder)}
                      className="rounded-xl px-3 py-1.5 font-mono text-xs font-bold text-danger uppercase hover:bg-danger/10"
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}
            </li>
          );
        })}
        {reminders.length === 0 && !formOpen && (
          <li className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
            Nothing to remember yet — add your first deadline above.
          </li>
        )}
      </ul>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [activities, setActivities] = useState<SportActivity[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [github, setGithub] = useState<DevActivitySummary | null>(null);
  const [gitlab, setGitlab] = useState<DevActivitySummary | null>(null);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [spotify, setSpotify] = useState<SpotifySummary | null>(null);
  const [lessons, setLessons] = useState<DailyLesson[]>([]);
  const [drills, setDrills] = useState<CodeDrill[]>([]);
  const [vocabWords, setVocabWords] = useState<VocabWord[]>([]);
  const [readingItems, setReadingItems] = useState<ReadingListItem[]>([]);

  useEffect(() => {
    if (!user) return;
    const unsubs = [
      data.subscribeTasks(user.uid, setTasks),
      data.subscribeGoals(user.uid, setGoals),
      data.subscribeChallenges(user.uid, setChallenges),
      data.subscribeSportActivities(user.uid, setActivities),
      data.subscribeCalendarEvents(user.uid, setEvents, undefined, 3),
      data.subscribeDevActivity(user.uid, "github", setGithub),
      data.subscribeDevActivity(user.uid, "gitlab", setGitlab),
      data.subscribeReminders(user.uid, setReminders),
      data.subscribeSpotifySummary(user.uid, setSpotify),
      data.subscribeDailyLessons(user.uid, setLessons),
      data.subscribeCodeDrills(user.uid, setDrills),
      data.subscribeVocabWords(user.uid, setVocabWords),
      data.subscribeReadingList(user.uid, setReadingItems),
    ];
    return () => unsubs.forEach((u) => u());
  }, [user]);

  if (!user) return null;

  const openTasks = tasks.filter((t) => t.status !== "done");
  // Auto-archived tasks (done 30+ days) stay in Firestore but drop out of this preview.
  const shownTasks = visibleTasks(tasks);
  const latestActivity = activities[0];
  const openPrCount = (github?.openPullRequests.length ?? 0) + (gitlab?.openPullRequests.length ?? 0);
  const insightLevel = levelFromXp(computeInsightXp(lessons, drills, vocabWords, readingItems));
  const lessonDoneToday = lessons.some((l) => l.id === todayLessonId());
  const pendingReadingCount = readingItems.filter((i) => i.status !== "read").length;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <PageHeader
        eyebrow="Overview"
        title={`Welcome back${user.displayName ? `, ${user.displayName.split(" ")[0]}` : ""}`}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Card title="Tasks" href="/tasks">
          <p className="text-3xl font-bold">{openTasks.length}</p>
          <p className="text-sm text-muted">open task{openTasks.length === 1 ? "" : "s"}</p>
        </Card>

        <Card title="Sports" href="/sports">
          {latestActivity ? (
            <>
              <p className="truncate text-lg font-bold">{latestActivity.name}</p>
              <p className="text-sm text-muted">
                {latestActivity.type} · {new Date(latestActivity.startDate).toLocaleDateString()}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted">No activity yet — connect Strava.</p>
          )}
        </Card>

        <Card title="Dev Activity" href="/integrations">
          <p className="text-3xl font-bold">{openPrCount}</p>
          <p className="text-sm text-muted">open pull request{openPrCount === 1 ? "" : "s"}</p>
        </Card>

        <Card title="Agenda" href="/agenda">
          {events.length > 0 ? (
            <>
              <p className="truncate text-lg font-bold">{events[0]!.title}</p>
              <p className="text-sm text-muted">
                {events[0]!.start.includes("T")
                  ? new Date(events[0]!.start).toLocaleString(undefined, {
                      weekday: "short",
                      hour: "numeric",
                      minute: "2-digit",
                    })
                  : "All day"}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted">No events yet — connect Google Calendar.</p>
          )}
        </Card>

        <Card title="Music" href="/music">
          {spotify && spotify.recentTracks.length > 0 ? (
            <>
              <p className="truncate text-lg font-bold">{spotify.recentTracks[0]!.name}</p>
              <p className="text-sm text-muted">
                {spotify.topArtists[0] ? `Top artist: ${spotify.topArtists[0].name}` : spotify.recentTracks[0]!.artists}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted">No listening history yet — connect Spotify.</p>
          )}
        </Card>

        {KNOWLEDGE_APP_URL && (
          <ExternalCard title="Knowledge" href={KNOWLEDGE_APP_URL}>
            <p className="text-3xl font-bold">Lv {insightLevel.level}</p>
            <p className="text-sm text-muted">
              {lessonDoneToday ? "Today's lesson done" : "No lesson generated today"}
              {pendingReadingCount > 0 ? ` · ${pendingReadingCount} unread article${pendingReadingCount === 1 ? "" : "s"}` : ""}
            </p>
          </ExternalCard>
        )}
      </div>

      <TasksSection tasks={shownTasks} uid={user.uid} />
      <GoalsSection goals={goals} tasks={tasks} uid={user.uid} />
      <ChallengesSection challenges={challenges} activities={activities} uid={user.uid} />
      <RemindersSection reminders={reminders} uid={user.uid} />
    </div>
  );
}
