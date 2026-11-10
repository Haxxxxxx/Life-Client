import { describe, expect, it } from "vitest";
import { daysUntil, isDueSoon, reminderUrgency } from "./reminders";

// Fixed local reference point: Tue 10 Nov 2026, 09:00 local time.
// Constructed from parts (not an ISO string) so the test means 09:00 *local*
// regardless of the machine's timezone.
const NOW = new Date(2026, 10, 10, 9, 0, 0);

/** Local datetime -> the ISO string shape the app actually stores. */
function at(year: number, month1: number, day: number, hour = 0, minute = 0): string {
  return new Date(year, month1 - 1, day, hour, minute).toISOString();
}

describe("daysUntil", () => {
  it("counts calendar days, not 24-hour periods", () => {
    // The whole point of the fix: any time later today is still 0 days away.
    expect(daysUntil(at(2026, 11, 10, 17, 0), NOW)).toBe(0);
    expect(daysUntil(at(2026, 11, 10, 9, 30), NOW)).toBe(0);
    expect(daysUntil(at(2026, 11, 10, 23, 59), NOW)).toBe(0);
  });

  it("counts earlier-today as today, not as a day in the past", () => {
    expect(daysUntil(at(2026, 11, 10, 8, 30), NOW)).toBe(0);
    expect(daysUntil(at(2026, 11, 10, 0, 1), NOW)).toBe(0);
  });

  it("counts whole days forward and backward", () => {
    expect(daysUntil(at(2026, 11, 11, 0, 1), NOW)).toBe(1);
    expect(daysUntil(at(2026, 11, 12, 23, 0), NOW)).toBe(2);
    expect(daysUntil(at(2026, 11, 17, 9, 0), NOW)).toBe(7);
    expect(daysUntil(at(2026, 11, 9, 23, 59), NOW)).toBe(-1);
    expect(daysUntil(at(2026, 11, 3, 9, 0), NOW)).toBe(-7);
  });

  it("crosses month and year boundaries", () => {
    expect(daysUntil(at(2026, 12, 1, 9, 0), new Date(2026, 10, 30, 9, 0))).toBe(1);
    expect(daysUntil(at(2027, 1, 1, 9, 0), new Date(2026, 11, 31, 23, 0))).toBe(1);
  });

  it("returns 0 rather than NaN for an unparseable deadline", () => {
    expect(daysUntil("not a date", NOW)).toBe(0);
  });
});

describe("reminderUrgency", () => {
  it("reports something due later today as due-today", () => {
    // Regression: the old ms-division returned 1 here, so this read "due-soon"
    // and nothing genuinely due today ever reached the due-today bucket.
    expect(reminderUrgency(at(2026, 11, 10, 17, 0), NOW)).toBe("due-today");
    expect(reminderUrgency(at(2026, 11, 10, 9, 30), NOW)).toBe("due-today");
    expect(reminderUrgency(at(2026, 11, 10, 23, 59), NOW)).toBe("due-today");
  });

  it("reports anything already past as overdue, including earlier today", () => {
    // Regression: Math.ceil(-0.02) is -0 and -0 === 0, so these used to report
    // as "due-today"; "overdue" only kicked in after a full 24 hours.
    expect(reminderUrgency(at(2026, 11, 10, 8, 30), NOW)).toBe("overdue");
    expect(reminderUrgency(at(2026, 11, 10, 0, 1), NOW)).toBe("overdue");
    expect(reminderUrgency(at(2026, 11, 9, 10, 0), NOW)).toBe("overdue");
    expect(reminderUrgency(at(2026, 11, 1, 9, 0), NOW)).toBe("overdue");
  });

  it("buckets the next two days as due-soon and beyond that as upcoming", () => {
    expect(reminderUrgency(at(2026, 11, 11, 8, 0), NOW)).toBe("due-soon");
    expect(reminderUrgency(at(2026, 11, 12, 23, 0), NOW)).toBe("due-soon");
    expect(reminderUrgency(at(2026, 11, 13, 0, 1), NOW)).toBe("upcoming");
    expect(reminderUrgency(at(2026, 12, 25, 9, 0), NOW)).toBe("upcoming");
  });

  it("never reports a future deadline as overdue", () => {
    for (let hour = 10; hour < 24; hour++) {
      expect(reminderUrgency(at(2026, 11, 10, hour, 0), NOW)).not.toBe("overdue");
    }
  });

  it("covers every instant of today with exactly overdue or due-today", () => {
    for (let hour = 0; hour < 24; hour++) {
      const urgency = reminderUrgency(at(2026, 11, 10, hour, 0), NOW);
      expect(["overdue", "due-today"]).toContain(urgency);
    }
  });
});

describe("isDueSoon", () => {
  it("is true for overdue, today and the next two days", () => {
    expect(isDueSoon(at(2026, 11, 9, 9, 0), NOW)).toBe(true);
    expect(isDueSoon(at(2026, 11, 10, 17, 0), NOW)).toBe(true);
    expect(isDueSoon(at(2026, 11, 12, 9, 0), NOW)).toBe(true);
  });

  it("is false further out", () => {
    expect(isDueSoon(at(2026, 11, 13, 9, 0), NOW)).toBe(false);
  });
});
