"use client";

import {
  createReminder,
  deleteReminderEverywhere,
  type Reminder,
  type ReminderUrgency,
  daysUntil,
  reminderUrgency,
  subscribeReminders,
  syncReminderToCalendar,
  updateReminder,
} from "@life-client/shared";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import { webApiClient } from "@/lib/webApiClient";

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

function EditReminderForm({
  reminder,
  onSave,
  onCancel,
}: {
  reminder: Reminder;
  onSave: (patch: { title: string; note?: string; deadline: string }) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(reminder.title);
  const [note, setNote] = useState(reminder.note ?? "");
  const [deadline, setDeadline] = useState(toDatetimeLocalValue(new Date(reminder.deadline)));

  return (
    <div className="flex flex-1 flex-col gap-2">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="rounded-md border-2 border-foreground bg-background px-2 py-1.5 text-sm"
      />
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Notes"
        className="rounded-md border-2 border-foreground bg-background px-2 py-1.5 text-sm"
      />
      <input
        type="datetime-local"
        value={deadline}
        onChange={(e) => setDeadline(e.target.value)}
        className="rounded-md border-2 border-foreground bg-background px-2 py-1.5 text-sm"
      />
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() =>
            onSave({
              title: title.trim() || reminder.title,
              note: note.trim() || undefined,
              deadline: new Date(deadline).toISOString(),
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
  const [editingId, setEditingId] = useState<string | null>(null);

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
      const reminderId = await createReminder(db, user.uid, {
        title: title.trim(),
        note: note.trim() || undefined,
        deadline: new Date(deadline).toISOString(),
      });
      setTitle("");
      setNote("");
      // Best-effort — a no-op server-side if Google Calendar isn't connected,
      // and shouldn't block the reminder itself from existing if it fails.
      syncReminderToCalendar(webApiClient, reminderId).catch((err) =>
        console.error("Could not sync reminder to Google Calendar", err),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create reminder");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(reminderId: string) {
    try {
      await deleteReminderEverywhere(webApiClient, reminderId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete reminder");
    }
  }

  async function handleSaveEdit(reminderId: string, patch: { title: string; note?: string; deadline: string }) {
    if (!user || !db) return;
    try {
      await updateReminder(db, user.uid, reminderId, patch);
      setEditingId(null);
      syncReminderToCalendar(webApiClient, reminderId).catch((err) =>
        console.error("Could not sync reminder to Google Calendar", err),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update reminder");
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
            className="min-w-0 flex-1 rounded-md border-2 border-foreground bg-background px-3 py-2 text-sm outline-none focus:shadow-[2px_2px_0_0_var(--primary)]"
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
                      {new Date(reminder.deadline).toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </p>
                  </button>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="rounded-full border-2 border-foreground bg-accent px-2.5 py-1 font-mono text-xs font-bold">
                      {urgencyLabel(urgency, days)}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDelete(reminder.id)}
                      className="rounded-md px-3 py-1.5 font-mono text-xs font-bold text-red-600 uppercase hover:bg-red-600/10"
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}
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
