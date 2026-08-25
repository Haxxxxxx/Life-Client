import type { NowPlayingTrack } from "@life-client/shared";
import { NextRequest, NextResponse } from "next/server";
import { requireUid } from "@/lib/server/requireAuth";
import { getFreshSpotifyAccessToken } from "@/lib/server/syncSpotify";

const NOT_PLAYING: NowPlayingTrack = { isPlaying: false };

export async function GET(req: NextRequest) {
  const uid = await requireUid(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const accessToken = await getFreshSpotifyAccessToken(uid);
  if (!accessToken) return NextResponse.json(NOT_PLAYING);

  const response = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (response.status === 204 || response.status === 404) {
    return NextResponse.json(NOT_PLAYING);
  }
  if (!response.ok) {
    return NextResponse.json({ error: `Spotify now-playing fetch failed: ${response.status}` }, { status: 502 });
  }

  const data = (await response.json()) as {
    is_playing: boolean;
    progress_ms: number | null;
    item: {
      name: string;
      duration_ms: number;
      external_urls?: { spotify?: string };
      album?: { images?: { url: string }[] };
      artists?: { name: string }[];
    } | null;
  };

  if (!data.item) return NextResponse.json(NOT_PLAYING);

  const result: NowPlayingTrack = {
    isPlaying: data.is_playing,
    track: {
      name: data.item.name,
      artists: (data.item.artists ?? []).map((a) => a.name).join(", "),
      albumArtUrl: data.item.album?.images?.[0]?.url,
      url: data.item.external_urls?.spotify ?? "",
      durationMs: data.item.duration_ms,
      progressMs: data.progress_ms ?? 0,
    },
  };
  return NextResponse.json(result);
}
