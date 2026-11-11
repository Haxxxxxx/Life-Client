import { describe, expect, it } from "vitest";
import { reminderUrgencyInZone } from "./reminders";
import {
  dateKeyInZone,
  dayKeyDifference,
  daysUntilInZone,
  isValidTimeZone,
  normalizeTimeZone,
  todayKeyInZone,
} from "./timezone";

// These assertions are independent of the machine's own zone on purpose: every
// one pins an exact instant and names the zone to read it in. That is the whole
// point of the module — the server's clock is UTC and the user's is not.

describe("dateKeyInZone", () => {
  // 2026-11-10T23:30:00Z is already the 11th in Tokyo and still the 10th in
  // Los Angeles. A UTC-clocked cron calls both "the 10th".
  const instant = new Date("2026-11-10T23:30:00Z");

  it("reads the wall-clock date in the given zone", () => {
    expect(dateKeyInZone(instant, "UTC")).toBe("2026-11-10");
    expect(dateKeyInZone(instant, "Asia/Tokyo")).toBe("2026-11-11");
    expect(dateKeyInZone(instant, "America/Los_Angeles")).toBe("2026-11-10");
  });

  it("rolls the other way before midnight UTC", () => {
    // 00:30Z is the 11th in UTC but still the 10th in New York.
    const justAfterMidnight = new Date("2026-11-11T00:30:00Z");
    expect(dateKeyInZone(justAfterMidnight, "UTC")).toBe("2026-11-11");
    expect(dateKeyInZone(justAfterMidnight, "America/New_York")).toBe("2026-11-10");
  });

  it("zero-pads months and days", () => {
    expect(dateKeyInZone(new Date("2026-01-05T12:00:00Z"), "UTC")).toBe("2026-01-05");
  });

  it("falls back to UTC for a zone the runtime does not know", () => {
    expect(dateKeyInZone(instant, "Mars/Olympus_Mons")).toBe("2026-11-10");
    expect(dateKeyInZone(instant, "")).toBe("2026-11-10");
  });

  it("throws on an invalid Date rather than returning a sentinel key", () => {
    // A "" key would sort before every real date and silently empty a digest.
    expect(() => dateKeyInZone(new Date("nonsense"), "UTC")).toThrow(RangeError);
  });

  it("handles a zone with a half-hour offset", () => {
    // Kolkata is UTC+05:30, so 19:00Z is already the next day there.
    expect(dateKeyInZone(new Date("2026-11-10T19:00:00Z"), "Asia/Kolkata")).toBe("2026-11-11");
    expect(dateKeyInZone(new Date("2026-11-10T18:00:00Z"), "Asia/Kolkata")).toBe("2026-11-10");
  });
});

describe("todayKeyInZone", () => {
  it("is dateKeyInZone against now", () => {
    const now = new Date("2026-11-10T23:30:00Z");
    expect(todayKeyInZone("Asia/Tokyo", now)).toBe("2026-11-11");
  });
});

describe("isValidTimeZone / normalizeTimeZone", () => {
  it("accepts real IANA ids and rejects the rest", () => {
    expect(isValidTimeZone("Europe/Paris")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Not/AZone")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });

  it("normalizes anything unusable to UTC", () => {
    expect(normalizeTimeZone("Europe/Paris")).toBe("Europe/Paris");
    expect(normalizeTimeZone(undefined)).toBe("UTC");
    expect(normalizeTimeZone(null)).toBe("UTC");
    expect(normalizeTimeZone("Not/AZone")).toBe("UTC");
  });
});

describe("dayKeyDifference", () => {
  it("counts whole calendar days", () => {
    expect(dayKeyDifference("2026-11-11", "2026-11-10")).toBe(1);
    expect(dayKeyDifference("2026-11-10", "2026-11-10")).toBe(0);
    expect(dayKeyDifference("2026-11-09", "2026-11-10")).toBe(-1);
  });

  it("crosses a month and a year boundary", () => {
    expect(dayKeyDifference("2026-12-01", "2026-11-30")).toBe(1);
    expect(dayKeyDifference("2027-01-01", "2026-12-31")).toBe(1);
  });

  it("is unaffected by a DST transition between the two dates", () => {
    // Europe/Paris loses an hour on 2027-03-28. Differencing date labels as
    // UTC midnights cannot see that, which is the point: a fixed ms divisor
    // over real instants would return 0.96 days and round wrong at the edges.
    expect(dayKeyDifference("2027-03-29", "2027-03-27")).toBe(2);
  });
});

describe("daysUntilInZone", () => {
  const now = new Date("2026-11-10T23:30:00Z"); // the 11th in Tokyo, the 10th in LA

  it("answers in the named zone, not the runtime's", () => {
    const deadline = "2026-11-11T12:00:00Z";
    // Tokyo has already turned over, so that deadline is today there...
    expect(daysUntilInZone(deadline, "Asia/Tokyo", now)).toBe(0);
    // ...and still tomorrow in Los Angeles.
    expect(daysUntilInZone(deadline, "America/Los_Angeles", now)).toBe(1);
  });

  it("returns 0 for an unparseable deadline", () => {
    expect(daysUntilInZone("not a date", "UTC", now)).toBe(0);
  });
});

describe("reminderUrgencyInZone", () => {
  const now = new Date("2026-11-10T23:30:00Z");

  it("buckets a deadline as due-today in the zone it is already today in", () => {
    const deadline = "2026-11-11T09:00:00Z";
    expect(reminderUrgencyInZone(deadline, "Asia/Tokyo", now)).toBe("due-today");
    expect(reminderUrgencyInZone(deadline, "America/Los_Angeles", now)).toBe("due-soon");
  });

  it("treats overdue as an instant, identically in every zone", () => {
    const past = "2026-11-10T22:00:00Z";
    expect(reminderUrgencyInZone(past, "Asia/Tokyo", now)).toBe("overdue");
    expect(reminderUrgencyInZone(past, "America/Los_Angeles", now)).toBe("overdue");
    expect(reminderUrgencyInZone(past, "UTC", now)).toBe("overdue");
  });

  it("still reaches upcoming for something far out", () => {
    expect(reminderUrgencyInZone("2026-12-25T09:00:00Z", "Europe/Paris", now)).toBe("upcoming");
  });

  it("falls back to upcoming on an unparseable deadline", () => {
    expect(reminderUrgencyInZone("nonsense", "UTC", now)).toBe("upcoming");
  });

  it("is what the digest needed: a Tokyo reminder is not missed by a UTC cron", () => {
    // The regression this module exists for. At 23:30Z it is already the 11th
    // in Tokyo; a reminder due at 09:00 on the 11th local (00:00Z) is due
    // today for that user, but a UTC-clocked urgency call puts it tomorrow and
    // the digest drops it.
    const deadline = "2026-11-11T00:00:00Z";
    expect(reminderUrgencyInZone(deadline, "Asia/Tokyo", now)).toBe("due-today");
    expect(reminderUrgencyInZone(deadline, "UTC", now)).toBe("due-soon");
  });
});
