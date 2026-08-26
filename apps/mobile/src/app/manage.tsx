import {
  type Challenge,
  type Goal,
  type Reminder,
  type SportActivity,
  type Task,
  archiveChallenge,
  computeChallengeProgress,
  computeGoalProgress,
  deleteChallenge,
  deleteGoal,
  deleteReminderEverywhere,
  deleteTask,
  setGoalStatus,
  setTaskStatus,
  subscribeChallenges,
  subscribeGoals,
  subscribeReminders,
  subscribeSportActivities,
  subscribeTasks,
  syncReminderToCalendar,
  updateChallenge,
  updateGoal,
  updateReminder,
  updateTask,
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
import { webApiClient } from '@/lib/webApiClient';

function RenameField({ value, onSave, style }: { value: string; onSave: (next: string) => void; style?: object }) {
  const theme = useTheme();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <Pressable
        style={{ flex: 1 }}
        onPress={() => {
          setDraft(value);
          setEditing(true);
        }}>
        <ThemedText type="small" numberOfLines={1} style={style}>
          {value}
        </ThemedText>
      </Pressable>
    );
  }

  function commit() {
    if (draft.trim() && draft.trim() !== value) onSave(draft.trim());
    setEditing(false);
  }

  return (
    <TextInput
      autoFocus
      value={draft}
      onChangeText={setDraft}
      onBlur={commit}
      onSubmitEditing={commit}
      style={[
        styles.renameInput,
        { flex: 1, color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
      ]}
    />
  );
}

function SectionHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <View style={{ gap: 2 }}>
      <ThemedText type="code" themeColor="primary" style={styles.eyebrow}>
        {eyebrow}
      </ThemedText>
      <ThemedText type="subtitle">{title}</ThemedText>
    </View>
  );
}

function TasksSection({ uid }: { uid: string }) {
  const theme = useTheme();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!db) return;
    return subscribeTasks(db, uid, setTasks);
  }, [uid]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulkMarkDone() {
    if (!db) return;
    await Promise.all([...selected].map((id) => setTaskStatus(db!, uid, id, 'done')));
    setSelected(new Set());
  }

  async function bulkDelete() {
    if (!db) return;
    await Promise.all([...selected].map((id) => deleteTask(db!, uid, id)));
    setSelected(new Set());
  }

  async function clearCompleted() {
    if (!db) return;
    const done = tasks.filter((t) => t.status === 'done');
    await Promise.all(done.map((t) => deleteTask(db!, uid, t.id)));
  }

  return (
    <View style={{ gap: Spacing.two }}>
      <View style={styles.sectionHeaderRow}>
        <SectionHeader eyebrow="Today" title="Tasks" />
        <Pressable onPress={clearCompleted} style={[styles.smallOutlineButton, { borderColor: theme.border }]}>
          <ThemedText type="small" style={{ fontWeight: '700' }}>
            Clear completed
          </ThemedText>
        </Pressable>
      </View>
      {selected.size > 0 && (
        <View style={[styles.bulkBar, { borderColor: theme.primary, backgroundColor: theme.accent }]}>
          <ThemedText type="small" style={{ fontWeight: '700' }}>
            {selected.size} selected
          </ThemedText>
          <Pressable onPress={bulkMarkDone}>
            <ThemedText type="small" themeColor="primary" style={{ fontWeight: '700' }}>
              Mark done
            </ThemedText>
          </Pressable>
          <Pressable onPress={bulkDelete}>
            <ThemedText type="small" style={styles.deleteText}>
              Delete
            </ThemedText>
          </Pressable>
          <Pressable onPress={() => setSelected(new Set())} style={{ marginLeft: 'auto' }}>
            <ThemedText type="small" themeColor="textSecondary">
              Clear
            </ThemedText>
          </Pressable>
        </View>
      )}
      <View style={{ gap: Spacing.one }}>
        {tasks.map((task) => (
          <View key={task.id} style={[styles.row, { borderColor: theme.border }]}>
            <Pressable onPress={() => toggle(task.id)} style={[styles.checkbox, { borderColor: theme.border, backgroundColor: selected.has(task.id) ? theme.primary : 'transparent' }]} />
            <RenameField
              value={task.title}
              onSave={(next) => db && updateTask(db, uid, task.id, { title: next })}
              style={task.status === 'done' ? styles.doneText : undefined}
            />
            <ThemedText type="code" themeColor="textSecondary">
              {task.status}
            </ThemedText>
            <Pressable onPress={() => db && deleteTask(db, uid, task.id)}>
              <ThemedText type="small" style={styles.deleteText}>
                Delete
              </ThemedText>
            </Pressable>
          </View>
        ))}
        {tasks.length === 0 && (
          <ThemedText themeColor="textSecondary" style={styles.emptyText}>
            No tasks.
          </ThemedText>
        )}
      </View>
    </View>
  );
}

