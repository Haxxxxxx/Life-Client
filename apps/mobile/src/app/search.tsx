import {
  type Goal,
  type Reminder,
  type Task,
} from '@life-client/shared';
import { data, visibleGoals, visibleTasks } from '@life-client/shared';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ErrorBanner } from '@/components/ui';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';

interface SearchResult {
  id: string;
  kind: 'Task' | 'Goal' | 'Reminder';
  title: string;
  href: '/tasks' | '/goals' | '/';
}

export default function SearchScreen() {
  const { user } = useAuth();
  const theme = useTheme();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);

  useEffect(() => {
    if (!user) return;
    const onError = (error: Error) => setLoadError(error.message);
    const unsubs = [
      // A failed read here used to mean search simply found nothing, which is
      // indistinguishable from "no matches" and far more misleading.
      data.subscribeTasks(user.uid, setTasks, onError),
      data.subscribeGoals(user.uid, setGoals, onError),
      data.subscribeReminders(user.uid, setReminders, onError),
    ];
    return () => unsubs.forEach((u) => u());
  }, [user]);

  const q = query.trim().toLowerCase();
  const matches = (title: string | undefined, needle: string) =>
    typeof title === 'string' && title.toLowerCase().includes(needle);
  const results: SearchResult[] = q
    ? [
        // `matches` guards the title: Firestore documents are unvalidated, so a
        // row with no title threw on .toLowerCase() and took the whole screen
        // down. Archived items are excluded, as every other view does.
        ...visibleTasks(tasks)
          .filter((t) => matches(t.title, q))
          .map((t): SearchResult => ({ id: t.id, kind: 'Task', title: t.title, href: '/tasks' })),
        ...visibleGoals(goals)
          .filter((g) => matches(g.title, q))
          .map((g): SearchResult => ({ id: g.id, kind: 'Goal', title: g.title, href: '/goals' })),
        ...reminders
          .filter((r) => matches(r.title, q))
          .map((r): SearchResult => ({ id: r.id, kind: 'Reminder', title: r.title, href: '/' })),
      ].slice(0, 50)
    : [];

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <ThemedText type="code" themeColor="primary" style={styles.eyebrow}>
            Search
          </ThemedText>
          <ThemedText type="subtitle">Search</ThemedText>
        </View>
        <TextInput
          value={query}
          onChangeText={setQuery}
          autoFocus
          placeholder="Search Tasks, Goals, Reminders…"
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { color: theme.text, borderColor: theme.borderStrong, backgroundColor: theme.background }]}
        />
        <FlatList
          data={results}
          keyExtractor={(item) => `${item.kind}-${item.id}`}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            loadError ? (
              <ErrorBanner>{`Could not load your data — ${loadError}`}</ErrorBanner>
            ) : (
              <ThemedText themeColor="textSecondary" style={styles.emptyText}>
                {q ? 'No matches.' : 'Start typing to search.'}
              </ThemedText>
            )
          }
          renderItem={({ item }) => (
            <Pressable onPress={() => router.push(item.href)} style={[styles.row, { borderColor: theme.border }]}>
              <View style={[styles.badge, { borderColor: theme.border, backgroundColor: theme.accent }]}>
                <ThemedText type="code" style={styles.badgeText}>
                  {item.kind}
                </ThemedText>
              </View>
              <ThemedText type="small" numberOfLines={1} style={{ flex: 1 }}>
                {item.title}
              </ThemedText>
            </Pressable>
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
  input: {
    marginTop: Spacing.three,
    borderWidth: 1,
    borderRadius: Spacing.two,
    // 8pt of vertical padding plus two 1pt borders and a ~20pt line box comes
    // to roughly 38pt — under Apple's 44pt and Android's 48dp touch minimum.
    // goals, profile and sports already set this; their comment claimed it
    // matched "the other eight screens", which was true of the radius and
    // padding but not of the touch target.
    minHeight: 44,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  listContent: { paddingVertical: Spacing.three, gap: Spacing.two },
  emptyText: { textAlign: 'center', paddingVertical: Spacing.five },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: 2 },
  badgeText: { fontSize: 10 },
});
