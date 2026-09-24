"use client";

import {
  type NowPlayingTrack,
  type SpotifySummary,
  getNowPlaying,
  syncSpotifyNow,
} from "@life-client/shared";
import { data } from "@life-client/shared";
import { useEffect, useState } from "react";
import { Button, Card, ErrorText, PageHeader, SectionHeader } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { webApiClient } from "@/lib/webApiClient";

const NOW_PLAYING_POLL_MS = 15_000;

function formatMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function NowPlayingSection() {
  const { user } = useAuth();
  const [nowPlaying, setNowPlaying] = useState<NowPlayingTrack | null>(null);
  const [fetchedAt, setFetchedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function poll() {
      try {
        const result = await getNowPlaying(webApiClient);
        if (!cancelled) {
          setNowPlaying(result);
          setFetchedAt(Date.now());
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not reach Spotify");
      }
    }

    poll();
    const interval = setInterval(poll, NOW_PLAYING_POLL_MS);
    // Browsers throttle setInterval in background tabs, so switching away to
    // Spotify and back can leave this stale well past the poll interval —
    // re-poll immediately the moment the tab regains focus.
    function onVisibilityChange() {
      if (document.visibilityState === "visible") poll();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [user]);

  // Ticks every second so the progress bar/time advance live between polls,
  // instead of only jumping every NOW_PLAYING_POLL_MS.
  useEffect(() => {
    if (!nowPlaying?.isPlaying) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [nowPlaying?.isPlaying]);

  const track = nowPlaying?.track;
  const liveProgressMs = track
    ? Math.min(track.durationMs, track.progressMs + Math.max(0, now - fetchedAt))
    : 0;

  return (
    <section className="flex flex-col gap-3">
      <SectionHeader eyebrow="Live" title="Now Playing" />
      <ErrorText>{error}</ErrorText>
      {nowPlaying?.isPlaying && track ? (
        <Card className="flex items-center gap-4">
          {track.albumArtUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={track.albumArtUrl}
              alt=""
              className="h-16 w-16 shrink-0 rounded-md border-2 border-foreground"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold">{track.name}</p>
            <p className="truncate text-sm text-muted">{track.artists}</p>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full border border-foreground/30 bg-background">
                <div
                  className="h-full bg-primary"
                  style={{ width: `${Math.min(100, (liveProgressMs / track.durationMs) * 100)}%` }}
                />
              </div>
              <p className="shrink-0 font-mono text-xs text-muted">
                {formatMs(liveProgressMs)} / {formatMs(track.durationMs)}
              </p>
            </div>
          </div>
        </Card>
      ) : (
        <div className="rounded-md border-2 border-dashed border-foreground/30 px-4 py-8 text-center text-sm text-muted">
          Nothing playing right now.
        </div>
      )}
    </section>
  );
}

function RecentTracksSection({ summary }: { summary: SpotifySummary | null }) {
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSync() {
    setSyncing(true);
    setError(null);
    try {
      await syncSpotifyNow(webApiClient);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sync Spotify");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <SectionHeader eyebrow="History" title="Recently Played" />
        <Button variant="secondary" size="sm" onClick={handleSync} disabled={syncing}>
          {syncing ? "Syncing…" : "Sync now"}
        </Button>
      </div>
      <ErrorText>{error}</ErrorText>
      <ul className="flex max-h-[352px] flex-col gap-2 overflow-y-auto pr-1">
        {(summary?.recentTracks ?? []).map((track) => (
          <li
            key={`${track.id}-${track.playedAt}`}
            className="flex items-center gap-3 rounded-md border-2 border-foreground bg-surface p-3"
          >
            {track.albumArtUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={track.albumArtUrl} alt="" className="h-10 w-10 shrink-0 rounded border-2 border-foreground" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{track.name}</p>
              <p className="truncate text-xs text-muted">{track.artists}</p>
            </div>
            <p className="shrink-0 font-mono text-xs text-muted">
              {new Date(track.playedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
            </p>
          </li>
        ))}
        {(!summary || summary.recentTracks.length === 0) && (
          <li className="rounded-md border-2 border-dashed border-foreground/30 px-4 py-8 text-center text-sm text-muted">
            No listening history yet — connect Spotify from Integrations.
          </li>
        )}
      </ul>
    </section>
  );
}

function StatsSection({ summary }: { summary: SpotifySummary | null }) {
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader eyebrow="Stats" title="Top Artists" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <p className="font-mono text-xs font-bold text-primary uppercase">Recent listening</p>
          <p className="mt-1 text-2xl font-bold">{summary?.totalMinutesRecent ?? 0} min</p>
          <p className="text-sm text-muted">across your last {summary?.recentTracks.length ?? 0} tracks</p>
        </Card>
        <Card>
          <p className="mb-2 font-mono text-xs font-bold text-primary uppercase">Top artists</p>
          <div className="flex flex-wrap gap-1.5">
            {(summary?.topArtists ?? []).map((artist) => (
              <span
                key={artist.name}
                className="rounded-full border-2 border-foreground bg-accent px-2.5 py-1 font-mono text-xs font-bold"
              >
                {artist.name} · {artist.playCount}
              </span>
            ))}
            {(!summary || summary.topArtists.length === 0) && <p className="text-sm text-muted">Nothing yet.</p>}
          </div>
        </Card>
      </div>
    </section>
  );
}

export default function MusicPage() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<SpotifySummary | null>(null);

  useEffect(() => {
    if (!user) return;
    return data.subscribeSpotifySummary(user.uid, setSummary);
  }, [user]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-10">
      <PageHeader eyebrow="Listen" title="Music" description="Your Spotify listening — live, recent, and in aggregate." />
      <NowPlayingSection />
      <RecentTracksSection summary={summary} />
      <StatsSection summary={summary} />
    </div>
  );
}
