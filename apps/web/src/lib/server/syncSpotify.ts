import type { SpotifyTopArtist, SpotifyTrack } from "@life-client/shared";
import { adminDb } from "./admin";
import { setIntegrationStatus } from "./integrationStatus";
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

export async function syncSpotifyForUser(uid: string): Promise<void> {
  const tokens = await getTokens(uid, "spotify");
  if (!tokens?.refreshToken) return;

  try {
    const { accessToken } = await ensureFreshSpotifyToken(uid, tokens);
    const response = await fetch("https://api.spotify.com/v1/me/player/recently-played?limit=20", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      throw new Error(`Spotify recently-played fetch failed: ${response.status} ${await response.text()}`);
    }
    const data = (await response.json()) as { items: SpotifyRecentlyPlayedItem[] };
    const recentTracks = data.items.map((item) => toSpotifyTrack(item.track, item.played_at));
    const topArtists = computeTopArtists(recentTracks);
    const totalMinutesRecent = Math.round(estimateListenedMs(recentTracks) / 60_000);

    await adminDb
      .collection("users")
      .doc(uid)
      .collection("spotify")
      .doc("summary")
      .set(
        { recentTracks, topArtists, totalMinutesRecent, lastSyncAt: new Date().toISOString() },
        { merge: true },
      );
    await setIntegrationStatus(uid, "spotify", { status: "connected", lastSyncAt: new Date().toISOString() });
  } catch (error) {
    console.error(`syncSpotifyForUser(${uid}) failed`, error);
    await setIntegrationStatus(uid, "spotify", {
      status: "error",
      lastError: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function syncAllSpotify(): Promise<void> {
  const uids = await allConnectedUids("spotify");
  await Promise.all(uids.map((uid) => syncSpotifyForUser(uid)));
}
