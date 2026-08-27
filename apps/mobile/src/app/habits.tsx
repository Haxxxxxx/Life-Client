import {
  VICE_PRESETS,
  archiveHabit,
  computeHabitProgress,
  createHabit,
  deleteHabit,
  deleteViceLog,
  logHabitDay,
  logVice,
  subscribeHabitLogs,
  subscribeHabits,
  subscribeTasks,
  subscribeViceLogs,
  type Habit,
  type HabitCadence,
  type HabitLog,
  type Task,
  type ViceLog,
} from '@life-client/shared';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { db } from '@/lib/firebase';

function todayStr(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function HabitForm({
  onSubmit,
}: {
  onSubmit: (input: { title: string; cadence: HabitCadence; targetPerCadence: number; startDate: string }) => void;
}) {
  const theme = useTheme();
  const [title, setTitle] = useState('');
  const [cadence, setCadence] = useState<HabitCadence>('daily');
  const [targetPerCadence, setTargetPerCadence] = useState('1');

  return (
    <View style={[styles.form, { borderColor: theme.border }]}>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="e.g. Meditate, No phone after 10pm"
        placeholderTextColor={theme.textSecondary}
        style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
      />
      <View style={styles.chipRow}>
        {(['daily', 'weekly'] as const).map((c) => (
          <Pressable
            key={c}
            onPress={() => setCadence(c)}
            style={[styles.chip, { borderColor: theme.border, backgroundColor: cadence === c ? theme.accent : 'transparent' }]}>
            <ThemedText type="small">{c}</ThemedText>
          </Pressable>
        ))}
      </View>
      <View style={styles.intervalRow}>
        <ThemedText type="small" themeColor="textSecondary">
          target
        </ThemedText>
        <TextInput
          value={targetPerCadence}
          onChangeText={setTargetPerCadence}
          keyboardType="number-pad"
          style={[styles.intervalInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
        />
        <ThemedText type="small" themeColor="textSecondary">
          x per {cadence === 'daily' ? 'day' : 'week'}
        </ThemedText>
      </View>
      <Pressable
        disabled={!title.trim()}
        onPress={() =>
          onSubmit({
            title: title.trim(),
            cadence,
            targetPerCadence: Number(targetPerCadence) || 1,
            startDate: todayStr(),
          })
        }
        style={[styles.addButton, { backgroundColor: theme.primary, borderColor: theme.border, opacity: title.trim() ? 1 : 0.5 }]}>
        <ThemedText style={{ color: theme.primaryForeground, fontWeight: '700' }}>Start habit</ThemedText>
      </Pressable>
    </View>
  );
}

function HabitCard({
  habit,
  logs,
  onLogToday,
  onArchive,
  onDelete,
}: {
  habit: Habit;
  logs: HabitLog[];
  onLogToday: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const theme = useTheme();
  const progress = computeHabitProgress(habit, logs);
  const today = todayStr();
  const loggedToday = progress.days.some((d) => d.date === today && d.completed);

  return (
    <ThemedView type="backgroundElement" style={[styles.habitCard, { borderColor: theme.border }]}>
      <View style={styles.habitHeaderRow}>
        <View style={{ flex: 1 }}>
          <ThemedText type="smallBold">{habit.title}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {habit.targetPerCadence}x / {habit.cadence === 'daily' ? 'day' : 'week'}
          </ThemedText>
        </View>
        <View style={styles.habitActions}>
          <Pressable onPress={onArchive}>
            <ThemedText type="small" themeColor="textSecondary">
              Archive
            </ThemedText>
          </Pressable>
          <Pressable onPress={onDelete}>
            <ThemedText type="small" style={styles.deleteText}>
              Delete
            </ThemedText>
          </Pressable>
        </View>
      </View>
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <ThemedText type="smallBold" themeColor="primary">
            {progress.currentStreak}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            current streak
          </ThemedText>
        </View>
        <View style={styles.stat}>
          <ThemedText type="smallBold">{progress.longestStreak}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            longest streak
          </ThemedText>
        </View>
        <Pressable
          disabled={loggedToday}
          onPress={onLogToday}
          style={[styles.logTodayButton, { backgroundColor: theme.primary, borderColor: theme.border, opacity: loggedToday ? 0.5 : 1 }]}>
          <ThemedText type="small" style={{ color: theme.primaryForeground, fontWeight: '700' }}>
            {loggedToday ? 'Done today' : 'Log today'}
          </ThemedText>
        </Pressable>
      </View>
      <View style={styles.dayGrid}>
        {progress.days.map((day) => (
          <View
            key={day.date}
            style={[
              styles.daySquare,
              { borderColor: day.completed ? theme.primary : theme.border, backgroundColor: day.completed ? theme.primary : 'transparent' },
            ]}
          />
        ))}
      </View>
    </ThemedView>
  );
}

export default function HabitsScreen() {
  const { user } = useAuth();
  const theme = useTheme();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [logs, setLogs] = useState<HabitLog[]>([]);
  const [viceLogs, setViceLogs] = useState<ViceLog[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !db) return;
    return subscribeHabits(db, user.uid, setHabits, (err) => setError(err.message));
  }, [user]);

  useEffect(() => {
    if (!user || !db) return;
    return subscribeHabitLogs(db, user.uid, setLogs);
  }, [user]);

  useEffect(() => {
    if (!user || !db) return;
    return subscribeViceLogs(db, user.uid, setViceLogs);
  }, [user]);

  useEffect(() => {
    if (!user || !db) return;
    return subscribeTasks(db, user.uid, setTasks);
  }, [user]);

  async function handleCreate(input: { title: string; cadence: HabitCadence; targetPerCadence: number; startDate: string }) {
    if (!user || !db) return;
    setError(null);
    try {
      await createHabit(db, user.uid, input);
      setFormOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start habit');
    }
  }

  async function handleLogVice(vicePresetId: string) {
    if (!user || !db) return;
    setError(null);
    try {
      await logVice(db, user.uid, vicePresetId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not log slip');
    }
  }

  const activeHabits = habits.filter((h) => !h.archived);
  const activeViceLogs = viceLogs.filter((v) => !v.compensated);

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <ThemedText type="code" themeColor="primary" style={styles.eyebrow}>
              Habits
            </ThemedText>
            <ThemedText type="subtitle">Habits</ThemedText>
          </View>
          {!formOpen && (
            <Pressable
              onPress={() => setFormOpen(true)}
              style={[styles.logToggle, { backgroundColor: theme.primary, borderColor: theme.border }]}>
              <ThemedText type="small" style={{ color: theme.primaryForeground, fontWeight: '700' }}>
                New habit
              </ThemedText>
            </Pressable>
          )}
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {formOpen && <HabitForm onSubmit={handleCreate} />}
          {error && (
            <ThemedText themeColor="text" style={styles.error}>
              {error}
            </ThemedText>
          )}

          {activeHabits.length > 0 ? (
            <View style={{ gap: Spacing.three }}>
              {activeHabits.map((habit) => (
                <HabitCard
                  key={habit.id}
                  habit={habit}
                  logs={logs}
                  onLogToday={() => user && db && logHabitDay(db, user.uid, habit.id)}
                  onArchive={() => user && db && archiveHabit(db, user.uid, habit.id)}
                  onDelete={() => user && db && deleteHabit(db, user.uid, habit.id)}
                />
              ))}
            </View>
          ) : (
            !formOpen && (
              <ThemedView type="backgroundElement" style={styles.emptyState}>
                <ThemedText themeColor="textSecondary">
                  No habits yet — e.g. &ldquo;Meditate&rdquo; or &ldquo;No phone after 10pm&rdquo;.
                </ThemedText>
              </ThemedView>
            )
          )}

          <View style={styles.section}>
            <ThemedText type="code" themeColor="primary" style={styles.eyebrow}>
              Slipped up?
            </ThemedText>
            <ThemedText type="subtitle">Log a slip</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Docks XP from a relevant stat and auto-creates a compensating task — complete it to refund the XP.
            </ThemedText>
            <View style={styles.chipRowWrap}>
              {VICE_PRESETS.map((v) => (
                <Pressable key={v.id} onPress={() => handleLogVice(v.id)} style={[styles.chip, { borderColor: theme.border }]}>
                  <ThemedText type="small">{v.label}</ThemedText>
                </Pressable>
              ))}
            </View>
          </View>

          {activeViceLogs.length > 0 && (
            <View style={styles.section}>
              <ThemedText type="subtitle">Active slips</ThemedText>
              <View style={{ gap: Spacing.two }}>
                {activeViceLogs.map((v) => {
                  const preset = VICE_PRESETS.find((p) => p.id === v.viceId);
                  const task = tasks.find((t) => t.id === v.compensatingTaskId);
                  return (
                    <View key={v.id} style={[styles.row, { borderColor: theme.border }]}>
                      <View style={{ flex: 1 }}>
                        <ThemedText type="smallBold">{preset?.label ?? v.viceId}</ThemedText>
                        <ThemedText type="code" themeColor="textSecondary">
                          -{v.penaltyXp} XP · {task ? `${task.title} (${task.status})` : 'Task missing'}
                        </ThemedText>
                      </View>
                      <Pressable onPress={() => user && db && deleteViceLog(db, user.uid, v.id)}>
                        <ThemedText type="small" style={styles.deleteText}>
                          Dismiss
                        </ThemedText>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: Spacing.two, marginTop: Spacing.four },
  headerText: { flex: 1, gap: Spacing.one },
  eyebrow: { letterSpacing: 2, textTransform: 'uppercase' },
  logToggle: { borderWidth: 2, borderRadius: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
  scrollContent: { paddingVertical: Spacing.four, gap: Spacing.three },
  error: { marginBottom: Spacing.two },
  emptyState: { borderRadius: Spacing.three, padding: Spacing.five, alignItems: 'center' },
  form: { gap: Spacing.two, borderWidth: 2, borderStyle: 'dashed', borderRadius: Spacing.two, padding: Spacing.two },
  input: { borderWidth: 2, borderRadius: Spacing.one, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one },
  chipRow: { flexDirection: 'row', gap: Spacing.one },
  chipRowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  chip: { borderWidth: 2, borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: Spacing.half },
  intervalRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  intervalInput: { width: 44, borderWidth: 2, borderRadius: Spacing.half, paddingHorizontal: Spacing.one, paddingVertical: 2 },
  addButton: { borderWidth: 2, borderRadius: Spacing.two, paddingVertical: Spacing.two, alignItems: 'center' },
  habitCard: { borderWidth: 2, borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
  habitHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: Spacing.two },
  habitActions: { flexDirection: 'row', gap: Spacing.two },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.four },
  stat: { alignItems: 'flex-start' },
  logTodayButton: { marginLeft: 'auto', borderWidth: 2, borderRadius: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
  dayGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
  daySquare: { width: 10, height: 10, borderRadius: 2, borderWidth: 1 },
  deleteText: { color: '#dc2626' },
  section: { gap: Spacing.one },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 2,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
});
