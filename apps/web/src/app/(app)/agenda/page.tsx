"use client";

import { type CalendarEvent, subscribeCalendarEvents } from "@life-client/shared";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";

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

export default function AgendaPage() {
  const { user } = useAuth();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !db) return;
    return subscribeCalendarEvents(db, user.uid, setEvents, (err) => setError(err.message), 50);
  }, [user]);

  const groups: { key: string; events: CalendarEvent[] }[] = [];
  for (const event of events) {
    const key = dayKey(event);
    const group = groups.at(-1);
    if (group && group.key === key) group.events.push(event);
    else groups.push({ key, events: [event] });
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <p className="font-mono text-xs font-bold tracking-[0.3em] text-primary uppercase">Agenda</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Calendar</h1>
        <p className="text-sm text-muted">
          Upcoming events synced from Google Calendar, over the next 7 days.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {groups.length === 0 && (
        <div className="rounded-md border-2 border-dashed border-foreground/30 px-4 py-8 text-center text-sm text-muted">
          No events yet — connect Google Calendar from Integrations, or check back once it&apos;s synced.
        </div>
      )}

      <div className="flex flex-col gap-5">
        {groups.map((group) => (
          <div key={group.key} className="flex flex-col gap-2">
            <p className="font-mono text-xs font-bold tracking-[0.2em] text-primary uppercase">
              {dayLabel(group.key)}
            </p>
            <ul className="flex flex-col gap-2">
              {group.events.map((event) => (
                <li key={event.id} className="rounded-md border-2 border-foreground bg-surface p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-bold">{event.title}</p>
                      <p className="font-mono text-xs tracking-wide text-muted uppercase">
                        {timeRangeLabel(event)}
                      </p>
                      {event.location && <p className="mt-1 truncate text-sm text-muted">{event.location}</p>}
                    </div>
                    {event.url && (
                      <a
                        href={event.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 rounded-md border-2 border-foreground px-3 py-1.5 font-mono text-xs font-bold uppercase hover:bg-accent/20"
                      >
                        Open
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
