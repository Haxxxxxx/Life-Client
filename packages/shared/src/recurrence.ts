import type { Recurrence } from "./types";

export const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parses a stored date string into a local Date.
 *
 * `new Date("2026-11-10")` is specified to parse as UTC midnight, but every
 * read below uses local getters (`getDate`, `getDay`). West of UTC those
 * disagree by a day, and the rule silently failed to advance: in
 * America/New_York a daily rule on 2026-11-10 returned 2026-11-10 — the same
 * date — while in Europe/Paris the identical call correctly returned
 * 2026-11-11. Weekly rules were worse: the weekday was read a day early, so a
 * "every Monday" rule picked Sunday.
 *
 * Date-only strings are therefore constructed component-wise, as local
 * midnight. Datetime strings carry an offset and are already unambiguous.
 */
function parseLocal(dateStr: string): Date {
  const m = DATE_ONLY.exec(dateStr);
  if (!m) return new Date(dateStr);

  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(year, month - 1, day);
  // Round-trip check: the Date constructor silently normalises impossible
  // components, so "2026-13-45" becomes February 2027 rather than failing.
  // Advancing a date the user never wrote is worse than refusing to.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return new Date(Number.NaN);
  }
  return date;
}

/** Adds whole months, clamping to the end of the target month. */
function addMonths(date: Date, months: number): void {
  const day = date.getDate();
  // Move off the current day-of-month first: setMonth on the 31st overflows,
  // so Jan 31 + 1 month silently became Mar 2 or 3 rather than Feb 28.
  date.setDate(1);
  date.setMonth(date.getMonth() + months);
  const lastDayOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, lastDayOfMonth));
}

/**
 * Advances a date/datetime string past the current occurrence per the recurrence rule.
 * Preserves the time-of-day when the input includes one (Reminder.deadline);
 * returns a plain YYYY-MM-DD when it doesn't (Task.dueDate).
 *
 * Returns the input unchanged if it cannot be parsed. The money form accepts
 * free text, so a stored value like "Today" used to reach `toISOString()` on an
 * Invalid Date and throw a RangeError — and because the bad row was persisted,
 * every subsequent render of the Subscriptions list threw again.
 */
export function nextOccurrenceDate(dateStr: string, recurrence: Recurrence): string {
  const date = parseLocal(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;

  const hasTime = dateStr.includes("T");
  const rawInterval = Number(recurrence.interval);
  const interval = Number.isFinite(rawInterval) ? Math.max(1, Math.floor(rawInterval)) : 1;

  if (recurrence.freq === "daily") {
    date.setDate(date.getDate() + interval);
  } else if (recurrence.freq === "weekly") {
    const days = recurrence.daysOfWeek?.length
      ? [...recurrence.daysOfWeek].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort((a, b) => a - b)
      : null;
    if (days && days.length > 0) {
      const currentDow = date.getDay();
      const next = days.find((d) => d > currentDow);
      if (next !== undefined) {
        date.setDate(date.getDate() + (next - currentDow));
      } else {
        const daysUntilFirst = 7 - currentDow + days[0]!;
        date.setDate(date.getDate() + daysUntilFirst + 7 * (interval - 1));
      }
    } else {
      date.setDate(date.getDate() + 7 * interval);
    }
  } else {
    addMonths(date, interval);
  }

  if (hasTime) return date.toISOString();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Compact human-readable summary, e.g. "Every 2 weeks on Mo, We, Fr" or "Every month". */
export function describeRecurrence(recurrence: Recurrence): string {
  const rawInterval = Number(recurrence.interval);
  const interval = Number.isFinite(rawInterval) ? Math.max(1, Math.floor(rawInterval)) : 1;
  const unit = recurrence.freq === "daily" ? "day" : recurrence.freq === "weekly" ? "week" : "month";
  const base = interval === 1 ? `Every ${unit}` : `Every ${interval} ${unit}s`;
  if (recurrence.freq === "weekly" && recurrence.daysOfWeek?.length) {
    const days = [...recurrence.daysOfWeek].sort((a, b) => a - b).map((d) => WEEKDAY_LABELS[d]);
    return `${base} on ${days.join(", ")}`;
  }
  return base;
}
