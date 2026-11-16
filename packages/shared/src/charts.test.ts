import { describe, expect, it } from "vitest";
import {
  countPerDay,
  goalStatusCounts,
  lastNDays,
  monthlyMoneyTrend,
  spendingSlices,
  spendingTotal,
  startOfWeek,
  weeklySessionRows,
} from "./charts";
import type { Goal, Transaction } from "./types";

function goal(status: Goal["status"]): Goal {
  return { id: status + Math.random(), title: "g", status } as Goal;
}

function tx(date: string, type: Transaction["type"], amount: number): Transaction {
  return { id: date + type + amount, date, type, amount, category: "other" } as Transaction;
}

describe("goalStatusCounts", () => {
  it("excludes archived goals from the hit rate", () => {
    // The exact case the two clients disagreed on: web reported "2 of 10"
    // (archived in the denominator) where mobile reported 50%.
    const goals = [
      goal("completed"),
      goal("completed"),
      goal("active"),
      goal("active"),
      ...Array.from({ length: 6 }, () => goal("archived")),
    ];
    const counts = goalStatusCounts(goals);

    expect(counts).toMatchObject({ active: 2, completed: 2, archived: 6, total: 10, decided: 4 });
    expect(counts.hitRate).toBe(0.5);
  });

  it("is 0 rather than NaN when nothing has been decided", () => {
    expect(goalStatusCounts([]).hitRate).toBe(0);
    expect(goalStatusCounts([goal("archived")]).hitRate).toBe(0);
  });

  it("is 1 when every decided goal is completed", () => {
    expect(goalStatusCounts([goal("completed"), goal("archived")]).hitRate).toBe(1);
  });

  it("never exceeds 1", () => {
    const counts = goalStatusCounts(Array.from({ length: 50 }, () => goal("completed")));
    expect(counts.hitRate).toBeLessThanOrEqual(1);
  });

  it("keeps total as the full count including archived", () => {
    // `total` still counts everything — it drives the donut centre, which is
    // about how many goals exist, not how many were hit.
    expect(goalStatusCounts([goal("archived"), goal("active")]).total).toBe(2);
  });
});

describe("monthlyMoneyTrend", () => {
  const now = new Date(2026, 10, 15); // 15 Nov 2026, local

  it("buckets into the right months and nets income against spend", () => {
    const trend = monthlyMoneyTrend(
      [tx("2026-11-02", "income", 100), tx("2026-11-20", "expense", 30), tx("2026-10-05", "expense", 20)],
      6,
      now,
    );

    expect(trend.rows).toHaveLength(6);
    expect(trend.rows[5]).toMatchObject({ key: "2026-11", income: 100, spend: 30 });
    expect(trend.rows[4]).toMatchObject({ key: "2026-10", income: 0, spend: 20 });
    expect(trend.net).toBe(50);
    expect(trend.hasTrend).toBe(true);
  });

  it("reports hasTrend false when every transaction is outside the window", () => {
    // The mobile bug: it rendered six invisible bars and "Net +$0" whenever any
    // transaction existed at all, however old.
    const trend = monthlyMoneyTrend([tx("2024-01-10", "expense", 500)], 6, now);
    expect(trend.hasTrend).toBe(false);
    expect(trend.net).toBe(0);
  });

  it("reports hasTrend false for no transactions", () => {
    expect(monthlyMoneyTrend([], 6, now).hasTrend).toBe(false);
  });

  it("takes the month from the date string, not a parsed Date", () => {
    // `new Date("2026-11-01")` is UTC midnight, which is October west of UTC.
    // Slicing the string keeps it in November regardless of the viewer's zone.
    const trend = monthlyMoneyTrend([tx("2026-11-01", "expense", 10)], 6, now);
    expect(trend.rows[5]).toMatchObject({ key: "2026-11", spend: 10 });
    expect(trend.rows[4]!.spend).toBe(0);
  });

  it("rolls the window over at a month boundary", () => {
    const december = monthlyMoneyTrend([tx("2026-12-01", "income", 5)], 6, new Date(2026, 11, 1));
    expect(december.rows[5]!.key).toBe("2026-12");
    expect(december.rows[0]!.key).toBe("2026-07");
    expect(december.hasTrend).toBe(true);
  });

  it("crosses a year boundary correctly", () => {
    const january = monthlyMoneyTrend([], 3, new Date(2027, 0, 10));
    expect(january.rows.map((r) => r.key)).toEqual(["2026-11", "2026-12", "2027-01"]);
  });

  it("ignores an unknown transaction type rather than counting it as spend", () => {
    const weird = { id: "x", date: "2026-11-03", type: "transfer", amount: 999, category: "other" } as unknown as Transaction;
    const trend = monthlyMoneyTrend([weird], 6, now);
    expect(trend.rows[5]).toMatchObject({ income: 0, spend: 0 });
  });

  it("handles a zero-month window without throwing", () => {
    expect(monthlyMoneyTrend([], 0, now).rows).toEqual([]);
  });
});

