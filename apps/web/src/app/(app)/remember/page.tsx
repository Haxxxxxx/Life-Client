"use client";

import {
  createReminder,
  deleteReminder,
  type Reminder,
  type ReminderUrgency,
  daysUntil,
  reminderUrgency,
  subscribeReminders,
} from "@life-client/shared";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";

const URGENCY_STYLE: Record<ReminderUrgency, string> = {
  overdue: "border-red-600 bg-red-600/10",
  "due-today": "border-primary bg-primary/10",
  "due-soon": "border-primary bg-primary/5",
  upcoming: "border-foreground bg-surface",
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

export default function RememberPage() {
  const { user } = useAuth();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [deadline, setDeadline] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return toDatetimeLocalValue(tomorrow);
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !db) return;
    return subscribeReminders(db, user.uid, setReminders, (err) => setError(err.message));
  }, [user]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !db || !title.trim() || !deadline) return;
    setSubmitting(true);
    setError(null);
    try {
      await createReminder(db, user.uid, {
        title: title.trim(),
        note: note.trim() || undefined,
        deadline: new Date(deadline).toISOString(),
      });
      setTitle("");
      setNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create reminder");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <p className="font-mono text-xs font-bold tracking-[0.3em] text-primary uppercase">Deadlines</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Remember</h1>
        <p className="text-sm text-muted">
          Referral codes, trial expirations, renewal dates — anything with a deadline you don&apos;t
          want to miss.
        </p>
      </div>

      <form onSubmit={handleAdd} className="flex flex-col gap-2 rounded-md border-2 border-foreground bg-surface p-4">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What do you need to remember?"
          className="rounded-md border-2 border-foreground bg-background px-3 py-2 text-sm outline-none placeholder:text-muted focus:shadow-[2px_2px_0_0_var(--primary)]"
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Notes (e.g. account it's linked to)"
          className="rounded-md border-2 border-foreground bg-background px-3 py-2 text-sm outline-none placeholder:text-muted focus:shadow-[2px_2px_0_0_var(--primary)]"
        />
        <div className="flex gap-2">
          <input
            type="datetime-local"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="flex-1 rounded-md border-2 border-foreground bg-background px-3 py-2 text-sm outline-none focus:shadow-[2px_2px_0_0_var(--primary)]"
          />
          <button
            type="submit"
            disabled={submitting || !title.trim() || !deadline}
            className="rounded-md border-2 border-foreground bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-[2px_2px_0_0_var(--foreground)] transition hover:-translate-y-0.5 active:translate-y-0 active:shadow-none disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </form>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <ul className="flex flex-col gap-2">
        {reminders.map((reminder) => {
          const urgency = reminderUrgency(reminder.deadline);
          const days = daysUntil(reminder.deadline);
          return (
            <li
              key={reminder.id}
              className={`flex items-center justify-between gap-3 rounded-md border-2 px-4 py-3 ${URGENCY_STYLE[urgency]}`}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{reminder.title}</p>
                {reminder.note && <p className="truncate text-xs text-muted">{reminder.note}</p>}
                <p className="font-mono text-xs tracking-wide text-muted uppercase">
                  {new Date(reminder.deadline).toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="rounded-full border-2 border-foreground bg-accent px-2.5 py-1 font-mono text-xs font-bold">
                  {urgencyLabel(urgency, days)}
                </span>
                <button
                  type="button"
                  onClick={() => user && db && deleteReminder(db, user.uid, reminder.id)}
                  className="rounded-md px-3 py-1.5 font-mono text-xs font-bold text-red-600 uppercase hover:bg-red-600/10"
                >
                  Delete
                </button>
              </div>
            </li>
          );
        })}
        {reminders.length === 0 && (
          <li className="rounded-md border-2 border-dashed border-foreground/30 px-4 py-8 text-center text-sm text-muted">
            Nothing to remember yet — add your first deadline above.
          </li>
        )}
      </ul>
    </div>
  );
}
