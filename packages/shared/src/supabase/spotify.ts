import type { SupabaseClient } from "@supabase/supabase-js";
import type { SpotifySummary, SpotifyTopArtist, SpotifyTrack } from "../types";
import { subscribeCollection } from "./realtime";

interface SpotifyRow {
  user_id: string;
  recent_tracks: SpotifyTrack[] | null;
  top_artists: SpotifyTopArtist[] | null;
  total_minutes_recent: number | null;
  last_sync_at: string | null;
}

function rowToSummary(r: SpotifyRow): SpotifySummary {
  return {
    recentTracks: r.recent_tracks ?? [],
    topArtists: r.top_artists ?? [],
    totalMinutesRecent: r.total_minutes_recent ?? 0,
    lastSyncAt: r.last_sync_at ?? "",
  };
}

export function subscribeSpotifySummarySb(
  client: SupabaseClient,
  userId: string,
  onChange: (summary: SpotifySummary | null) => void,
  onError?: (error: Error) => void,
): () => void {
  return subscribeCollection<SpotifyRow, SpotifySummary>({
    client,
    table: "spotify_summary",
    filterColumn: "user_id",
    filterValue: userId,
    rowId: (r) => r.user_id,
    map: rowToSummary,
    onChange: (rows) => onChange(rows[0] ?? null),
    onError,
  });
}
