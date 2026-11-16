import {
  type NowPlayingTrack,
  type SpotifySummary,
  getNowPlaying,
  syncSpotifyNow,
} from '@life-client/shared';
import { data } from '@life-client/shared';
import { useEffect, useState } from 'react';
import { AppState, Image, Linking, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Button, ErrorBanner, PressableScale } from '@/components/ui';
import { ThemedView } from '@/components/themed-view';
import { Common } from '@/constants/styles';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { webApiClient } from '@/lib/webApiClient';

const NOW_PLAYING_POLL_MS = 15_000;

function SectionHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <ThemedText type="code" themeColor="primary" style={Common.eyebrow}>
        {eyebrow}
      </ThemedText>
      <ThemedText type="subtitle">{title}</ThemedText>
    </View>
  );
}

function formatMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function NowPlayingSection() {
  const { user } = useAuth();
  const theme = useTheme();
  const [nowPlaying, setNowPlaying] = useState<NowPlayingTrack | null>(null);
  const [fetchedAt, setFetchedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    // Sequence number, because two polls can be in flight at once: the
    // AppState "active" handler fires one while the interval may already have
    // started another. Without this an older, slower response could overwrite
    // a newer one and the UI would show a track that had already changed.
    let latest = 0;

    async function poll() {
      const seq = ++latest;
      try {
        const result = await getNowPlaying(webApiClient);
        if (!cancelled && seq === latest) {
          setNowPlaying(result);
          setFetchedAt(Date.now());
          setError(null);
        }
      } catch (err) {
        if (!cancelled && seq === latest) {
          setError(err instanceof Error ? err.message : 'Could not reach Spotify');
          // Drop the stale track rather than leaving the progress bar ticking
          // forward from an old fetchedAt for something that may have stopped.
          setNowPlaying(null);
        }
      }
    }

    poll();
    const interval = setInterval(poll, NOW_PLAYING_POLL_MS);
    // Timers pause while the app is backgrounded, so switching to Spotify and
    // back can leave this stale well past the poll interval — re-poll
    // immediately the moment the app returns to the foreground.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') poll();
    });
    return () => {
      cancelled = true;
      clearInterval(interval);
      subscription.remove();
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
    <View style={styles.section}>
      <SectionHeader eyebrow="Live" title="Now Playing" />
      <ErrorBanner>{error}</ErrorBanner>
      {nowPlaying?.isPlaying && track ? (
        <ThemedView type="backgroundElement" style={[styles.nowPlayingCard, { borderColor: theme.border }]}>
          {track.albumArtUrl && (
            <Image source={{ uri: track.albumArtUrl }} style={[styles.albumArt, { borderColor: theme.border }]} />
          )}
          <View style={styles.nowPlayingInfo}>
            <ThemedText type="smallBold" numberOfLines={1}>
              {track.name}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {track.artists}
            </ThemedText>
            <View style={styles.progressRow}>
              <View style={[styles.progressTrack, { borderColor: theme.border }]}>
                <View
                  style={[
                    Common.progressFill,
                    {
                      backgroundColor: theme.primary,
                      width: `${Math.min(100, (liveProgressMs / track.durationMs) * 100)}%`,
                    },
                  ]}
                />
              </View>
              <ThemedText type="code" themeColor="textSecondary">
                {formatMs(liveProgressMs)} / {formatMs(track.durationMs)}
              </ThemedText>
            </View>
          </View>
        </ThemedView>
      ) : (
        <ThemedView type="backgroundElement" style={[Common.emptyState, { borderColor: theme.border }]}>
          <ThemedText themeColor="textSecondary">Nothing playing right now.</ThemedText>
        </ThemedView>
      )}
    </View>
  );
}

