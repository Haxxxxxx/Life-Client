"use client";

import { WEEKDAY_LABELS, type Recurrence, type RecurrenceFreq } from "@life-client/shared";

/**
 * Frequency / interval / weekday picker for a recurrence rule.
 *
 * This existed three times — in tasks/_components.tsx, dashboard/page.tsx and
 * money/page.tsx — at seventy lines each. The copies were identical apart from
 * the `export` keyword and the label on the "no recurrence" option, which
 * money called "One-time" because a transaction that does not repeat is not
 * naturally described as "No repeat". That one word is now a prop, which is
 * the whole reason the three were allowed to drift apart in the first place.
 */
export function RecurrencePicker({
  value,
  onChange,
  noneLabel = "No repeat",
}: {
  value: Recurrence | undefined;
  onChange: (next: Recurrence | undefined) => void;
  /** Wording for the "does not repeat" option — "One-time" reads better for a transaction. */
  noneLabel?: string;
}) {
  const freq = value?.freq;
  const interval = value?.interval ?? 1;
  const daysOfWeek = value?.daysOfWeek ?? [];

  function setFreq(next: RecurrenceFreq | undefined) {
    if (!next) {
      onChange(undefined);
      return;
    }
    onChange({ freq: next, interval, daysOfWeek: next === "weekly" ? daysOfWeek : undefined });
  }

  function toggleDay(day: number) {
    const next = daysOfWeek.includes(day) ? daysOfWeek.filter((d) => d !== day) : [...daysOfWeek, day];
    onChange({ freq: "weekly", interval, daysOfWeek: next });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {(["none", "daily", "weekly", "monthly"] as const).map((f) => (
        <button
          key={f}
          type="button"
          onClick={() => setFreq(f === "none" ? undefined : f)}
          className={`rounded-full border px-2.5 py-1 text-xs capitalize ${
            (f === "none" && !freq) || f === freq ? "border-border-strong bg-primary/15" : "border-border text-muted"
          }`}
        >
          {f === "none" ? noneLabel : f}
        </button>
      ))}
      {freq && (
        <label className="flex items-center gap-1 text-xs text-muted">
          every
          <input
            type="number"
            min={1}
            value={interval}
            onChange={(e) => onChange({ freq, interval: Number(e.target.value) || 1, daysOfWeek: value?.daysOfWeek })}
            className="w-12 rounded-xl border border-border-strong bg-background px-1 py-0.5 text-xs"
          />
          {freq === "daily" ? "day(s)" : freq === "weekly" ? "week(s)" : "month(s)"}
        </label>
      )}
      {freq === "weekly" && (
        <div className="flex gap-1">
          {WEEKDAY_LABELS.map((label, i) => (
            <button
              key={i}
              type="button"
              onClick={() => toggleDay(i)}
              className={`rounded-full border px-1.5 py-1 text-micro font-bold ${
                daysOfWeek.includes(i) ? "border-border-strong bg-primary text-primary-foreground" : "border-border text-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
