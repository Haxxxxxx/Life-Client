"use client";

import {
  createCalendarEvent,
  deleteCalendarEvent,
  updateCalendarEvent,
  type CalendarEvent,
} from "@life-client/shared";
import { data } from "@life-client/shared";
import { useEffect, useState } from "react";
import { Button, Card, ErrorText, Eyebrow, Input, PageHeader } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { webApiClient } from "@/lib/webApiClient";

function isAllDay(event: CalendarEvent): boolean {
  return !event.start.includes("T");
}

// Deleting a past event through Google's API is unreliable (already-elapsed
// events can fail in ways that surface as a 500) and there's no real need to
// manage them here — just don't show them.
function isPast(event: CalendarEvent): boolean {
  if (isAllDay(event)) return new Date(`${event.start}T23:59:59`).getTime() < Date.now();
  return new Date(event.end).getTime() < Date.now();
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
    <Card className="flex flex-col gap-2">
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Event title" />
      <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location (optional)" />
      <div className="flex gap-2">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted">
          Start
          <Input type="datetime-local" size="sm" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted">
          End
          <Input type="datetime-local" size="sm" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
      </div>
      <div className="flex gap-3">
        <Button
          disabled={!title.trim() || !start || !end}
          onClick={() =>
            onSubmit({
              title: title.trim(),
              start: new Date(start).toISOString(),
              end: new Date(end).toISOString(),
              location: location.trim() || undefined,
            })
          }
        >
          {submitLabel}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}

export default function AgendaPage() {
  const { user } = useAuth();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    return data.subscribeCalendarEvents(user.uid, setEvents, (err) => setError(err.message), 50);
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
  for (const event of events.filter((e) => !isPast(e))) {
    const key = dayKey(event);
    const group = groups.at(-1);
    if (group && group.key === key) group.events.push(event);
    else groups.push({ key, events: [event] });
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <PageHeader
        eyebrow="Agenda"
        title="Calendar"
        description="Upcoming events synced from Google Calendar, over the next 7 days."
        action={
          !formOpen && (
            <Button size="sm" onClick={() => setFormOpen(true)}>
              New event
            </Button>
          )
        }
      />

      {formOpen && <EventForm onSubmit={handleCreate} onCancel={() => setFormOpen(false)} submitLabel="Create" />}
      <ErrorText>{error}</ErrorText>

      {groups.length === 0 && !formOpen && (
        <div className="rounded-md border-2 border-dashed border-foreground/30 px-4 py-8 text-center text-sm text-muted">
          No events yet — connect Google Calendar from Integrations, add one above, or check back once it&apos;s
          synced.
        </div>
      )}

      <div className="flex flex-col gap-5">
        {groups.map((group) => (
          <div key={group.key} className="flex flex-col gap-2">
            <Eyebrow>{dayLabel(group.key)}</Eyebrow>
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
                          className="rounded-md px-3 py-1.5 font-mono text-xs font-bold text-danger uppercase hover:bg-danger/10"
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
