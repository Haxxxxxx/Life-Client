/**
 * Calendar arithmetic in a named IANA zone rather than the runtime's own.
 *
 * Everything that runs on a client can use plain local getters, because the
 * runtime's zone *is* the user's. Server code cannot: on Vercel the process
 * clock is UTC, so a cron asking `new Date().getDate()` gets UTC's calendar
 * day. For the daily digest that is wrong for most of the planet for part of
 * every day — a user in Tokyo is nine hours into tomorrow, a user in Los
 * Angeles still eight hours inside yesterday — and "due today" is exactly the
 * question being asked.
 */

const UTC = "UTC";

/** True when the runtime accepts `timeZone` as an IANA zone id. */
export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    // RangeError for an unknown zone. Anything a client wrote into Firestore
    // is unvalidated input, and an old or trimmed-down ICU build may not know
    // a zone that the device that wrote it did.
    return false;
  }
}

/** The zone to actually use: the given one when the runtime knows it, UTC otherwise. */
export function normalizeTimeZone(timeZone: string | undefined | null): string {
  return typeof timeZone === "string" && isValidTimeZone(timeZone) ? timeZone : UTC;
}

// Constructing an Intl.DateTimeFormat is expensive relative to formatting with
// one, and the digest formats a handful of dates per user across every user in
// a single pass. Zones repeat heavily, so a tiny cache removes nearly all of
// that cost.
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/**
 * YYYY-MM-DD for an instant as it reads on the wall clock in `timeZone`.
 *
 * Throws on an invalid Date rather than returning a sentinel: every call site
 * either passes `new Date()` or has already checked, and a quiet "" would sort
 * before every real date key and silently empty a digest.
 */
export function dateKeyInZone(date: Date, timeZone: string): string {
  if (Number.isNaN(date.getTime())) {
    throw new RangeError("dateKeyInZone: invalid Date");
  }
  const parts = formatterFor(normalizeTimeZone(timeZone)).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  // Years before 1000 format without leading zeros, which would break both the
  // string ordering the digest relies on and the Date.parse below.
  return `${part("year").padStart(4, "0")}-${part("month")}-${part("day")}`;
}

/** Today's YYYY-MM-DD as it reads in `timeZone`. */
export function todayKeyInZone(timeZone: string, now: Date = new Date()): string {
  return dateKeyInZone(now, timeZone);
}

/**
 * Whole calendar days from `b` to `a`, both YYYY-MM-DD keys.
 *
 * Parsing the keys as UTC midnights makes this exact: the inputs are date
 * labels, not instants, so there is no DST-shortened day for a fixed divisor
 * to absorb incorrectly.
 */
export function dayKeyDifference(a: string, b: string): number {
  const ms = Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`);
  if (Number.isNaN(ms)) return 0;
  return Math.round(ms / 86_400_000);
}

/**
 * Whole calendar days between today and `deadline`, counted as the days read
 * in `timeZone`: 0 for today, 1 for tomorrow, -1 for yesterday.
 *
 * The zone-aware twin of `daysUntil` in reminders.ts, which uses local getters
 * and is right for clients and wrong for a cron.
 */
export function daysUntilInZone(deadline: string, timeZone: string, now: Date = new Date()): number {
  const target = new Date(deadline);
  if (Number.isNaN(target.getTime())) return 0;
  const zone = normalizeTimeZone(timeZone);
  return dayKeyDifference(dateKeyInZone(target, zone), dateKeyInZone(now, zone));
}

/** The device's own zone, for clients to record so server-side crons can reason in it. Undefined where Intl is unavailable. */
export function currentTimeZone(): string | undefined {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return zone && isValidTimeZone(zone) ? zone : undefined;
  } catch {
    return undefined;
  }
}
