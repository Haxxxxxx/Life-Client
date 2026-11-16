import { describe, expect, it } from "vitest";
import {
  formatDistance,
  formatDuration,
  formatMoney,
  formatMoneyShort,
  eventDayKey,
  eventDayLabel,
  isAllDay,
  isEventPast,
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

describe("eventDayKey", () => {
  const ev = (start: string, end = start): CalendarEvent =>
    ({ id: "e", title: "e", start, end }) as CalendarEvent;

  it("keeps an all-day event's own date", () => {
    expect(eventDayKey(ev("2026-11-16"))).toBe("2026-11-16");
  });

  it("groups a timed event by its LOCAL day, not the UTC day in the string", () => {
    // Stored as toISOString(), so the string's first ten characters are the UTC
    // date. Slicing them - which web did - files an event under the wrong
    // heading whenever local and UTC fall on different days.
    const local = new Date(2026, 10, 16, 0, 30);
    const key = eventDayKey(ev(local.toISOString()));
    expect(key).toBe("2026-11-16");
  });

  it("agrees with the local date for a late-evening event too", () => {
    const local = new Date(2026, 10, 16, 23, 30);
    expect(eventDayKey(ev(local.toISOString()))).toBe("2026-11-16");
  });

  it("falls back to the leading date rather than throwing on an unparseable start", () => {
    expect(eventDayKey(ev("not-a-date-at-allT00:00"))).toBe("not-a-date");
  });
});

describe("eventDayLabel", () => {
  const now = new Date(2026, 10, 16, 9, 0, 0);

  it("names today and tomorrow", () => {
    expect(eventDayLabel("2026-11-16", now)).toBe("Today");
    expect(eventDayLabel("2026-11-17", now)).toBe("Tomorrow");
  });

  it("falls back to a weekday date for anything else", () => {
    expect(eventDayLabel("2026-11-20", now)).toMatch(/Friday/);
  });

  it("rolls over a month boundary when naming tomorrow", () => {
    expect(eventDayLabel("2026-12-01", new Date(2026, 10, 30, 9, 0, 0))).toBe("Tomorrow");
  });
});

describe("isEventPast", () => {
  const allDay = (start: string, end: string): CalendarEvent =>
    ({ id: "e", title: "e", start, end }) as CalendarEvent;
  const timed = (start: string, end: string): CalendarEvent =>
    ({ id: "e", title: "e", start, end }) as CalendarEvent;

  it("keeps a multi-day all-day event visible on its second day", () => {
    // The bug this replaces: web judged all-day events by their start, so a
    // 10-13 Nov event was filtered out of the agenda from the 11th onward while
    // it was still running.
    const conference = allDay("2026-11-10", "2026-11-14"); // Google end is exclusive
    expect(isEventPast(conference, new Date(2026, 10, 11, 9, 0))).toBe(false);
    expect(isEventPast(conference, new Date(2026, 10, 13, 23, 0))).toBe(false);
  });

  it("drops a multi-day all-day event once its exclusive end arrives", () => {
    const conference = allDay("2026-11-10", "2026-11-14");
    expect(isEventPast(conference, new Date(2026, 10, 14, 0, 0))).toBe(true);
  });

  it("keeps a single all-day event for the whole day it covers", () => {
    const day = allDay("2026-11-16", "2026-11-17");
    expect(isEventPast(day, new Date(2026, 10, 16, 23, 59))).toBe(false);
    expect(isEventPast(day, new Date(2026, 10, 17, 0, 0))).toBe(true);
  });

  it("never hides an all-day event stored with an inclusive end", () => {
    // end === start would otherwise read as "ended at midnight this morning".
    const day = allDay("2026-11-16", "2026-11-16");
    expect(isEventPast(day, new Date(2026, 10, 16, 12, 0))).toBe(false);
    expect(isEventPast(day, new Date(2026, 10, 17, 0, 0))).toBe(true);
  });

  it("judges a timed event by its end", () => {
    const meeting = timed(
      new Date(2026, 10, 16, 9, 0).toISOString(),
      new Date(2026, 10, 16, 10, 0).toISOString(),
    );
    expect(isEventPast(meeting, new Date(2026, 10, 16, 9, 30))).toBe(false);
    expect(isEventPast(meeting, new Date(2026, 10, 16, 10, 1))).toBe(true);
  });
});
