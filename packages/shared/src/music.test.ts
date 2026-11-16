import { describe, expect, it } from "vitest";
import { formatTrackTime, liveTrackProgressMs, trackProgressPercent } from "./music";
import type { NowPlayingTrack } from "./types";

type Track = NonNullable<NowPlayingTrack["track"]>;

const track = (durationMs: number, progressMs: number): Track => ({
  name: "t",
  artists: "a",
  url: "",
  durationMs,
  progressMs,
});

describe("formatTrackTime", () => {
  it("renders minutes and zero-padded seconds", () => {
    expect(formatTrackTime(187_000)).toBe("3:07");
    expect(formatTrackTime(60_000)).toBe("1:00");
    expect(formatTrackTime(0)).toBe("0:00");
  });

  it("floors rather than rounds, so the clock never shows a second early", () => {
    expect(formatTrackTime(1_999)).toBe("0:01");
  });

  it("reads a negative or non-finite position as 0:00", () => {
    expect(formatTrackTime(-5_000)).toBe("0:00");
    expect(formatTrackTime(Number.NaN)).toBe("0:00");
  });

  it("keeps counting past an hour rather than wrapping", () => {
    // A long DJ set is one track; 1:05:00 would be wrong as "5:00".
    expect(formatTrackTime(3_900_000)).toBe("65:00");
  });
});

describe("liveTrackProgressMs", () => {
  it("adds the time elapsed since the last poll", () => {
    expect(liveTrackProgressMs(track(200_000, 30_000), 5_000, 2_000)).toBe(33_000);
  });

  it("never runs past the end of the track", () => {
    // A poll that lands late must not push the bar beyond 100%.
    expect(liveTrackProgressMs(track(60_000, 59_000), 100_000, 0)).toBe(60_000);
  });

  it("never runs backwards if the clock moves behind the fetch time", () => {
    expect(liveTrackProgressMs(track(200_000, 30_000), 1_000, 5_000)).toBe(30_000);
  });
});

describe("trackProgressPercent", () => {
  it("scales progress against duration", () => {
    expect(trackProgressPercent(50_000, 200_000)).toBe(25);
  });

  it("returns 0 for a zero-length track rather than NaN", () => {
    // Spotify reports duration_ms: 0 for ads and some local files, and the
    // now-playing route passes it through. Both clients were writing the
    // result straight into a width, i.e. "NaN%".
    expect(trackProgressPercent(0, 0)).toBe(0);
    expect(trackProgressPercent(10_000, 0)).toBe(0);
  });

  it("returns 0 rather than NaN for non-finite input", () => {
    expect(trackProgressPercent(Number.NaN, 200_000)).toBe(0);
    expect(trackProgressPercent(10_000, Number.NaN)).toBe(0);
  });

  it("never exceeds 100", () => {
    expect(trackProgressPercent(500_000, 200_000)).toBe(100);
  });

  it("is a real number for every pairing the clients can hand it", () => {
    for (const d of [0, -1, 1, 200_000, Number.NaN, Number.POSITIVE_INFINITY]) {
      for (const p of [0, -1, 10_000, Number.NaN, Number.POSITIVE_INFINITY]) {
        const pct = trackProgressPercent(p, d);
        expect(Number.isFinite(pct)).toBe(true);
        expect(pct).toBeGreaterThanOrEqual(0);
        expect(pct).toBeLessThanOrEqual(100);
      }
    }
  });
});
