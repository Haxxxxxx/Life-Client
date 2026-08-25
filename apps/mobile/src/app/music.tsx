import {
  type NowPlayingTrack,
  type SpotifySummary,
  getNowPlaying,
  subscribeSpotifySummary,
  syncSpotifyNow,
} from '@life-client/shared';
import { useEffect, useState } from 'react';
import { AppState, Image, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { db } from '@/lib/firebase';
import { webApiClient } from '@/lib/webApiClient';

const NOW_PLAYING_POLL_MS = 15_000;

function SectionHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <ThemedText type="code" themeColor="primary" style={styles.eyebrow}>
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

    async function poll() {
      try {
        const result = await getNowPlaying(webApiClient);
        if (!cancelled) {
          setNowPlaying(result);
          setFetchedAt(Date.now());
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not reach Spotify');
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
      {error && (
        <ThemedText themeColor="text" style={styles.error}>
          {error}
        </ThemedText>
      )}
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
                    styles.progressFill,
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
        <ThemedView type="backgroundElement" style={styles.emptyState}>
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
        <Pressable onPress={handleSync} disabled={syncing} style={[styles.syncButton, { borderColor: theme.border }]}>
          <ThemedText type="small">{syncing ? 'Syncing…' : 'Sync now'}</ThemedText>
        </Pressable>
      </View>
      {error && (
        <ThemedText themeColor="text" style={styles.error}>
          {error}
        </ThemedText>
      )}
      {summary && summary.recentTracks.length > 0 ? (
        <ScrollView style={styles.trackListScroll} nestedScrollEnabled contentContainerStyle={styles.list}>
          {summary.recentTracks.map((track) => (
            <Pressable key={`${track.id}-${track.playedAt}`} onPress={() => track.url && Linking.openURL(track.url)}>
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
            </Pressable>
          ))}
        </ScrollView>
      ) : (
        <ThemedView type="backgroundElement" style={styles.emptyState}>
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
        <ThemedText type="code" themeColor="primary" style={styles.eyebrow}>
          Recent listening
        </ThemedText>
        <ThemedText type="title" style={styles.bigNumber}>
          {summary?.totalMinutesRecent ?? 0} min
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          across your last {summary?.recentTracks.length ?? 0} tracks
        </ThemedText>
      </ThemedView>
      <View style={styles.chipRow}>
        {(summary?.topArtists ?? []).map((artist) => (
          <View key={artist.name} style={[styles.chip, { borderColor: theme.border, backgroundColor: theme.accent }]}>
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

  useEffect(() => {
    if (!user || !db) return;
    return subscribeSpotifySummary(db, user.uid, setSummary);
  }, [user]);

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <ThemedText type="code" themeColor="primary" style={styles.eyebrow}>
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
  screen: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four },
  content: { gap: Spacing.four, paddingBottom: Spacing.four },
  header: { marginTop: Spacing.four, gap: Spacing.one },
  eyebrow: { letterSpacing: 2, textTransform: 'uppercase' },
  section: { gap: Spacing.two },
  sectionHeader: { gap: 2 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: Spacing.two },
  syncButton: { borderWidth: 2, borderRadius: Spacing.two, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one },
  error: { marginTop: Spacing.one },
  emptyState: { borderRadius: Spacing.three, padding: Spacing.five, alignItems: 'center' },
  nowPlayingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderWidth: 2,
    borderRadius: Spacing.three,
    padding: Spacing.three,
  },
  albumArt: { width: 64, height: 64, borderRadius: Spacing.two, borderWidth: 2 },
  nowPlayingInfo: { flex: 1, gap: 4, minWidth: 0 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginTop: Spacing.one },
  progressTrack: { flex: 1, height: 6, borderRadius: 999, borderWidth: 1, overflow: 'hidden' },
  progressFill: { height: '100%' },
  trackListScroll: { maxHeight: 340 },
  list: { gap: Spacing.two },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 2,
    borderRadius: Spacing.three,
    padding: Spacing.two,
  },
  trackArt: { width: 40, height: 40, borderRadius: Spacing.one, borderWidth: 2 },
  trackInfo: { flex: 1, gap: 2, minWidth: 0 },
  statsCard: { borderWidth: 2, borderRadius: Spacing.three, padding: Spacing.three, gap: 2 },
  bigNumber: { fontSize: 28 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  chip: { borderWidth: 2, borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: Spacing.half },
  chipText: { fontWeight: '700' },
});
