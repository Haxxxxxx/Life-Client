import {
  computeChallengeProgress,
  subscribeChallenges,
  subscribeHabitLogs,
  subscribeJournalEntries,
  subscribeSportActivities,
  subscribeTasks,
  subscribeTransactions,
  subscribeViceLogs,
  type Challenge,
  type HabitLog,
  type JournalEntry,
  type SportActivity,
  type Task,
  type Transaction,
  type ViceLog,
} from '@life-client/shared';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { db } from '@/lib/firebase';

type Period = 'week' | 'month';

function periodRange(period: Period): { start: string; end: string } {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const toStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const end = toStr(now);
  if (period === 'week') {
    const start = new Date(now);
    start.setDate(start.getDate() - 6);
    return { start: toStr(start), end };
  }
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { start: toStr(start), end };
}

function inRange(dateStr: string, range: { start: string; end: string }): boolean {
  const d = dateStr.slice(0, 10);
  return d >= range.start && d <= range.end;
}

function formatMoney(amount: number): string {
  return amount.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

function StatTile({ value, label }: { value: string | number; label: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.statTile, { borderColor: theme.border }]}>
      <ThemedText type="title" style={styles.statValue}>
        {value}
      </ThemedText>
      <ThemedText type="code" themeColor="textSecondary" style={styles.statLabel}>
        {label}
      </ThemedText>
    </View>
  );
}

export default function ReviewScreen() {
  const { user } = useAuth();
  const theme = useTheme();
  const [period, setPeriod] = useState<Period>('week');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [viceLogs, setViceLogs] = useState<ViceLog[]>([]);
  const [habitLogs, setHabitLogs] = useState<HabitLog[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [activities, setActivities] = useState<SportActivity[]>([]);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  useEffect(() => {
    if (!user || !db) return;
    const unsubs = [
      subscribeTasks(db, user.uid, setTasks),
      subscribeViceLogs(db, user.uid, setViceLogs),
      subscribeHabitLogs(db, user.uid, setHabitLogs),
      subscribeChallenges(db, user.uid, setChallenges),
      subscribeSportActivities(db, user.uid, setActivities),
      subscribeJournalEntries(db, user.uid, setJournalEntries),
      subscribeTransactions(db, user.uid, setTransactions),
    ];
    return () => unsubs.forEach((u) => u());
  }, [user]);

  const range = periodRange(period);

  const tasksCompleted = tasks.filter((t) => t.status === 'done' && inRange(t.updatedAt, range)).length;
  const viceLogsInRange = viceLogs.filter((v) => inRange(v.createdAt, range));
  const viceCompensated = viceLogsInRange.filter((v) => v.compensated).length;
  const habitCheckIns = habitLogs.filter((l) => inRange(l.date, range)).length;
  const challengeDaysCompleted = challenges
    .filter((c) => !c.archived)
    .reduce((sum, c) => {
      const progress = computeChallengeProgress(c, activities);
      return sum + progress.days.filter((d) => d.completed && inRange(d.date, range)).length;
    }, 0);
  const journalCount = journalEntries.filter((j) => inRange(j.createdAt, range)).length;
  const moneySpent = transactions
    .filter((t) => t.type === 'expense' && inRange(t.date, range))
    .reduce((sum, t) => sum + t.amount, 0);

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.headerRow}>
            <View style={styles.headerText}>
              <ThemedText type="code" themeColor="primary" style={styles.eyebrow}>
                Review
              </ThemedText>
              <ThemedText type="subtitle">Review</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {period === 'week' ? 'Last 7 days' : 'This month'} — {range.start} to {range.end}
              </ThemedText>
            </View>
          </View>

          <View style={styles.chipRow}>
            {(['week', 'month'] as const).map((p) => {
              const active = period === p;
              return (
                <Pressable
                  key={p}
                  onPress={() => setPeriod(p)}
                  style={[styles.chip, { borderColor: theme.border, backgroundColor: active ? theme.primary : 'transparent' }]}>
                  <ThemedText type="small" style={active ? { color: theme.primaryForeground, fontWeight: '700' } : undefined}>
                    {p}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.grid}>
            <StatTile value={tasksCompleted} label="Tasks completed" />
            <StatTile value={habitCheckIns} label="Habit check-ins" />
            <StatTile value={challengeDaysCompleted} label="Challenge days hit" />
            <StatTile value={journalCount} label="Journal entries" />
            <StatTile value={`${viceCompensated}/${viceLogsInRange.length}`} label="Slips compensated" />
            <StatTile value={formatMoney(moneySpent)} label="Money spent" />
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four },
  content: { paddingBottom: Spacing.six },
  headerRow: { marginTop: Spacing.four, gap: Spacing.one },
  headerText: { gap: Spacing.one },
  eyebrow: { letterSpacing: 2, textTransform: 'uppercase' },
  chipRow: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.three },
  chip: { borderWidth: 2, borderRadius: 999, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.four },
  statTile: {
    flexBasis: '47%',
    flexGrow: 1,
    borderWidth: 2,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    alignItems: 'center',
    gap: 2,
  },
  statValue: { fontSize: 24, lineHeight: 28 },
  statLabel: { textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center' },
});
