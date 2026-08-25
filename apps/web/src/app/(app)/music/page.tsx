"use client";

import {
  type NowPlayingTrack,
  type SpotifySummary,
  getNowPlaying,
  subscribeSpotifySummary,
  syncSpotifyNow,
} from "@life-client/shared";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import { webApiClient } from "@/lib/webApiClient";

const NOW_PLAYING_POLL_MS = 15_000;

function SectionHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <p className="font-mono text-xs font-bold tracking-[0.3em] text-primary uppercase">{eyebrow}</p>
      <h2 className="mt-1 text-xl font-bold tracking-tight">{title}</h2>
    </div>
  );
}

function NowPlayingSection() {
  const { user } = useAuth();
  const [nowPlaying, setNowPlaying] = useState<NowPlayingTrack | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function poll() {
      try {
        const result = await getNowPlaying(webApiClient);
        if (!cancelled) {
          setNowPlaying(result);
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

  return (
    <section className="flex flex-col gap-3">
      <SectionHeader eyebrow="Live" title="Now Playing" />
      {error && <p className="text-sm text-red-600">{error}</p>}
      {nowPlaying?.isPlaying && nowPlaying.track ? (
        <div className="flex items-center gap-4 rounded-md border-2 border-foreground bg-surface p-4">
          {nowPlaying.track.albumArtUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={nowPlaying.track.albumArtUrl}
              alt=""
              className="h-16 w-16 shrink-0 rounded-md border-2 border-foreground"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold">{nowPlaying.track.name}</p>
            <p className="truncate text-sm text-muted">{nowPlaying.track.artists}</p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full border border-foreground/30 bg-background">
              <div
                className="h-full bg-primary"
                style={{
                  width: `${Math.min(100, (nowPlaying.track.progressMs / nowPlaying.track.durationMs) * 100)}%`,
                }}
              />
            </div>
          </div>
        </div>
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
        <button
          type="button"
          onClick={handleSync}
          disabled={syncing}
          className="shrink-0 rounded-md border-2 border-foreground px-3 py-1.5 font-mono text-xs font-bold uppercase hover:bg-accent/20 disabled:opacity-50"
        >
          {syncing ? "Syncing…" : "Sync now"}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <ul className="flex flex-col gap-2">
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
        <div className="rounded-md border-2 border-foreground bg-surface p-4">
          <p className="font-mono text-xs font-bold text-primary uppercase">Recent listening</p>
          <p className="mt-1 text-2xl font-bold">{summary?.totalMinutesRecent ?? 0} min</p>
          <p className="text-sm text-muted">across your last {summary?.recentTracks.length ?? 0} tracks</p>
        </div>
        <div className="rounded-md border-2 border-foreground bg-surface p-4">
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
        </div>
      </div>
    </section>
  );
}

export default function MusicPage() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<SpotifySummary | null>(null);

  useEffect(() => {
    if (!user || !db) return;
    return subscribeSpotifySummary(db, user.uid, setSummary);
  }, [user]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-10">
      <div>
        <p className="font-mono text-xs font-bold tracking-[0.3em] text-primary uppercase">Listen</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Music</h1>
        <p className="text-sm text-muted">Your Spotify listening — live, recent, and in aggregate.</p>
      </div>
      <NowPlayingSection />
      <RecentTracksSection summary={summary} />
      <StatsSection summary={summary} />
    </div>
  );
}