describe("lastNDays", () => {
  it("returns the window oldest-first, ending today", () => {
    const now = new Date(2026, 10, 11); // 11 Nov 2026, local
    expect(lastNDays(3, now)).toEqual(["2026-11-09", "2026-11-10", "2026-11-11"]);
  });

  it("crosses a month boundary", () => {
    expect(lastNDays(3, new Date(2026, 11, 1))).toEqual(["2026-11-29", "2026-11-30", "2026-12-01"]);
  });

  it("crosses a year boundary", () => {
    expect(lastNDays(2, new Date(2027, 0, 1))).toEqual(["2026-12-31", "2027-01-01"]);
  });

  it("handles a leap day", () => {
    expect(lastNDays(2, new Date(2028, 2, 1))).toEqual(["2028-02-29", "2028-03-01"]);
  });

  it("returns an empty window for a count of zero", () => {
    expect(lastNDays(0, new Date(2026, 10, 11))).toEqual([]);
  });
});

describe("countPerDay", () => {
  const days = lastNDays(3, new Date(2026, 10, 11));

  it("buckets timestamps by local day, index-aligned with days", () => {
    const at = (d: number, h: number) => new Date(2026, 10, d, h).toISOString();
    expect(countPerDay([at(9, 10), at(11, 9), at(11, 23)], days)).toEqual([1, 0, 2]);
  });

  it("ignores timestamps outside the window rather than clamping them", () => {
    // Clamping would overstate the first and last buckets.
    const outside = new Date(2026, 9, 1, 12).toISOString();
    expect(countPerDay([outside], days)).toEqual([0, 0, 0]);
  });

  it("skips unparseable timestamps instead of counting them as epoch", () => {
    expect(countPerDay(["not a date"], days)).toEqual([0, 0, 0]);
  });

  it("returns all zeros for no timestamps", () => {
    expect(countPerDay([], days)).toEqual([0, 0, 0]);
  });
});

describe("startOfWeek", () => {
  const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  it("returns the Monday of that week", () => {
    // 2026-11-11 is a Wednesday.
    expect(key(startOfWeek(new Date(2026, 10, 11)))).toBe("2026-11-09");
  });

  it("treats Sunday as the end of the week, not the start", () => {
    // (getDay() + 6) % 7 maps Sunday to 6, so it walks back six days.
    expect(key(startOfWeek(new Date(2026, 10, 15)))).toBe("2026-11-09");
  });

  it("is a no-op on a Monday", () => {
    expect(key(startOfWeek(new Date(2026, 10, 9)))).toBe("2026-11-09");
  });

  it("crosses a month boundary", () => {
    // 2026-12-01 is a Tuesday.
    expect(key(startOfWeek(new Date(2026, 11, 1)))).toBe("2026-11-30");
  });

  it("drops the time component", () => {
    const d = startOfWeek(new Date(2026, 10, 11, 23, 59));
    expect([d.getHours(), d.getMinutes(), d.getSeconds()]).toEqual([0, 0, 0]);
  });
});

describe("spendingSlices", () => {
  const tx = (category: string, amount: number, date = "2026-11-04", type = "expense") =>
    ({ id: `${category}-${amount}`, type, amount, category, date }) as unknown as Transaction;

  it("ranks categories largest first", () => {
    const out = spendingSlices([tx("food", 10), tx("rent", 90), tx("transport", 50)], "2026-11", 5);
    expect(out.map((s) => s.category)).toEqual(["rent", "transport", "food"]);
  });

  it("ignores income and other months", () => {
    const out = spendingSlices(
      [tx("food", 10), tx("food", 500, "2026-11-04", "income"), tx("rent", 999, "2026-10-04")],
      "2026-11",
      5,
    );
    expect(out).toEqual([{ category: "food", value: 10 }]);
  });

  it("sums repeat spends in one category", () => {
    const out = spendingSlices([tx("food", 10), tx("food", 15)], "2026-11", 5);
    expect(out).toEqual([{ category: "food", value: 25 }]);
  });

  it("rolls the tail into a single other slice", () => {
    const out = spendingSlices(
      [tx("rent", 50), tx("food", 40), tx("transport", 30), tx("subscription", 20), tx("entertainment", 10)],
      "2026-11",
      3,
    );
    // Two named, then everything else summed.
    expect(out).toEqual([
      { category: "rent", value: 50 },
      { category: "food", value: 40 },
      { category: "other", value: 60 },
    ]);
  });

  it("never shows the real other category twice", () => {
    // "other" is a real category as well as the roll-up label, so it has to
    // fold into the tail rather than rank as itself.
    const out = spendingSlices(
      [tx("other", 100), tx("rent", 50), tx("food", 40)],
      "2026-11",
      3,
    );
    expect(out.filter((s) => s.category === "other")).toHaveLength(1);
    expect(out.find((s) => s.category === "other")!.value).toBe(100);
  });

  it("keeps a tail of exactly one under its own name", () => {
    const out = spendingSlices([tx("rent", 50), tx("food", 40), tx("transport", 30)], "2026-11", 3);
    expect(out.map((s) => s.category)).toEqual(["rent", "food", "transport"]);
  });

  it("returns nothing when the month has no expenses", () => {
    expect(spendingSlices([], "2026-11", 5)).toEqual([]);
  });
});

