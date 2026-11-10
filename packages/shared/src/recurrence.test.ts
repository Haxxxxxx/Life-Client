import { describe, expect, it } from "vitest";
import { describeRecurrence, nextOccurrenceDate } from "./recurrence";
import type { Recurrence } from "./types";

const daily = (interval = 1): Recurrence => ({ freq: "daily", interval }) as Recurrence;
const weekly = (daysOfWeek?: number[], interval = 1): Recurrence =>
  ({ freq: "weekly", interval, daysOfWeek }) as Recurrence;
const monthly = (interval = 1): Recurrence => ({ freq: "monthly", interval }) as Recurrence;

describe("nextOccurrenceDate — date-only strings", () => {
  // The regression: `new Date("2026-11-10")` is UTC midnight, but every read
  // used local getters. West of UTC the rule failed to advance at all — these
  // assertions are timezone-independent precisely because the parse is now local.
  it("advances a daily rule by one day", () => {
    expect(nextOccurrenceDate("2026-11-10", daily())).toBe("2026-11-11");
  });

  it("advances by the interval", () => {
    expect(nextOccurrenceDate("2026-11-10", daily(3))).toBe("2026-11-13");
  });

  it("crosses a month boundary", () => {
    expect(nextOccurrenceDate("2026-11-30", daily())).toBe("2026-12-01");
  });

  it("crosses a year boundary", () => {
    expect(nextOccurrenceDate("2026-12-31", daily())).toBe("2027-01-01");
  });

  it("never returns the date it was given", () => {
    // The precise shape of the bug: output === input, so nothing ever moved on.
    for (const d of ["2026-01-01", "2026-06-15", "2026-11-10", "2026-12-31"]) {
      expect(nextOccurrenceDate(d, daily())).not.toBe(d);
    }
  });
});

describe("nextOccurrenceDate — weekly", () => {
  // 2026-11-10 is a Tuesday (getDay() === 2) in local time.
  it("picks the next selected weekday later in the same week", () => {
    // Tue -> Fri
    expect(nextOccurrenceDate("2026-11-10", weekly([5]))).toBe("2026-11-13");
  });

  it("wraps to the first selected weekday next week", () => {
    // Tue, with only Monday selected -> next Monday
    expect(nextOccurrenceDate("2026-11-10", weekly([1]))).toBe("2026-11-16");
  });

  it("adds whole weeks when no weekdays are given", () => {
    expect(nextOccurrenceDate("2026-11-10", weekly(undefined, 2))).toBe("2026-11-24");
  });

  it("ignores out-of-range weekday values rather than producing a wild date", () => {
    expect(nextOccurrenceDate("2026-11-10", weekly([99]))).toBe("2026-11-17");
  });
});

describe("nextOccurrenceDate — monthly", () => {
  it("clamps to the end of a shorter month instead of overflowing", () => {
    // setMonth on the 31st used to roll into March.
    expect(nextOccurrenceDate("2026-01-31", monthly())).toBe("2026-02-28");
  });

  it("clamps into a leap February", () => {
    expect(nextOccurrenceDate("2028-01-31", monthly())).toBe("2028-02-29");
  });

  it("keeps the day when the target month is long enough", () => {
    expect(nextOccurrenceDate("2026-03-15", monthly())).toBe("2026-04-15");
  });

  it("crosses a year boundary", () => {
    expect(nextOccurrenceDate("2026-12-15", monthly())).toBe("2027-01-15");
  });
});

describe("nextOccurrenceDate — datetimes keep their time", () => {
  it("advances a datetime and returns an ISO string", () => {
    const next = nextOccurrenceDate("2026-11-10T09:30:00.000Z", daily());
    expect(next.startsWith("2026-11-11T")).toBe(true);
    expect(new Date(next).getTime() - new Date("2026-11-10T09:30:00.000Z").getTime()).toBe(86_400_000);
  });
});

describe("nextOccurrenceDate — bad input cannot throw", () => {
  // The money form accepts free text. A stored "Today" used to reach
  // toISOString() on an Invalid Date and throw a RangeError — and since the row
  // was persisted, every later render of the list threw again.
  it("returns the input unchanged rather than throwing", () => {
    for (const bad of ["Today", "Tomorrow", "not a date", "2026-13-45"]) {
      expect(() => nextOccurrenceDate(bad, daily())).not.toThrow();
      expect(nextOccurrenceDate(bad, daily())).toBe(bad);
    }
  });

  it("treats a non-finite interval as 1 rather than producing NaN-NaN-NaN", () => {
    expect(nextOccurrenceDate("2026-11-10", daily(Number.NaN))).toBe("2026-11-11");
    expect(nextOccurrenceDate("2026-11-10", daily(Number.POSITIVE_INFINITY))).toBe("2026-11-11");
  });

  it("floors a fractional interval", () => {
    expect(nextOccurrenceDate("2026-11-10", daily(2.9))).toBe("2026-11-12");
  });
});

describe("describeRecurrence", () => {
  it("reads naturally for the common cases", () => {
    expect(describeRecurrence(daily())).toBe("Every day");
    expect(describeRecurrence(daily(2))).toBe("Every 2 days");
    expect(describeRecurrence(monthly())).toBe("Every month");
    expect(describeRecurrence(weekly([1, 3, 5]))).toBe("Every week on Mo, We, Fr");
  });

  it("does not print NaN for a bad interval", () => {
    expect(describeRecurrence(daily(Number.NaN))).toBe("Every day");
  });
});
