import {
  type Goal,
  type Reminder,
  type Task,
} from '@life-client/shared';
import { data } from '@life-client/shared';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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
  const [query, setQuery] = useState('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);

  useEffect(() => {
    if (!user) return;
    const unsubs = [
      data.subscribeTasks(user.uid, setTasks),
      data.subscribeGoals(user.uid, setGoals),
      data.subscribeReminders(user.uid, setReminders),
    ];
    return () => unsubs.forEach((u) => u());
  }, [user]);

  const q = query.trim().toLowerCase();
  const results: SearchResult[] = q
    ? [
        ...tasks.filter((t) => t.title.toLowerCase().includes(q)).map((t): SearchResult => ({ id: t.id, kind: 'Task', title: t.title, href: '/tasks' })),
        ...goals.filter((g) => g.title.toLowerCase().includes(q)).map((g): SearchResult => ({ id: g.id, kind: 'Goal', title: g.title, href: '/goals' })),
        ...reminders.filter((r) => r.title.toLowerCase().includes(q)).map((r): SearchResult => ({ id: r.id, kind: 'Reminder', title: r.title, href: '/' })),
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
          style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
        />
        <FlatList
          data={results}
          keyExtractor={(item) => `${item.kind}-${item.id}`}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <ThemedText themeColor="textSecondary" style={styles.emptyText}>
              {q ? 'No matches.' : 'Start typing to search.'}
            </ThemedText>
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
  input: { marginTop: Spacing.three, borderWidth: 2, borderRadius: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  listContent: { paddingVertical: Spacing.three, gap: Spacing.two },
  emptyText: { textAlign: 'center', paddingVertical: Spacing.five },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 2,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  badge: { borderWidth: 2, borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: 2 },
  badgeText: { fontSize: 10 },
});
