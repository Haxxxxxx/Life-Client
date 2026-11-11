/**
 * Parsing numbers typed into a form field.
 *
 * Three problems these solve, all of which silently wrote wrong data:
 *
 * 1. `Number("5,5")` is NaN. The mobile forms use a `decimal-pad` keyboard,
 *    which shows a COMMA as the decimal separator in most of Europe and much
 *    of the world. Combined with `Number(x) || 0`, a 5.5 km run was logged as
 *    a 0 km run — and still earned the flat endurance XP.
 * 2. `Number(x) || 1` and `|| 0` only rescue NaN and zero, so NEGATIVES pass
 *    straight through. A challenge with a -5 km daily target is satisfied by
 *    doing nothing, because `value >= -5000` is always true: every day shows
 *    complete and the streak grows for free.
 * 3. `0.001 * 1000` is not 1000 in binary floating point. Logging "2.01" km
 *    stored 2009.9999999999998 while a 2.01 km challenge target stored
 *    Math.round(2010), so `2009.99… >= 2010` was false and that day never
 *    completed.
 */

/**
 * Parses a free-text numeric field, accepting either decimal separator.
 *
 * Returns null for anything that is not a finite number, so callers must
 * decide what to do rather than silently receiving 0.
 */
export function parseDecimalInput(raw: string | number | null | undefined): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Only swap a comma when it is clearly the decimal mark; "1,234.5" is a
  // thousands separator and should keep its dot.
  const normalised = trimmed.includes(".") ? trimmed.replace(/,/g, "") : trimmed.replace(",", ".");
  const value = Number(normalised);
  return Number.isFinite(value) ? value : null;
}

/** Parses and requires a value strictly greater than zero. */
export function parsePositive(raw: string | number | null | undefined): number | null {
  const value = parseDecimalInput(raw);
  return value !== null && value > 0 ? value : null;
}

/** Parses and requires a whole number greater than zero, optionally capped. */
export function parsePositiveInt(
  raw: string | number | null | undefined,
  max = Number.MAX_SAFE_INTEGER,
): number | null {
  const value = parseDecimalInput(raw);
  if (value === null || !Number.isInteger(value) || value <= 0 || value > max) return null;
  return value;
}

/**
 * Kilometres to whole metres.
 *
 * Rounds, because the unrounded product disagrees with the stored challenge
 * target for 74 of the 9,999 two-decimal values between 0.01 and 99.99 — and
 * the comparison is `>=`, so being short by 2e-13 breaks the streak.
 */
export function kilometresToMetres(km: number): number {
  return Math.round(km * 1000);
}

/** Calendar-date validation for a free-text YYYY-MM-DD field. */
export function isValidDateKey(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return false;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(year, month - 1, day);
  // The Date constructor normalises impossible components (month 13 becomes
  // January of the next year), so round-trip them rather than trusting it.
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}