function GoalsSection({ uid }: { uid: string }) {
  const theme = useTheme();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    if (!db) return;
    return subscribeGoals(db, uid, setGoals);
  }, [uid]);
  useEffect(() => {
    if (!db) return;
    return subscribeTasks(db, uid, setTasks);
  }, [uid]);

  return (
    <View style={{ gap: Spacing.two }}>
      <SectionHeader eyebrow="Long-term" title="Goals" />
      <View style={{ gap: Spacing.one }}>
        {goals.map((goal) => {
          const progress = computeGoalProgress(goal, tasks);
          return (
            <View key={goal.id} style={[styles.row, { borderColor: theme.border }]}>
              <RenameField value={goal.title} onSave={(next) => db && updateGoal(db, uid, goal.id, { title: next })} />
              <ThemedText type="code" themeColor="textSecondary">
                {progress.completedTaskCount}/{progress.linkedTaskCount} · {goal.status}
              </ThemedText>
              {goal.status === 'active' && (
                <Pressable onPress={() => db && setGoalStatus(db, uid, goal.id, 'completed')}>
                  <ThemedText type="small" themeColor="primary">
                    Complete
                  </ThemedText>
                </Pressable>
              )}
              <Pressable onPress={() => db && setGoalStatus(db, uid, goal.id, 'archived')}>
                <ThemedText type="small" themeColor="textSecondary">
                  Archive
                </ThemedText>
              </Pressable>
              <Pressable onPress={() => db && deleteGoal(db, uid, goal.id)}>
                <ThemedText type="small" style={styles.deleteText}>
                  Delete
                </ThemedText>
              </Pressable>
            </View>
          );
        })}
        {goals.length === 0 && (
          <ThemedText themeColor="textSecondary" style={styles.emptyText}>
            No goals.
          </ThemedText>
        )}
      </View>
    </View>
  );
}

function ChallengesSection({ uid }: { uid: string }) {
  const theme = useTheme();
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [activities, setActivities] = useState<SportActivity[]>([]);

  useEffect(() => {
    if (!db) return;
    return subscribeChallenges(db, uid, setChallenges);
  }, [uid]);
  useEffect(() => {
    if (!db) return;
    return subscribeSportActivities(db, uid, setActivities);
  }, [uid]);

  return (
    <View style={{ gap: Spacing.two }}>
      <SectionHeader eyebrow="Streaks" title="Challenges" />
      <View style={{ gap: Spacing.one }}>
        {challenges.map((challenge) => {
          const progress = computeChallengeProgress(challenge, activities);
          return (
            <View key={challenge.id} style={[styles.row, { borderColor: theme.border }]}>
              <RenameField
                value={challenge.title}
                onSave={(next) => db && updateChallenge(db, uid, challenge.id, { title: next })}
              />
              <ThemedText type="code" themeColor="textSecondary">
                {progress.currentStreak}d{challenge.archived ? ' · archived' : ''}
              </ThemedText>
              {!challenge.archived && (
                <Pressable onPress={() => db && archiveChallenge(db, uid, challenge.id)}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Archive
                  </ThemedText>
                </Pressable>
              )}
              <Pressable onPress={() => db && deleteChallenge(db, uid, challenge.id)}>
                <ThemedText type="small" style={styles.deleteText}>
                  Delete
                </ThemedText>
              </Pressable>
            </View>
          );
        })}
        {challenges.length === 0 && (
          <ThemedText themeColor="textSecondary" style={styles.emptyText}>
            No challenges.
          </ThemedText>
        )}
      </View>
    </View>
  );
}

function RemindersSection({ uid }: { uid: string }) {
  const theme = useTheme();
  const [reminders, setReminders] = useState<Reminder[]>([]);

  useEffect(() => {
    if (!db) return;
    return subscribeReminders(db, uid, setReminders);
  }, [uid]);

  async function rename(reminderId: string, title: string) {
    if (!db) return;
    await updateReminder(db, uid, reminderId, { title });
    syncReminderToCalendar(webApiClient, reminderId).catch((err) =>
      console.error('Could not sync reminder to Google Calendar', err),
    );
  }

  return (
    <View style={{ gap: Spacing.two }}>
      <SectionHeader eyebrow="Deadlines" title="Reminders" />
      <View style={{ gap: Spacing.one }}>
        {reminders.map((reminder) => (
          <View key={reminder.id} style={[styles.row, { borderColor: theme.border }]}>
            <RenameField value={reminder.title} onSave={(next) => rename(reminder.id, next)} />
            <ThemedText type="code" themeColor="textSecondary">
              {new Date(reminder.deadline).toLocaleDateString()}
            </ThemedText>
            <Pressable onPress={() => deleteReminderEverywhere(webApiClient, reminder.id)}>
              <ThemedText type="small" style={styles.deleteText}>
                Delete
              </ThemedText>
            </Pressable>
          </View>
        ))}
        {reminders.length === 0 && (
          <ThemedText themeColor="textSecondary" style={styles.emptyText}>
            No reminders.
          </ThemedText>
        )}
      </View>
    </View>
  );
}

export default function ManageScreen() {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <ThemedText type="code" themeColor="primary" style={styles.eyebrow}>
            Everything
          </ThemedText>
          <ThemedText type="subtitle">Manage</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            A single place to review and edit everything you&apos;ve created.
          </ThemedText>
        </View>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <TasksSection uid={user.uid} />
          <GoalsSection uid={user.uid} />
          <ChallengesSection uid={user.uid} />
          <RemindersSection uid={user.uid} />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four },
  header: { marginTop: Spacing.four, gap: Spacing.one },
  eyebrow: { letterSpacing: 2, textTransform: 'uppercase' },
  scrollContent: { paddingVertical: Spacing.four, gap: Spacing.four },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  smallOutlineButton: { borderWidth: 2, borderRadius: Spacing.two, paddingHorizontal: Spacing.two, paddingVertical: Spacing.half },
  bulkBar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, borderWidth: 2, borderRadius: Spacing.two, padding: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderWidth: 2, borderRadius: Spacing.two, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one + Spacing.half },
  checkbox: { width: 16, height: 16, borderWidth: 2, borderRadius: 4 },
  renameInput: { borderWidth: 2, borderRadius: Spacing.half, paddingHorizontal: Spacing.one, paddingVertical: 2 },
  doneText: { textDecorationLine: 'line-through' },
  deleteText: { color: '#dc2626' },
  emptyText: { textAlign: 'center', paddingVertical: Spacing.three },
});
