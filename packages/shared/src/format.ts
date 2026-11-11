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
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
