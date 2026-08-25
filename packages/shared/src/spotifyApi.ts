import type { KnowledgeApiClient } from "./knowledgeApi";
import type { NowPlayingTrack } from "./types";

/** Live proxy to Spotify's currently-playing endpoint — not part of the periodic sync, since polling this every ~15s while the Music page is open gives near-real-time status without needing frequent cron runs. */
export async function getNowPlaying(client: KnowledgeApiClient): Promise<NowPlayingTrack> {
  const token = await client.getIdToken();
  if (!token) throw new Error("Not signed in");
  const response = await fetch(`${client.baseUrl}/api/spotify/now-playing`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request to /api/spotify/now-playing failed: ${response.status}`);
  }
  return (await response.json()) as NowPlayingTrack;
}
