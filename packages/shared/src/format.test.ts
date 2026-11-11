import { describe, expect, it } from "vitest";
import { formatDistance, formatDuration, formatMoney, formatMoneyShort } from "./format";

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
