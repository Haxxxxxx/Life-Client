import { describe, expect, it } from "vitest";
import {
  formatDistance,
  formatDuration,
  formatMoney,
  formatMoneyShort,
  isAllDay,
  timeRangeLabel,
  toDatetimeLocalValue,
} from "./format";
import type { CalendarEvent } from "./types";

describe("formatDistance", () => {
  it("renders metres as kilometres to two decimals", () => {
    expect(formatDistance(5000)).toBe("5.00 km");
    expect(formatDistance(1234)).toBe("1.23 km");
  });

  it("renders an em dash rather than 0.00 km when there is no distance", () => {
    // A gym session has no meaningful distance. "0.00 km" would assert one.
    expect(formatDistance(undefined)).toBe("—");
    expect(formatDistance(0)).toBe("—");
  });

  it("does not render NaN or Infinity to the screen", () => {
    expect(formatDistance(Number.NaN)).toBe("—");
    expect(formatDistance(Number.POSITIVE_INFINITY)).toBe("—");
  });
});

describe("formatDuration", () => {
  it("drops the hour component below an hour", () => {
    expect(formatDuration(300)).toBe("5m");
    expect(formatDuration(3599)).toBe("60m");
  });

  it("splits hours and minutes above an hour", () => {
    expect(formatDuration(3600)).toBe("1h 0m");
    expect(formatDuration(3900)).toBe("1h 5m");
    expect(formatDuration(7260)).toBe("2h 1m");
  });

  it("renders an em dash for a missing or zero duration", () => {
    expect(formatDuration(undefined)).toBe("—");
    expect(formatDuration(0)).toBe("—");
  });

  it("does not render NaN or Infinity to the screen", () => {
    expect(formatDuration(Number.NaN)).toBe("—");
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe("—");
  });
});

describe("formatMoney", () => {
  // Locale-dependent output, so assert the parts that hold everywhere rather
  // than pinning a separator the CI runner's ICU may not use.
  it("includes the amount and a currency marker", () => {
    const out = formatMoney(1234.5);
    expect(out).toMatch(/1[,.\s]?234/);
    expect(out).toMatch(/\$|USD/);
  });

  it("keeps minor units, and drops them in the short form", () => {
    expect(formatMoney(10)).toMatch(/10[.,]00/);
    expect(formatMoneyShort(10)).not.toMatch(/10[.,]00/);
  });

  it("does not render NaN to the screen", () => {
    expect(formatMoney(Number.NaN)).toBe("—");
    expect(formatMoneyShort(Number.NaN)).toBe("—");
  });

  it("handles negatives, which an expense ledger produces", () => {
    expect(formatMoney(-42)).toMatch(/42/);
  });
});

const event = (start: string, end: string) => ({ id: "e", title: "t", start, end }) as CalendarEvent;

describe("isAllDay", () => {
  it("treats a date-only start as all day", () => {
    // Google sends start.date for an all-day event and start.dateTime
    // otherwise; the ISO time separator is what survives into storage.
    expect(isAllDay(event("2026-11-11", "2026-11-12"))).toBe(true);
  });

  it("treats a start with a time as a timed event", () => {
    expect(isAllDay(event("2026-11-11T09:00:00Z", "2026-11-11T10:00:00Z"))).toBe(false);
  });
});

describe("timeRangeLabel", () => {
  it("says All day for a date-only event", () => {
    expect(timeRangeLabel(event("2026-11-11", "2026-11-12"))).toBe("All day");
  });

  it("renders a range with an en dash for a timed event", () => {
    const label = timeRangeLabel(event("2026-11-11T09:00:00Z", "2026-11-11T10:30:00Z"));
    expect(label).toContain("–");
    // Locale and zone decide the digits, so assert the shape, not the hour.
    expect(label).toMatch(/\d/);
  });
});

describe("toDatetimeLocalValue", () => {
  it("formats local wall-clock time, not UTC", () => {
    // Built from local getters on purpose: toISOString() would shift the
    // displayed time for everyone outside UTC.
    const d = new Date(2026, 10, 11, 9, 5);
    expect(toDatetimeLocalValue(d)).toBe("2026-11-11T09:05");
  });

  it("zero-pads every component", () => {
    expect(toDatetimeLocalValue(new Date(2026, 0, 5, 7, 3))).toBe("2026-01-05T07:03");
  });

  it("handles midnight", () => {
    expect(toDatetimeLocalValue(new Date(2026, 10, 11, 0, 0))).toBe("2026-11-11T00:00");
  });
});
