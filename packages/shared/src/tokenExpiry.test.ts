import { describe, expect, it } from "vitest";
import { expiresAtFrom } from "./tokenExpiry";

describe("expiresAtFrom", () => {
  it("reads Strava's absolute expires_at as epoch seconds", () => {
    expect(expiresAtFrom({ expires_at: 1_800_000_000 })).toBe(1_800_000_000_000);
  });

  it("reads the RFC 6749 relative expires_in as seconds from now", () => {
    const before = Date.now();
    const got = expiresAtFrom({ expires_in: 3600 })!;
    expect(got).toBeGreaterThanOrEqual(before + 3_600_000);
    expect(got).toBeLessThanOrEqual(Date.now() + 3_600_000);
  });

  it("prefers the absolute instant when a provider sends both", () => {
    // Not subject to skew between issuing and parsing.
    expect(expiresAtFrom({ expires_at: 1_800_000_000, expires_in: 3600 })).toBe(1_800_000_000_000);
  });

  // The regression this function exists for. A missing field used to produce
  // NaN, every comparison against NaN is false, so the expiry check read the
  // token as "never expires" and it was never refreshed again.
  it("returns undefined rather than NaN when neither field is present", () => {
    expect(expiresAtFrom({})).toBeUndefined();
    expect(expiresAtFrom({ access_token: "x" })).toBeUndefined();
  });

  it("returns undefined for a non-numeric or non-finite field", () => {
    expect(expiresAtFrom({ expires_in: "3600" })).toBeUndefined();
    expect(expiresAtFrom({ expires_at: null })).toBeUndefined();
    expect(expiresAtFrom({ expires_in: Number.NaN })).toBeUndefined();
    expect(expiresAtFrom({ expires_at: Number.POSITIVE_INFINITY })).toBeUndefined();
  });

  it("falls through to expires_in when expires_at is unusable", () => {
    expect(expiresAtFrom({ expires_at: "nope", expires_in: 60 })).toBeDefined();
  });

  it("passes a zero expiry through rather than treating it as absent", () => {
    // 0 is falsy but meaningful: already expired. Reporting undefined would
    // say "unknown", which is a different claim.
    expect(expiresAtFrom({ expires_at: 0 })).toBe(0);
  });
});
