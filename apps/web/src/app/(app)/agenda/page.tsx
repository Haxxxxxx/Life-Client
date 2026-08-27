"use client";

import {
  createCalendarEvent,
  deleteCalendarEvent,
  subscribeCalendarEvents,
  updateCalendarEvent,
  type CalendarEvent,
} from "@life-client/shared";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import { webApiClient } from "@/lib/webApiClient";

function isAllDay(event: CalendarEvent): boolean {
  return !event.start.includes("T");
}

function dayKey(event: CalendarEvent): string {
  return isAllDay(event) ? event.start : event.start.slice(0, 10);
}

function dayLabel(key: string): string {
  const date = new Date(`${key}T00:00:00`);
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;

  if (key === todayKey) return "Today";
  if (key === tomorrowKey) return "Tomorrow";
  return date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

function timeRangeLabel(event: CalendarEvent): string {
  if (isAllDay(event)) return "All day";
  const start = new Date(event.start).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const end = new Date(event.end).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${start} – ${end}`;
}

function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function EventForm({
  initial,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  initial?: CalendarEvent;
  onSubmit: (input: { title: string; start: string; end: string; location?: string }) => void;
  onCancel: () => void;
  submitLabel: string;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [location, setLocation] = useState(initial?.location ?? "");
  const [start, setStart] = useState(() => {
    if (initial && !isAllDay(initial)) return toDatetimeLocalValue(new Date(initial.start));
    const in1h = new Date();
    in1h.setMinutes(0, 0, 0);
    in1h.setHours(in1h.getHours() + 1);
    return toDatetimeLocalValue(in1h);
  });
  const [end, setEnd] = useState(() => {
    if (initial && !isAllDay(initial)) return toDatetimeLocalValue(new Date(initial.end));
    const in2h = new Date();
    in2h.setMinutes(0, 0, 0);
    in2h.setHours(in2h.getHours() + 2);
    return toDatetimeLocalValue(in2h);
  });

  return (
    <div className="flex flex-col gap-2 rounded-md border-2 border-foreground bg-surface p-4">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Event title"
        className="rounded-md border-2 border-foreground bg-background px-3 py-2 text-sm outline-none placeholder:text-muted focus:shadow-[2px_2px_0_0_var(--primary)]"
      />
      <input
        value={location}
        onChange={(e) => setLocation(e.target.value)}
        placeholder="Location (optional)"
        className="rounded-md border-2 border-foreground bg-background px-3 py-2 text-sm outline-none placeholder:text-muted"
      />
      <div className="flex gap-2">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted">
          Start
          <input
            type="datetime-local"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="w-full min-w-0 rounded-md border-2 border-foreground bg-background px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted">
          End
          <input
            type="datetime-local"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="w-full min-w-0 rounded-md border-2 border-foreground bg-background px-2 py-1.5 text-sm"
          />
        </label>
      </div>
      <div className="flex gap-3">
        <button
          type="button"
          disabled={!title.trim() || !start || !end}
          onClick={() =>
            onSubmit({
              title: title.trim(),
              start: new Date(start).toISOString(),
              end: new Date(end).toISOString(),
              location: location.trim() || undefined,
            })
          }
          className="rounded-md border-2 border-foreground bg-primary px-4 py-1.5 font-mono text-xs font-bold text-primary-foreground shadow-[2px_2px_0_0_var(--foreground)] transition hover:-translate-y-0.5 active:translate-y-0 active:shadow-none disabled:opacity-50"
        >
          {submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-1.5 font-mono text-xs font-bold text-muted uppercase hover:bg-foreground/5"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function AgendaPage() {
  const { user } = useAuth();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !db) return;
    return subscribeCalendarEvents(db, user.uid, setEvents, (err) => setError(err.message), 50);
  }, [user]);

  async function handleCreate(input: { title: string; start: string; end: string; location?: string }) {
    setError(null);
    try {
      await createCalendarEvent(webApiClient, input);
      setFormOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create event");
    }
  }

  async function handleUpdate(eventId: string, input: { title: string; start: string; end: string; location?: string }) {
    setError(null);
    try {
      await updateCalendarEvent(webApiClient, eventId, input);
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update event");
    }
  }

  async function handleDelete(eventId: string) {
    setError(null);
    try {
      await deleteCalendarEvent(webApiClient, eventId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete event");
    }
  }

  const groups: { key: string; events: CalendarEvent[] }[] = [];
  for (const event of events) {
    const key = dayKey(event);
    const group = groups.at(-1);
    if (group && group.key === key) group.events.push(event);
    else groups.push({ key, events: [event] });
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs font-bold tracking-[0.3em] text-primary uppercase">Agenda</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Calendar</h1>
          <p className="text-sm text-muted">
            Upcoming events synced from Google Calendar, over the next 7 days.
          </p>
        </div>
        {!formOpen && (
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="shrink-0 rounded-md border-2 border-foreground bg-primary px-3 py-1.5 font-mono text-xs font-bold text-primary-foreground shadow-[2px_2px_0_0_var(--foreground)] transition hover:-translate-y-0.5 active:translate-y-0 active:shadow-none"
          >
            New event
          </button>
        )}
      </div>

      {formOpen && <EventForm onSubmit={handleCreate} onCancel={() => setFormOpen(false)} submitLabel="Create" />}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {groups.length === 0 && !formOpen && (
        <div className="rounded-md border-2 border-dashed border-foreground/30 px-4 py-8 text-center text-sm text-muted">
          No events yet — connect Google Calendar from Integrations, add one above, or check back once it&apos;s
          synced.
        </div>
      )}

      <div className="flex flex-col gap-5">
        {groups.map((group) => (
          <div key={group.key} className="flex flex-col gap-2">
            <p className="font-mono text-xs font-bold tracking-[0.2em] text-primary uppercase">
              {dayLabel(group.key)}
            </p>
            <ul className="flex flex-col gap-2">
              {group.events.map((event) =>
                editingId === event.id ? (
                  <li key={event.id}>
                    <EventForm
                      initial={event}
                      onSubmit={(input) => handleUpdate(event.id, input)}
                      onCancel={() => setEditingId(null)}
                      submitLabel="Save"
                    />
                  </li>
                ) : (
                  <li key={event.id} className="rounded-md border-2 border-foreground bg-surface p-4">
                    <div className="flex items-start justify-between gap-3">
                      <button type="button" onClick={() => setEditingId(event.id)} className="min-w-0 flex-1 text-left">
                        <p className="truncate font-bold hover:underline">{event.title}</p>
                        <p className="font-mono text-xs tracking-wide text-muted uppercase">
                          {timeRangeLabel(event)}
                        </p>
                        {event.location && <p className="mt-1 truncate text-sm text-muted">{event.location}</p>}
                      </button>
                      <div className="flex shrink-0 items-center gap-2">
                        {event.url && (
                          <a
                            href={event.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-md border-2 border-foreground px-3 py-1.5 font-mono text-xs font-bold uppercase hover:bg-accent/20"
                          >
                            Open
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDelete(event.id)}
                          className="rounded-md px-3 py-1.5 font-mono text-xs font-bold text-red-600 uppercase hover:bg-red-600/10"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </li>
                ),
              )}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
