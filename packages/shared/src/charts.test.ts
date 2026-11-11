import { describe, expect, it } from "vitest";
import { countPerDay, goalStatusCounts, lastNDays, monthlyMoneyTrend } from "./charts";
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
