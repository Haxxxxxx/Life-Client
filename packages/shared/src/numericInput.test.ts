import { describe, expect, it } from "vitest";
import {
  isValidDateKey,
  kilometresToMetres,
  parseDecimalInput,
  parsePositive,
  parsePositiveInt,
} from "./numericInput";

describe("parseDecimalInput", () => {
  it("accepts a comma as the decimal separator", () => {
    // The bug: Number("5,5") is NaN, and `Number(x) || 0` turned a 5.5 km run
    // into a 0 km run on any device with a comma decimal-pad.
    expect(parseDecimalInput("5,5")).toBe(5.5);
    expect(parseDecimalInput("0,25")).toBe(0.25);
  });

  it("still accepts a dot", () => {
    expect(parseDecimalInput("5.5")).toBe(5.5);
  });

  it("treats a comma as a thousands separator when a dot is present", () => {
    expect(parseDecimalInput("1,234.5")).toBe(1234.5);
  });

  it("returns null rather than 0 for unparseable input", () => {
    // Returning null forces the caller to decide; `|| 0` silently logged zeros.
    for (const bad of ["", "   ", "abc", "5km", "--1"]) {
      expect(parseDecimalInput(bad)).toBeNull();
    }
  });

  it("rejects non-finite values", () => {
    expect(parseDecimalInput("1e999")).toBeNull();
    expect(parseDecimalInput(Number.POSITIVE_INFINITY)).toBeNull();
    expect(parseDecimalInput(Number.NaN)).toBeNull();
  });

  it("passes negatives through for the caller to reject", () => {
    expect(parseDecimalInput("-5")).toBe(-5);
  });
});

describe("parsePositive", () => {
  it("rejects negatives and zero", () => {
    // A -5 km daily target made `value >= -5000` true every day, so every day
    // showed complete and the streak grew without any activity.
    expect(parsePositive("-5")).toBeNull();
    expect(parsePositive("0")).toBeNull();
    expect(parsePositive("5,5")).toBe(5.5);
  });
});

describe("parsePositiveInt", () => {
  it("rejects fractions", () => {
    // durationDays of 2.5 made completedCount/2.5 cap at 80%, so a challenge
    // could never reach 100%.
    expect(parsePositiveInt("2.5")).toBeNull();
    expect(parsePositiveInt("30")).toBe(30);
  });

  it("rejects negatives and zero", () => {
    expect(parsePositiveInt("-3")).toBeNull();
    expect(parsePositiveInt("0")).toBeNull();
  });

  it("honours a maximum", () => {
    // A year-1000 start date made dateRange iterate ~365,000 days per render.
    expect(parsePositiveInt("5000", 3660)).toBeNull();
    expect(parsePositiveInt("365", 3660)).toBe(365);
  });
});

describe("kilometresToMetres", () => {
  it("never lands below the rounded target", () => {
    // The exact failure: 2.01 * 1000 is 2009.9999999999998, so a 2.01 km
    // challenge target of 2010 was never met by logging 2.01 km.
    expect(kilometresToMetres(2.01)).toBe(2010);
    expect(2.01 * 1000).toBeLessThan(2010); // the bug, for the record
  });

  it("agrees with the stored target across every two-decimal value", () => {
    let mismatches = 0;
    for (let hundredths = 1; hundredths <= 9999; hundredths++) {
      const km = hundredths / 100;
      if (kilometresToMetres(km) < Math.round(km * 1000)) mismatches++;
    }
    expect(mismatches).toBe(0);
  });
});

describe("isValidDateKey", () => {
  it("accepts a real calendar date", () => {
    expect(isValidDateKey("2026-11-10")).toBe(true);
    expect(isValidDateKey("2028-02-29")).toBe(true); // leap year
  });

  it("rejects dates that only look valid", () => {
    // These used to be accepted and then normalised into some other date, or
    // to fail the lexicographic comparisons so a challenge never progressed.
    for (const bad of ["2026-13-45", "2026-02-30", "2027-02-29", "2026-1-5", "tomorrow", "11/10/2026"]) {
      expect(isValidDateKey(bad)).toBe(false);
    }
  });

  it("tolerates surrounding whitespace, which the old free-text field did not", () => {
    // A stored " 2026-11-10" failed the lexicographic range comparisons in
    // computeChallengeProgress, so the challenge never progressed.
    expect(isValidDateKey(" 2026-11-10")).toBe(true);
    expect(isValidDateKey("2026-11-10 ")).toBe(true);
  });
});
