// Importing this module from a Client Component is a build error, not a runtime
// surprise. Everything in lib/server/ touches firebase-admin via a service
// account and (soon) a Supabase service-role key; previously the boundary was
// held by convention alone, so one bad import would have bundled credentials
// into the browser. admin.ts initialises lazily, so the mistake would not even
// have thrown until first use.
import "server-only";

import type { SpotifyTopArtist, SpotifyTrack } from "@life-client/shared";
import { adminDb } from "./admin";
import { forEachUser, type FanOutResult } from "./fanOut";
import { briefProviderError, getSyncCursor, setIntegrationStatus } from "./integrationStatus";
import { clientIdFor, clientSecretFor, refreshAccessToken } from "./providers";
import { allConnectedUids, getTokens, storeTokens, type StoredTokens } from "./tokens";

interface SpotifyApiTrack {
  id: string;
  name: string;
  duration_ms: number;
  external_urls?: { spotify?: string };
  album?: { images?: { url: string }[] };
  artists?: { name: string }[];
}

interface SpotifyRecentlyPlayedItem {
  track: SpotifyApiTrack;
  played_at: string;
}

async function ensureFreshSpotifyToken(uid: string, tokens: StoredTokens): Promise<StoredTokens> {
  const isExpired = tokens.expiresAt !== undefined && tokens.expiresAt < Date.now() + 60_000;
  if (!isExpired || !tokens.refreshToken) return tokens;

  const refreshed = await refreshAccessToken("spotify", {
    clientId: clientIdFor("spotify"),
    clientSecret: clientSecretFor("spotify"),
    refreshToken: tokens.refreshToken,
  });
  const next: StoredTokens = {
    accessToken: refreshed.access_token as string,
    refreshToken: (refreshed.refresh_token as string | undefined) ?? tokens.refreshToken,
    expiresAt: Date.now() + (refreshed.expires_in as number) * 1000,
  };
  await storeTokens(uid, "spotify", next);
  return next;
}

/** Returns a fresh Spotify access token for the user, or null if not connected — used by the live now-playing endpoint. */
export async function getFreshSpotifyAccessToken(uid: string): Promise<string | null> {
  const tokens = await getTokens(uid, "spotify");
  if (!tokens?.refreshToken) return null;
  const fresh = await ensureFreshSpotifyToken(uid, tokens);
  return fresh.accessToken;
}

function toSpotifyTrack(item: SpotifyApiTrack, playedAt: string): SpotifyTrack {
  return {
    id: item.id,
    name: item.name,
    artists: (item.artists ?? []).map((a) => a.name).join(", "),
    albumArtUrl: item.album?.images?.[0]?.url,
    url: item.external_urls?.spotify ?? "",
    playedAt,
    durationMs: item.duration_ms,
  };
}

/**
 * Estimates actual listening time from play-start timestamps, rather than
 * summing each track's full duration — a track skipped after 10 seconds, or
 * played hours apart from the next one, shouldn't count as its whole length.
 * `tracks` must be ordered most-recent-first (Spotify's own API order).
 * Each track's contribution is capped at the real gap until the next
 * (more recent) play started; the most recent play has no later play to
 * bound it, so it's counted at its full duration.
 */
function estimateListenedMs(tracksMostRecentFirst: SpotifyTrack[]): number {
  let total = 0;
  for (let i = 0; i < tracksMostRecentFirst.length; i++) {
    const track = tracksMostRecentFirst[i]!;
    if (i === 0) {
      total += track.durationMs;
      continue;
    }
    const moreRecent = tracksMostRecentFirst[i - 1]!;
    const gapMs = new Date(moreRecent.playedAt).getTime() - new Date(track.playedAt).getTime();
    total += Math.min(track.durationMs, Math.max(0, gapMs));
  }
  return total;
}

