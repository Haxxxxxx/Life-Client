import { addDays, toDateStr } from "./streaks";
import type { CalendarEvent } from "./types";

/**
 * Display formatting shared by every client.
 *
 * These were written out separately in the web and mobile screens — identical
 * apart from quote style — which is how two of them had already started to
 * drift apart in precision. Living here means one definition and, since they
 * are pure, actual test coverage.
 */

const USD = { style: "currency", currency: "USD" } as const;

/**
 * A money amount in the viewer's locale.
 *
 * Currency is hardcoded to USD, as it was in both copies. That is a real
 * limitation rather than an oversight being preserved: nothing in the data
 * model records a currency, so there is nothing better to read. Worth
 * revisiting if a currency field ever lands on the account.
 */
export function formatMoney(amount: number): string {
  if (!Number.isFinite(amount)) return "—";
  return amount.toLocaleString(undefined, USD);
}

/** `formatMoney` without the minor units, for axis ticks and tight columns. */
export function formatMoneyShort(amount: number): string {
  if (!Number.isFinite(amount)) return "—";
  return amount.toLocaleString(undefined, { ...USD, maximumFractionDigits: 0 });
}

/**
 * Metres as kilometres, to two decimals.
 *
 * Falsy input renders as an em dash rather than "0.00 km": a missing distance
 * and a zero distance are different claims, and most activities with no
 * distance are things like a gym session where the number is meaningless.
 */
export function formatDistance(meters?: number): string {
  if (!meters || !Number.isFinite(meters)) return "—";
  return `${(meters / 1000).toFixed(2)} km`;
}

/** Seconds as `1h 5m`, or `5m` under an hour. Falsy input renders as an em dash, as with distance. */
export function formatDuration(seconds?: number): string {
  if (!seconds || !Number.isFinite(seconds)) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/**
 * True when a calendar event covers whole days rather than a time range.
 *
 * Google returns `start.date` for an all-day event and `start.dateTime` for a
 * timed one; the stored string keeps that distinction, so the presence of the
 * ISO time separator is what tells them apart. Both agenda screens worked this
 * out separately.
 */
export function isAllDay(event: CalendarEvent): boolean {
  return !event.start.includes("T");
}

/** `09:00 – 10:30` in the viewer's locale, or "All day". */
export function timeRangeLabel(event: CalendarEvent): string {
  if (isAllDay(event)) return "All day";
  const opts = { hour: "numeric", minute: "2-digit" } as const;
  const start = new Date(event.start).toLocaleTimeString(undefined, opts);
  const end = new Date(event.end).toLocaleTimeString(undefined, opts);
  return `${start} – ${end}`;
}

/**
 * The agenda day an event belongs under, as a local `YYYY-MM-DD` key.
 *
 * All-day events already carry a plain date. Timed events are stored as
 * `toISOString()`, i.e. UTC, so taking the first ten characters of that string
 * groups them by the *UTC* day: at UTC+1 a 00:30 event reads as the previous
 * day, and at UTC-5 a 9pm event reads as the next one. Web did exactly that,
 * so such events sat under the wrong heading - "Today"/"Tomorrow" included,
 * since the heading is derived from this key.
 */
export function eventDayKey(event: CalendarEvent): string {
  if (isAllDay(event)) return event.start;
  const date = new Date(event.start);
  if (Number.isNaN(date.getTime())) return event.start.slice(0, 10);
  return toDateStr(date);
}

/** "Today", "Tomorrow", or e.g. `Monday, Nov 16` for a `YYYY-MM-DD` key. */
export function eventDayLabel(key: string, now: Date = new Date()): string {
  const today = toDateStr(now);
  if (key === today) return "Today";
  if (key === addDays(today, 1)) return "Tomorrow";
  return new Date(`${key}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

/**
 * True once an event has finished, and so should drop out of the agenda.
 *
 * Google's all-day `end` is a date, and it is *exclusive*: an event covering
 * 10-13 Nov ends "2026-11-14". The event is therefore over once that date
 * arrives. Judging an all-day event by its start instead - as web did, with
 * `start` + `T23:59:59` - hid multi-day events from their second day onward
 * while they were still running, because this predicate filters the list.
 *
 * `end` is trusted as exclusive only when it really is after `start`; anything
 * else falls back to the day after `start`, so an event stored with an
 * inclusive end is never hidden on the day it is happening.
 */
export function isEventPast(event: CalendarEvent, now: Date = new Date()): boolean {
  if (isAllDay(event)) {
    const endExclusive = event.end && event.end > event.start ? event.end : addDays(event.start, 1);
    return new Date(`${endExclusive}T00:00:00`).getTime() <= now.getTime();
  }
  return new Date(event.end).getTime() < now.getTime();
}

/**
 * A Date as `YYYY-MM-DDTHH:mm` in local time — the format an
 * `<input type="datetime-local">` expects, and what mobile's date field
 * mirrors.
 *
 * Built from local getters rather than toISOString(), which would convert to
 * UTC and show the wrong clock time to everyone outside it. This existed three
 * times: twice in apps/web and once in apps/mobile.
 */
export function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${toDateStr(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