function RecentTracksSection({ summary }: { summary: SpotifySummary | null }) {
  const theme = useTheme();
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSync() {
    setSyncing(true);
    setError(null);
    try {
      await syncSpotifyNow(webApiClient);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sync Spotify');
    } finally {
      setSyncing(false);
    }
  }

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeaderRow}>
        <SectionHeader eyebrow="History" title="Recently Played" />
        <Button
          label={syncing ? 'Syncing…' : 'Sync now'}
          onPress={handleSync}
          variant="outline"
          disabled={syncing}
        />
      </View>
      <ErrorBanner>{error}</ErrorBanner>
      {summary && summary.recentTracks.length > 0 ? (
        <ScrollView style={styles.trackListScroll} nestedScrollEnabled contentContainerStyle={styles.list}>
          {summary.recentTracks.map((track) => (
            <PressableScale key={`${track.id}-${track.playedAt}`} onPress={() => track.url && Linking.openURL(track.url)}>
              <ThemedView type="backgroundElement" style={[styles.trackRow, { borderColor: theme.border }]}>
                {track.albumArtUrl && (
                  <Image source={{ uri: track.albumArtUrl }} style={[styles.trackArt, { borderColor: theme.border }]} />
                )}
                <View style={styles.trackInfo}>
                  <ThemedText type="smallBold" numberOfLines={1}>
                    {track.name}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                    {track.artists}
                  </ThemedText>
                </View>
                <ThemedText type="code" themeColor="textSecondary">
                  {new Date(track.playedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                </ThemedText>
              </ThemedView>
            </PressableScale>
          ))}
        </ScrollView>
      ) : (
        <ThemedView type="backgroundElement" style={[Common.emptyState, { borderColor: theme.border }]}>
          <ThemedText themeColor="textSecondary">
            No listening history yet — connect Spotify from Integrations.
          </ThemedText>
        </ThemedView>
      )}
    </View>
  );
}

function StatsSection({ summary }: { summary: SpotifySummary | null }) {
  const theme = useTheme();
  return (
    <View style={styles.section}>
      <SectionHeader eyebrow="Stats" title="Top Artists" />
      <ThemedView type="backgroundElement" style={[styles.statsCard, { borderColor: theme.border }]}>
        <ThemedText type="code" themeColor="primary" style={Common.eyebrow}>
          Recent listening
        </ThemedText>
        <ThemedText type="title" style={styles.bigNumber}>
          {summary?.totalMinutesRecent ?? 0} min
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          across your last {summary?.recentTracks.length ?? 0} tracks
        </ThemedText>
      </ThemedView>
      <View style={Common.chipRow}>
        {(summary?.topArtists ?? []).map((artist) => (
          <View key={artist.name} style={[Common.chip, { borderColor: theme.border, backgroundColor: theme.accent }]}>
            <ThemedText type="small" style={styles.chipText}>
              {artist.name} · {artist.playCount}
            </ThemedText>
          </View>
        ))}
        {(!summary || summary.topArtists.length === 0) && (
          <ThemedText themeColor="textSecondary">Nothing yet.</ThemedText>
        )}
      </View>
    </View>
  );
}

export default function MusicScreen() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<SpotifySummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    return data.subscribeSpotifySummary(user.uid, setSummary, (err) => setLoadError(err.message));
  }, [user]);

  return (
    <ThemedView style={Common.screen}>
      <SafeAreaView style={Common.safeArea} edges={['top']}>
        <ErrorBanner>{loadError}</ErrorBanner>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={Common.header}>
            <ThemedText type="code" themeColor="primary" style={Common.eyebrow}>
              Listen
            </ThemedText>
            <ThemedText type="subtitle">Music</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Your Spotify listening — live, recent, and in aggregate.
            </ThemedText>
          </View>
          <NowPlayingSection />
          <RecentTracksSection summary={summary} />
          <StatsSection summary={summary} />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.four, paddingBottom: Spacing.four },
  section: { gap: Spacing.two },
  sectionHeader: { gap: 2 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: Spacing.two },
  nowPlayingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderWidth: 1,
    borderRadius: Spacing.three,
    padding: Spacing.three,
  },
  albumArt: { width: 64, height: 64, borderRadius: Spacing.two, borderWidth: 1 },
  nowPlayingInfo: { flex: 1, gap: 4, minWidth: 0 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginTop: Spacing.one },
  progressTrack: { flex: 1, height: 6, borderRadius: 999, borderWidth: 1, overflow: 'hidden' },
  trackListScroll: { maxHeight: 340 },
  list: { gap: Spacing.two },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: Spacing.three,
    padding: Spacing.two,
  },
  trackArt: { width: 40, height: 40, borderRadius: Spacing.one, borderWidth: 1 },
  trackInfo: { flex: 1, gap: 2, minWidth: 0 },
  statsCard: { borderWidth: 1, borderRadius: Spacing.three, padding: Spacing.three, gap: 2 },
  bigNumber: { fontSize: 28 },
  chipText: { fontWeight: '700' },
});
