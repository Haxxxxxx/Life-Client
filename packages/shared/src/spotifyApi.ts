import { apiRequest, type KnowledgeApiClient } from "./knowledgeApi";
import type { NowPlayingTrack } from "./types";

/** Live proxy to Spotify's currently-playing endpoint — not part of the periodic sync, since polling this every ~15s while the Music page is open gives near-real-time status without needing frequent cron runs. */
export function getNowPlaying(client: KnowledgeApiClient): Promise<NowPlayingTrack> {
  return apiRequest<NowPlayingTrack>(client, "/api/spotify/now-playing");
}

/** Refreshes recently-played/top-artists on demand, rather than waiting for the once-daily cron. */
export function syncSpotifyNow(client: KnowledgeApiClient): Promise<{ ok: true }> {
  return apiRequest<{ ok: true }>(client, "/api/spotify/sync", { method: "POST" });
}
