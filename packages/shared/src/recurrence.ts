import type { Recurrence } from "./types";

export const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

/**
 * Advances a date/datetime string past the current occurrence per the recurrence rule.
 * Preserves the time-of-day when the input includes one (Reminder.deadline);
 * returns a plain YYYY-MM-DD when it doesn't (Task.dueDate).
 */
export function nextOccurrenceDate(dateStr: string, recurrence: Recurrence): string {
  const date = new Date(dateStr);
  const hasTime = dateStr.includes("T");
  const interval = Math.max(1, recurrence.interval);

  if (recurrence.freq === "daily") {
    date.setDate(date.getDate() + interval);
  } else if (recurrence.freq === "weekly") {
    const days = recurrence.daysOfWeek?.length ? [...recurrence.daysOfWeek].sort((a, b) => a - b) : null;
    if (days) {
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
    date.setMonth(date.getMonth() + interval);
  }

  if (hasTime) return date.toISOString();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Compact human-readable summary, e.g. "Every 2 weeks on Mo, We, Fr" or "Every month". */
export function describeRecurrence(recurrence: Recurrence): string {
  const interval = Math.max(1, recurrence.interval);
  const unit = recurrence.freq === "daily" ? "day" : recurrence.freq === "weekly" ? "week" : "month";
  const base = interval === 1 ? `Every ${unit}` : `Every ${interval} ${unit}s`;
  if (recurrence.freq === "weekly" && recurrence.daysOfWeek?.length) {
    const days = [...recurrence.daysOfWeek].sort((a, b) => a - b).map((d) => WEEKDAY_LABELS[d]);
    return `${base} on ${days.join(", ")}`;
  }
  return base;
}