describe("spendingTotal", () => {
  const tx = (amount: number, date = "2026-11-04", type = "expense") =>
    ({ id: String(amount), type, amount, category: "food", date }) as unknown as Transaction;

  it("counts every expense in the month, including rolled-up ones", () => {
    expect(spendingTotal([tx(10), tx(15), tx(5, "2026-10-01")], "2026-11")).toBe(25);
  });

  it("excludes income", () => {
    expect(spendingTotal([tx(10), tx(999, "2026-11-04", "income")], "2026-11")).toBe(10);
  });
});

describe("weeklySessionRows", () => {
  // Wed 18 Nov 2026, so the current week opens on Mon the 16th.
  const now = new Date(2026, 10, 18, 9, 0, 0);
  const act = (y: number, m: number, d: number, kind: "endurance" | "strength" = "endurance") => ({
    startDate: new Date(y, m, d, 12, 0, 0).toISOString(),
    kind,
  });

  it("returns one row per week, oldest first, ending with the week containing now", () => {
    const rows = weeklySessionRows([], 4, now);
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.start.getDate())).toEqual([26, 2, 9, 16]);
    expect(rows.every((r) => r.start.getDay() === 1)).toBe(true);
  });

  it("gives all-zero weeks rather than an empty list when nothing is logged", () => {
    // Both charts read weeks[weeks.length - 1] for the "this week" headline, so
    // an empty array would crash rather than render a flat trend.
    const rows = weeklySessionRows([], 3, now);
    expect(rows.map((r) => r.endurance + r.strength)).toEqual([0, 0, 0]);
  });

  it("counts each activity into its own week, by kind", () => {
    const rows = weeklySessionRows(
      [act(2026, 10, 18), act(2026, 10, 16, "strength"), act(2026, 10, 10)],
      3,
      now,
    );
    expect(rows[2]).toMatchObject({ endurance: 1, strength: 1 });
    expect(rows[1]).toMatchObject({ endurance: 1, strength: 0 });
    expect(rows[0]).toMatchObject({ endurance: 0, strength: 0 });
  });

  it("skips activities older than the window instead of piling them into the first week", () => {
    // Clamping an out-of-range activity would invent a session in a week that
    // had none - the same false reading the old truncation guard existed to
    // avoid, now impossible because nothing is dropped from the input.
    const rows = weeklySessionRows([act(2025, 0, 1), act(2026, 10, 18)], 3, now);
    expect(rows.map((r) => r.endurance)).toEqual([0, 0, 1]);
  });

  it("skips activities dated after the current week", () => {
    const rows = weeklySessionRows([act(2026, 11, 25)], 3, now);
    expect(rows.map((r) => r.endurance)).toEqual([0, 0, 0]);
  });

  it("puts a Sunday in the week it closes, not the one that follows", () => {
    // Weeks run Monday-first, so Sun 15 Nov belongs to the week of Mon 9 Nov.
    const rows = weeklySessionRows([act(2026, 10, 15)], 3, now);
    expect(rows.map((r) => r.endurance)).toEqual([0, 1, 0]);
  });

  it("counts a full run of daily sessions, not just the newest 50", () => {
    // Web's sports listener capped at 50 newest-first, so older sessions went
    // missing from this chart and from challenge progress alike.
    const daily = Array.from({ length: 60 }, (_, i) => act(2026, 10, 18 - i));
    const rows = weeklySessionRows(daily, 12, now);
    expect(rows.reduce((sum, r) => sum + r.endurance, 0)).toBe(60);
  });
});
