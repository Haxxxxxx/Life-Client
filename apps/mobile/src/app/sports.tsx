import { type SportActivity, subscribeSportActivities } from '@life-client/shared';
import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { db } from '@/lib/firebase';

function formatDistance(meters?: number): string {
  if (!meters) return '—';
  return `${(meters / 1000).toFixed(2)} km`;
}

function formatDuration(seconds?: number): string {
  if (!seconds) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function SportsScreen() {
  const { user } = useAuth();
  const theme = useTheme();
  const [activities, setActivities] = useState<SportActivity[]>([]);

  useEffect(() => {
    if (!user || !db) return;
    return subscribeSportActivities(db, user.uid, setActivities);
  }, [user]);

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <ThemedText type="code" themeColor="primary" style={styles.eyebrow}>
            Performance
          </ThemedText>
          <ThemedText type="subtitle">Sports</ThemedText>
          <ThemedText themeColor="textSecondary">Synced from Strava once connected.</ThemedText>
        </View>

        <FlatList
          data={activities}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <ThemedView type="backgroundElement" style={styles.emptyState}>
              <ThemedText themeColor="textSecondary">
                No activities yet. Connect Strava from the Integrations tab (or the web app) to pull
                in your runs and rides.
              </ThemedText>
            </ThemedView>
          }
          renderItem={({ item }) => (
            <ThemedView type="backgroundElement" style={[styles.card, { borderColor: theme.border }]}>
              <View style={styles.info}>
                <ThemedText type="smallBold">{item.name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {item.type} · {new Date(item.startDate).toLocaleDateString()}
                </ThemedText>
              </View>
              <View style={styles.stats}>
                <View style={styles.stat}>
                  <ThemedText type="smallBold" themeColor="primary">
                    {formatDistance(item.distanceMeters)}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    distance
                  </ThemedText>
                </View>
                <View style={styles.stat}>
                  <ThemedText type="smallBold" themeColor="primary">
                    {formatDuration(item.movingTimeSec)}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    time
                  </ThemedText>
                </View>
              </View>
            </ThemedView>
          )}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four },
  header: { marginTop: Spacing.four, gap: Spacing.one },
  eyebrow: { letterSpacing: 2, textTransform: 'uppercase' },
  listContent: { paddingVertical: Spacing.four, paddingBottom: BottomTabInset + Spacing.four, gap: Spacing.two },
  emptyState: { borderRadius: Spacing.three, padding: Spacing.five, alignItems: 'center' },
  card: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 2,
    borderRadius: Spacing.three,
    padding: Spacing.three,
  },
  info: { flex: 1, gap: 2 },
  stats: { flexDirection: 'row', gap: Spacing.three },
  stat: { alignItems: 'flex-end' },
});
