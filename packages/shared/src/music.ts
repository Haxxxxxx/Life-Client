import type { NowPlayingTrack } from "./types";

/**
 * Now-playing helpers shared by both clients.
 *
 * The two music screens were byte-identical here, down to the progress-bar
 * expression that produced `width: "NaN%"` whenever Spotify reported a zero
 * duration. One definition means the guard cannot be added to one screen and
 * forgotten on the other, which is how the goal-status and agenda logic in
 * this package came to disagree.
 *
 * Kept out of spotify.ts for the same reason challengeDisplay.ts is kept out
 * of challenges.ts: that module imports firebase/firestore for its subscribe
 * helper, so anything living beside it drags the Firestore SDK into every
 * consumer. These are pure functions of their arguments.
 */

type Track = NonNullable<NowPlayingTrack["track"]>;

/** `3:07` — minutes and zero-padded seconds. Negative or non-finite input reads as `0:00`. */
export function formatTrackTime(ms: number): string {
  const totalSec = Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 1000)) : 0;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Where the track has reached by `now`, extrapolated from the last poll.
 *
 * The player is polled on an interval but the bar ticks every second, so
 * progress is the last reported position plus the time since it was fetched.
 * Clamped to the track length so a late poll cannot run the bar past the end,
 * and the elapsed term is floored at zero so a clock adjustment cannot drag it
 * backwards.
 */
export function liveTrackProgressMs(track: Track, now: number, fetchedAt: number): number {
  return Math.min(track.durationMs, track.progressMs + Math.max(0, now - fetchedAt));
}

/**
 * How far through the track the bar should be drawn, as 0..100.
 *
 * Spotify reports `duration_ms: 0` for ads and some local files, and the
 * now-playing route passes that straight through, so the obvious
 * `progress / duration * 100` evaluates to 0/0 — NaN — and both clients wrote
 * `width: "NaN%"` into the bar's style. A track with no known length simply
 * shows an empty bar instead.
 */
export function trackProgressPercent(progressMs: number, durationMs: number): number {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return 0;
  if (!Number.isFinite(progressMs) || progressMs <= 0) return 0;
  return Math.min(100, (progressMs / durationMs) * 100);
}