function computeTopArtists(tracks: SpotifyTrack[]): SpotifyTopArtist[] {
  const counts = new Map<string, number>();
  for (const track of tracks) {
    for (const artist of track.artists.split(", ")) {
      if (!artist) continue;
      counts.set(artist, (counts.get(artist) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([name, playCount]) => ({ name, playCount }))
    .sort((a, b) => b.playCount - a.playCount)
    .slice(0, 5);
}

// 50 is Spotify's maximum for recently-played. The old 20 was an arbitrary
// fraction of it.
const PAGE_LIMIT = 50;
// Spotify only retains a short window of play history, so this is a bound on a
// single run rather than a backfill limit — there is nothing further back to
// fetch once it is reached.
const MAX_PAGES = 5;
/**
 * How many plays the stored summary keeps.
 *
 * The card reads "across your last N tracks" from `recentTracks.length`, so
 * widening the window stays self-describing. It was previously whatever one
 * 20-item fetch returned, which for a daily cron is roughly the last hour of
 * listening being reported as the day's total.
 */
const MAX_STORED_TRACKS = 100;

/**
 * Pages recently-played forward from `after`, newest-first on return.
 *
 * The previous single fetch of the newest 20 silently discarded everything
 * else played since the last run. Paging with a stored cursor keeps what
 * happened in between, up to the limit of what Spotify itself retains.
 */
async function fetchRecentlyPlayed(
  accessToken: string,
  after: number | undefined,
): Promise<SpotifyTrack[]> {
  const collected: SpotifyTrack[] = [];
  let cursor = after;

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL("https://api.spotify.com/v1/me/player/recently-played");
    url.searchParams.set("limit", String(PAGE_LIMIT));
    if (cursor !== undefined) url.searchParams.set("after", String(cursor));

    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) {
      throw new Error(
        `Spotify recently-played fetch failed: ${briefProviderError(response.status, await response.text())}`,
      );
    }
    const data = (await response.json()) as { items?: SpotifyRecentlyPlayedItem[] };
    const items = data.items ?? [];
    if (items.length === 0) break;

    for (const item of items) collected.push(toSpotifyTrack(item.track, item.played_at));

    // Advance past the newest play in this page. Spotify's ordering differs
    // between a cursored and an uncursored call, so take the max rather than
    // trusting a position in the array.
    const newest = Math.max(...items.map((i) => Date.parse(i.played_at)).filter(Number.isFinite));
    if (!Number.isFinite(newest)) break;
    cursor = newest;

    if (items.length < PAGE_LIMIT) break;
  }

  return collected;
}

export async function syncSpotifyForUser(uid: string): Promise<void> {
  const tokens = await getTokens(uid, "spotify");
  if (!tokens?.refreshToken) return;

  try {
    const { accessToken } = await ensureFreshSpotifyToken(uid, tokens);
    const summaryRef = adminDb.collection("users").doc(uid).collection("spotify").doc("summary");

    const storedCursor = await getSyncCursor(uid, "spotify");
    const cursorMs = storedCursor === undefined ? undefined : Number(storedCursor);
    const after = cursorMs !== undefined && Number.isFinite(cursorMs) ? cursorMs : undefined;

    const fetched = await fetchRecentlyPlayed(accessToken, after);

    // Carry forward what was already stored, so the window is a rolling
    // history rather than only whatever this one run happened to see.
    const previous = ((await summaryRef.get()).data()?.recentTracks ?? []) as SpotifyTrack[];

    // playedAt is unique per play and is what the API cursors on, so it is the
    // natural identity — the same track played twice is two entries.
    const byPlayedAt = new Map<string, SpotifyTrack>();
    for (const track of [...previous, ...fetched]) {
      if (typeof track?.playedAt === "string") byPlayedAt.set(track.playedAt, track);
    }

    // estimateListenedMs documents a most-recent-first precondition. Sorting
    // here guarantees it rather than inheriting whatever order the API and the
    // stored document happened to be in once merged.
    const recentTracks = [...byPlayedAt.values()]
      .sort((a, b) => Date.parse(b.playedAt) - Date.parse(a.playedAt))
      .slice(0, MAX_STORED_TRACKS);

    const topArtists = computeTopArtists(recentTracks);
    const totalMinutesRecent = Math.round(estimateListenedMs(recentTracks) / 60_000);

    const newestPlayedMs = recentTracks.length > 0 ? Date.parse(recentTracks[0]!.playedAt) : NaN;

    await summaryRef.set(
      { recentTracks, topArtists, totalMinutesRecent, lastSyncAt: new Date().toISOString() },
      { merge: true },
    );
    await setIntegrationStatus(uid, "spotify", {
      status: "connected",
      lastSyncAt: new Date().toISOString(),
      // Advanced only after the summary write succeeds, so a failure re-reads
      // the same window next run instead of stepping over it.
      ...(Number.isFinite(newestPlayedMs) ? { syncCursor: String(newestPlayedMs) } : {}),
    });
  } catch (error) {
    console.error(`syncSpotifyForUser(${uid}) failed`, error);
    await setIntegrationStatus(uid, "spotify", {
      status: "error",
      lastError: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function syncAllSpotify(): Promise<FanOutResult> {
  const uids = await allConnectedUids("spotify");
  return forEachUser("spotify", uids, syncSpotifyForUser);
}
