import {
  WEEKDAY_LABELS,
  type CalendarEvent,
  type Challenge,
  type CodeDrill,
  type DailyLesson,
  type DevActivitySummary,
  type Goal,
  type ReadingListItem,
  type Recurrence,
  type RecurrenceFreq,
  type Reminder,
  type ReminderUrgency,
  type SportActivity,
  type SpotifySummary,
  type Task,
  computeChallengeProgress,
  computeGoalProgress,
  computeInsightXp,
  daysUntil,
  deleteReminderEverywhere,
  describeRecurrence,
  isDueSoon,
  levelFromXp,
  nextOccurrenceDate,
  reminderUrgency,
  syncReminderToCalendar,
  todayLessonId,
  visibleGoals,
  visibleTasks,
  type VocabWord,
} from '@life-client/shared';
import { data } from '@life-client/shared';
import { Link, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BarTrend, ChartCard, Legend, countPerDay, lastNDays, weekdayInitial, withAlpha } from '@/components/charts';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { db } from '@/lib/firebase';
import { webApiClient } from '@/lib/webApiClient';

function Card({ title, href, children }: { title: string; href: Href; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.cardSlot}>
      <Link href={href} asChild>
        {/* Link's `asChild` merges props onto this single child via a Slot; passing a
            function to its `style` prop breaks that merge (Slot only handles plain
            style objects), so sizing lives on the wrapping View above, and this
            Pressable gets a plain object style plus the pressed state via
            function-as-children instead of function-as-style. */}
        <Pressable style={styles.cardFill}>
          {({ pressed }) => (
            <ThemedView
              type="backgroundElement"
              style={[styles.card, { borderColor: theme.border }, pressed && styles.cardPressed]}>
              <ThemedText type="code" themeColor="primary" style={styles.cardEyebrow}>
                {title}
              </ThemedText>
              {children}
            </ThemedView>
          )}
        </Pressable>
      </Link>
    </View>
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
        { flex: 1, color: theme.text, borderColor: theme.borderStrong, backgroundColor: theme.background },
      ]}
    />
  );
}

function TasksSection({ tasks, uid }: { tasks: Task[]; uid: string }) {
  const theme = useTheme();
  const [selected, setSelected] = useState<Set<string>>(new Set());

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
    await Promise.all(
      [...selected].map((id) => {
        const task = tasks.find((t) => t.id === id);
        return task ? data.advanceTaskStatus(uid, task, 'done') : undefined;
      }),
    );
    setSelected(new Set());
  }

  async function bulkDelete() {
    if (!db) return;
    await Promise.all([...selected].map((id) => data.deleteTask(uid, id)));
    setSelected(new Set());
  }

  async function clearCompleted() {
    if (!db) return;
    const done = tasks.filter((t) => t.status === 'done');
    await Promise.all(done.map((t) => data.deleteTask(uid, t.id)));
  }

  return (
    <View style={{ gap: Spacing.two }}>
      <View style={styles.sectionHeaderRow}>
        <SectionHeader eyebrow="Today" title="Tasks" />
        <View style={{ flexDirection: 'row', gap: Spacing.two }}>
          <Pressable onPress={clearCompleted} style={[styles.smallOutlineButton, { borderColor: theme.border }]}>
            <ThemedText type="small" style={{ fontWeight: '700' }}>
              Clear completed
            </ThemedText>
          </Pressable>
          <Link href="/tasks" asChild>
            <Pressable>
              <ThemedText type="small" themeColor="primary" style={{ fontWeight: '700' }}>
                Open →
              </ThemedText>
            </Pressable>
          </Link>
        </View>
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
            <Pressable
              onPress={() => toggle(task.id)}
              style={[
                styles.checkbox,
                { borderColor: theme.border, backgroundColor: selected.has(task.id) ? theme.primary : 'transparent' },
              ]}
            />
            <RenameField
              value={task.title}
              onSave={(next) => db && data.updateTask(uid, task.id, { title: next })}
              style={task.status === 'done' ? styles.doneText : undefined}
            />
            <ThemedText type="code" themeColor="textSecondary">
              {task.status}
            </ThemedText>
            {task.sourceUrl && (
              <Pressable onPress={() => Linking.openURL(task.sourceUrl!)}>
                <ThemedText type="small" themeColor="primary">
                  {task.source === 'gitlab' ? 'GitLab' : 'GitHub'} ↗
                </ThemedText>
              </Pressable>
            )}
            <Pressable onPress={() => db && data.deleteTask(uid, task.id)}>
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

function GoalsSection({ goals, tasks, uid }: { goals: Goal[]; tasks: Task[]; uid: string }) {
  const theme = useTheme();

  return (
    <View style={{ gap: Spacing.two }}>
      <View style={styles.sectionHeaderRow}>
        <SectionHeader eyebrow="Long-term" title="Goals" />
        <Link href="/goals" asChild>
          <Pressable>
            <ThemedText type="small" themeColor="primary" style={{ fontWeight: '700' }}>
              Open →
            </ThemedText>
          </Pressable>
        </Link>
      </View>
      <View style={{ gap: Spacing.one }}>
        {goals.map((goal) => {
          const progress = computeGoalProgress(goal, tasks);
          return (
            <View key={goal.id} style={[styles.row, { borderColor: theme.border }]}>
              <RenameField value={goal.title} onSave={(next) => db && data.updateGoal(uid, goal.id, { title: next })} />
              <ThemedText type="code" themeColor="textSecondary">
                {progress.completedTaskCount}/{progress.linkedTaskCount} · {goal.status}
              </ThemedText>
              {goal.status === 'active' && (
                <Pressable onPress={() => db && data.setGoalStatus(uid, goal.id, 'completed')}>
                  <ThemedText type="small" themeColor="primary">
                    Complete
                  </ThemedText>
                </Pressable>
              )}
              <Pressable onPress={() => db && data.setGoalStatus(uid, goal.id, 'archived')}>
                <ThemedText type="small" themeColor="textSecondary">
                  Archive
                </ThemedText>
              </Pressable>
              <Pressable onPress={() => db && data.deleteGoal(uid, goal.id)}>
                <ThemedText type="small" style={styles.deleteText}>
                  Delete
                </ThemedText>
              </Pressable>
            </View>
          );
        })}
        {goals.length === 0 && (
          <ThemedText themeColor="textSecondary" style={styles.emptyText}>
            No goals yet.
          </ThemedText>
        )}
      </View>
    </View>
  );
}

function ChallengesSection({
  challenges,
  activities,
  uid,
}: {
  challenges: Challenge[];
  activities: SportActivity[];
  uid: string;
}) {
  const theme = useTheme();

  return (
    <View style={{ gap: Spacing.two }}>
      <View style={styles.sectionHeaderRow}>
        <SectionHeader eyebrow="Streaks" title="Challenges" />
        <Link href="/sports" asChild>
          <Pressable>
            <ThemedText type="small" themeColor="primary" style={{ fontWeight: '700' }}>
              Open →
            </ThemedText>
          </Pressable>
        </Link>
      </View>
      <View style={{ gap: Spacing.one }}>
        {challenges.map((challenge) => {
          const progress = computeChallengeProgress(challenge, activities);
          return (
            <View key={challenge.id} style={[styles.row, { borderColor: theme.border }]}>
              <RenameField
                value={challenge.title}
                onSave={(next) => db && data.updateChallenge(uid, challenge.id, { title: next })}
              />
              <ThemedText type="code" themeColor="textSecondary">
                {progress.currentStreak}d{challenge.archived ? ' · archived' : ''}
              </ThemedText>
              {!challenge.archived && (
                <Pressable onPress={() => db && data.archiveChallenge(uid, challenge.id)}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Archive
                  </ThemedText>
                </Pressable>
              )}
              <Pressable onPress={() => db && data.deleteChallenge(uid, challenge.id)}>
                <ThemedText type="small" style={styles.deleteText}>
                  Delete
                </ThemedText>
              </Pressable>
            </View>
          );
        })}
        {challenges.length === 0 && (
          <ThemedText themeColor="textSecondary" style={styles.emptyText}>
            No challenges yet.
          </ThemedText>
        )}
      </View>
    </View>
  );
}

const QUICK_OFFSETS = [
  { label: '1d', days: 1 },
  { label: '3d', days: 3 },
  { label: '1w', days: 7 },
  { label: '2w', days: 14 },
  { label: '1mo', days: 30 },
];

const URGENCY_BORDER: Record<ReminderUrgency, string> = {
  overdue: '#dc2626',
  'due-today': 'primary',
  'due-soon': 'primary',
  upcoming: 'border',
};

function urgencyLabel(urgency: ReminderUrgency, days: number): string {
  if (urgency === 'overdue') return `Overdue ${Math.abs(days)}d`;
  if (urgency === 'due-today') return 'Today';
  return `${days}d`;
}

function RecurrencePicker({
  value,
  onChange,
}: {
  value: Recurrence | undefined;
  onChange: (next: Recurrence | undefined) => void;
}) {
  const theme = useTheme();
  const freq = value?.freq;
  const interval = value?.interval ?? 1;
  const daysOfWeek = value?.daysOfWeek ?? [];

  function setFreq(next: RecurrenceFreq | undefined) {
    if (!next) {
      onChange(undefined);
      return;
    }
    onChange({ freq: next, interval, daysOfWeek: next === 'weekly' ? daysOfWeek : undefined });
  }

  function toggleDay(day: number) {
    const next = daysOfWeek.includes(day) ? daysOfWeek.filter((d) => d !== day) : [...daysOfWeek, day];
    onChange({ freq: 'weekly', interval, daysOfWeek: next });
  }

  return (
    <View style={{ gap: Spacing.one }}>
      <View style={styles.chipRow}>
        {(['none', 'daily', 'weekly', 'monthly'] as const).map((f) => {
          const active = (f === 'none' && !freq) || f === freq;
          return (
            <Pressable
              key={f}
              onPress={() => setFreq(f === 'none' ? undefined : f)}
              style={[styles.chip, { borderColor: theme.border, backgroundColor: active ? theme.accent : 'transparent' }]}>
              <ThemedText type="small" style={active ? { fontWeight: '700' } : undefined}>
                {f === 'none' ? 'No repeat' : f}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
      {freq && (
        <View style={styles.recurrenceIntervalRow}>
          <ThemedText type="small" themeColor="textSecondary">
            every
          </ThemedText>
          <TextInput
            value={String(interval)}
            onChangeText={(text) => onChange({ freq, interval: Number(text) || 1, daysOfWeek: value?.daysOfWeek })}
            keyboardType="number-pad"
            style={[styles.intervalInput, { color: theme.text, borderColor: theme.borderStrong, backgroundColor: theme.background }]}
          />
          <ThemedText type="small" themeColor="textSecondary">
            {freq === 'daily' ? 'day(s)' : freq === 'weekly' ? 'week(s)' : 'month(s)'}
          </ThemedText>
        </View>
      )}
      {freq === 'weekly' && (
        <View style={styles.chipRow}>
          {WEEKDAY_LABELS.map((label, i) => {
            const active = daysOfWeek.includes(i);
            return (
              <Pressable
                key={i}
                onPress={() => toggleDay(i)}
                style={[styles.weekdayChip, { borderColor: theme.border, backgroundColor: active ? theme.primary : 'transparent' }]}>
                <ThemedText type="small" style={active ? { color: theme.primaryForeground, fontWeight: '700' } : undefined}>
                  {label}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

function EditReminderForm({
  reminder,
  onSave,
  onCancel,
}: {
  reminder: Reminder;
  onSave: (patch: { title: string; note?: string; deadline: string; recurrence?: Recurrence }) => void;
  onCancel: () => void;
}) {
  const theme = useTheme();
  const [title, setTitle] = useState(reminder.title);
  const [note, setNote] = useState(reminder.note ?? '');
  const [offsetDays, setOffsetDays] = useState(7);
  const [recurrence, setRecurrence] = useState<Recurrence | undefined>(reminder.recurrence);

  return (
    <View style={{ flex: 1, gap: Spacing.one }}>
      <TextInput
        value={title}
        onChangeText={setTitle}
        style={[styles.input, { color: theme.text, borderColor: theme.borderStrong, backgroundColor: theme.background }]}
      />
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="Notes"
        placeholderTextColor={theme.textSecondary}
        style={[styles.input, { color: theme.text, borderColor: theme.borderStrong, backgroundColor: theme.background }]}
      />
      <View style={styles.chipRow}>
        {QUICK_OFFSETS.map((opt) => {
          const active = opt.days === offsetDays;
          return (
            <Pressable
              key={opt.days}
              onPress={() => setOffsetDays(opt.days)}
              style={[styles.chip, { borderColor: theme.border, backgroundColor: active ? theme.primary : 'transparent' }]}>
              <ThemedText type="small" style={active ? { color: theme.primaryForeground, fontWeight: '700' } : undefined}>
                In {opt.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
      <RecurrencePicker value={recurrence} onChange={setRecurrence} />
      <View style={styles.cardActionsRow}>
        <Pressable
          onPress={() =>
            onSave({
              title: title.trim() || reminder.title,
              note: note.trim() || undefined,
              deadline: new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000).toISOString(),
              recurrence,
            })
          }>
          <ThemedText type="small" themeColor="primary" style={{ fontWeight: '700' }}>
            Save
          </ThemedText>
        </Pressable>
        <Pressable onPress={onCancel}>
          <ThemedText type="small" themeColor="textSecondary">
            Cancel
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

function RemindersSection({ reminders, uid }: { reminders: Reminder[]; uid: string }) {
  const theme = useTheme();
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [offsetDays, setOffsetDays] = useState(7);
  const [recurrence, setRecurrence] = useState<Recurrence | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  async function handleAdd() {
    if (!db || !title.trim()) return;
    setError(null);
    try {
      const deadline = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
      const reminderId = await data.createReminder(uid, {
        title: title.trim(),
        note: note.trim() || undefined,
        deadline: deadline.toISOString(),
        recurrence,
      });
      setTitle('');
      setNote('');
      setRecurrence(undefined);
      setFormOpen(false);
      syncReminderToCalendar(webApiClient, reminderId).catch((err) =>
        console.error('Could not sync reminder to Google Calendar', err),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create reminder');
    }
  }

  async function handleDelete(reminder: Reminder) {
    try {
      if (db && reminder.recurrence) {
        await data.createReminder(uid, {
          title: reminder.title,
          note: reminder.note,
          deadline: nextOccurrenceDate(reminder.deadline, reminder.recurrence),
          recurrence: reminder.recurrence,
        });
      }
      await deleteReminderEverywhere(webApiClient, reminder.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete reminder');
    }
  }

  async function handleSaveEdit(
    reminderId: string,
    patch: { title: string; note?: string; deadline: string; recurrence?: Recurrence },
  ) {
    if (!db) return;
    try {
      await data.updateReminder(uid, reminderId, patch);
      setEditingId(null);
      syncReminderToCalendar(webApiClient, reminderId).catch((err) =>
        console.error('Could not sync reminder to Google Calendar', err),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update reminder');
    }
  }

  return (
    <View style={{ gap: Spacing.two }}>
      <View style={styles.sectionHeaderRow}>
        <SectionHeader eyebrow="Deadlines" title="Remember" />
        {!formOpen && (
          <Pressable
            onPress={() => setFormOpen(true)}
            style={[styles.logToggle, { backgroundColor: theme.primary, borderColor: theme.border }]}>
            <ThemedText type="small" style={{ color: theme.primaryForeground, fontWeight: '700' }}>
              New reminder
            </ThemedText>
          </Pressable>
        )}
      </View>

      {formOpen && (
        <View style={[styles.form, { borderColor: theme.border }]}>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="What do you need to remember?"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, borderColor: theme.borderStrong, backgroundColor: theme.background }]}
          />
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Notes (e.g. account it's linked to)"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, borderColor: theme.borderStrong, backgroundColor: theme.background }]}
          />
          <View style={styles.chipRow}>
            {QUICK_OFFSETS.map((opt) => {
              const active = opt.days === offsetDays;
              return (
                <Pressable
                  key={opt.days}
                  onPress={() => setOffsetDays(opt.days)}
                  style={[styles.chip, { borderColor: theme.border, backgroundColor: active ? theme.primary : 'transparent' }]}>
                  <ThemedText type="small" style={active ? { color: theme.primaryForeground, fontWeight: '700' } : undefined}>
                    In {opt.label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
          <RecurrencePicker value={recurrence} onChange={setRecurrence} />
          <View style={styles.cardActionsRow}>
            <Pressable
              onPress={handleAdd}
              disabled={!title.trim()}
              style={[styles.addButton, { backgroundColor: theme.primary, borderColor: theme.border, opacity: title.trim() ? 1 : 0.5 }]}>
              <ThemedText style={{ color: theme.primaryForeground, fontWeight: '700' }}>Add reminder</ThemedText>
            </Pressable>
            <Pressable onPress={() => setFormOpen(false)}>
              <ThemedText type="small" themeColor="textSecondary">
                Cancel
              </ThemedText>
            </Pressable>
          </View>
        </View>
      )}

      {error && (
        <ThemedText themeColor="text" style={styles.error}>
          {error}
        </ThemedText>
      )}

      <View style={{ gap: Spacing.two }}>
        {reminders.map((reminder) => {
          const urgency = reminderUrgency(reminder.deadline);
          const days = daysUntil(reminder.deadline);
          const borderKey = URGENCY_BORDER[urgency];
          const borderColor = borderKey === 'primary' ? theme.primary : borderKey === 'border' ? theme.border : borderKey;
          if (editingId === reminder.id) {
            return (
              <ThemedView key={reminder.id} type="backgroundElement" style={[styles.reminderCard, { borderColor }]}>
                <EditReminderForm
                  reminder={reminder}
                  onSave={(patch) => handleSaveEdit(reminder.id, patch)}
                  onCancel={() => setEditingId(null)}
                />
              </ThemedView>
            );
          }
          return (
            <ThemedView
              key={reminder.id}
              type={isDueSoon(reminder.deadline) ? 'backgroundSelected' : 'backgroundElement'}
              style={[styles.reminderCard, { borderColor }]}>
              <Pressable style={styles.cardInfo} onPress={() => setEditingId(reminder.id)}>
                <ThemedText type="smallBold">{reminder.title}</ThemedText>
                {reminder.note && (
                  <ThemedText type="small" themeColor="textSecondary">
                    {reminder.note}
                  </ThemedText>
                )}
                <ThemedText type="code" themeColor="textSecondary">
                  {new Date(reminder.deadline).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                  {reminder.recurrence && ` · ↻ ${describeRecurrence(reminder.recurrence)}`}
                </ThemedText>
              </Pressable>
              <View style={styles.cardActions}>
                <View style={[styles.badge, { borderColor: theme.border, backgroundColor: theme.accent }]}>
                  <ThemedText type="code" style={styles.badgeText}>
                    {urgencyLabel(urgency, days)}
                  </ThemedText>
                </View>
                <Pressable onPress={() => handleDelete(reminder)}>
                  <ThemedText type="small" style={styles.deleteText}>
                    Delete
                  </ThemedText>
                </Pressable>
              </View>
            </ThemedView>
          );
        })}
        {reminders.length === 0 && !formOpen && (
          <ThemedView type="backgroundElement" style={styles.emptyState}>
            <ThemedText themeColor="textSecondary">Nothing to remember yet — add your first deadline above.</ThemedText>
          </ThemedView>
        )}
      </View>
    </View>
  );
}

// Rolls up two already-subscribed streams into one "did I show up this week"
// view; done tasks use updatedAt as their completion time (Task has no completedAt).
function WeekActivity({ tasks, activities }: { tasks: Task[]; activities: SportActivity[] }) {
  const theme = useTheme();
  const days = lastNDays(7);
  const taskCounts = countPerDay(
    tasks.filter((t) => t.status === 'done').map((t) => t.updatedAt),
    days,
  );
  const sessionCounts = countPerDay(
    activities.map((a) => a.startDate),
    days,
  );
  const total = [...taskCounts, ...sessionCounts].reduce((a, b) => a + b, 0);
  const activeDays = days.filter((_, i) => taskCounts[i]! + sessionCounts[i]! > 0).length;
  const taskColor = theme.primary;
  const sessionColor = withAlpha(theme.primary, 0.45);

  if (total === 0) return null;

  return (
    <View style={styles.weekSection}>
      <ChartCard title="This week" summary={`${activeDays}/7 active days`}>
        <BarTrend
          height={88}
          colors={[taskColor, sessionColor]}
          groups={days.map((d, i) => ({ label: weekdayInitial(d), values: [taskCounts[i]!, sessionCounts[i]!] }))}
        />
        <Legend
          items={[
            { label: 'Tasks done', color: taskColor },
            { label: 'Sport sessions', color: sessionColor },
          ]}
        />
      </ChartCard>
    </View>
  );
}

export default function DashboardScreen() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [activities, setActivities] = useState<SportActivity[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [github, setGithub] = useState<DevActivitySummary | null>(null);
  const [gitlab, setGitlab] = useState<DevActivitySummary | null>(null);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [spotify, setSpotify] = useState<SpotifySummary | null>(null);
  const [lessons, setLessons] = useState<DailyLesson[]>([]);
  const [drills, setDrills] = useState<CodeDrill[]>([]);
  const [vocabWords, setVocabWords] = useState<VocabWord[]>([]);
  const [readingItems, setReadingItems] = useState<ReadingListItem[]>([]);

  useEffect(() => {
    if (!user) return;
    const unsubs = [
      data.subscribeTasks(user.uid, setTasks),
      data.subscribeGoals(user.uid, setGoals),
      data.subscribeChallenges(user.uid, setChallenges),
      data.subscribeSportActivities(user.uid, setActivities),
      data.subscribeCalendarEvents(user.uid, setEvents, undefined, 3),
      data.subscribeDevActivity(user.uid, 'github', setGithub),
      data.subscribeDevActivity(user.uid, 'gitlab', setGitlab),
      data.subscribeReminders(user.uid, setReminders),
      data.subscribeSpotifySummary(user.uid, setSpotify),
      data.subscribeDailyLessons(user.uid, setLessons),
      data.subscribeCodeDrills(user.uid, setDrills),
      data.subscribeVocabWords(user.uid, setVocabWords),
      data.subscribeReadingList(user.uid, setReadingItems),
    ];
    return () => unsubs.forEach((u) => u());
  }, [user]);

  if (!user) return null;

  const openTasks = tasks.filter((t) => t.status !== 'done');
  // Auto-archived tasks/goals (done 30+ days, or manually archived) stay in
  // Firestore but drop out of this preview.
  const shownTasks = visibleTasks(tasks);
  const shownGoals = visibleGoals(goals);
  const latestActivity = activities[0];
  const openPrCount = (github?.openPullRequests.length ?? 0) + (gitlab?.openPullRequests.length ?? 0);
  const insightLevel = levelFromXp(computeInsightXp(lessons, drills, vocabWords, readingItems));
  const lessonDoneToday = lessons.some((l) => l.id === todayLessonId());
  const pendingReadingCount = readingItems.filter((i) => i.status !== 'read').length;

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <ThemedText type="code" themeColor="primary" style={styles.eyebrow}>
              Overview
            </ThemedText>
            <ThemedText type="subtitle">
              Welcome back{user.displayName ? `, ${user.displayName.split(' ')[0]}` : ''}
            </ThemedText>
          </View>

          <View style={styles.grid}>
            <Card title="Tasks" href="/tasks">
              <ThemedText type="title" style={styles.bigNumber}>
                {openTasks.length}
              </ThemedText>
              <ThemedText themeColor="textSecondary">
                open task{openTasks.length === 1 ? '' : 's'}
              </ThemedText>
            </Card>

            <Card title="Sports" href="/sports">
              {latestActivity ? (
                <>
                  <ThemedText type="smallBold">{latestActivity.name}</ThemedText>
                  <ThemedText themeColor="textSecondary">
                    {latestActivity.type} · {new Date(latestActivity.startDate).toLocaleDateString()}
                  </ThemedText>
                </>
              ) : (
                <ThemedText themeColor="textSecondary">No activity yet — connect Strava.</ThemedText>
              )}
            </Card>

            <Card title="Dev Activity" href="/integrations">
              <ThemedText type="title" style={styles.bigNumber}>
                {openPrCount}
              </ThemedText>
              <ThemedText themeColor="textSecondary">
                open pull request{openPrCount === 1 ? '' : 's'}
              </ThemedText>
            </Card>

            <Card title="Agenda" href="/agenda">
              {events.length > 0 ? (
                <>
                  <ThemedText type="smallBold" numberOfLines={1}>
                    {events[0]!.title}
                  </ThemedText>
                  <ThemedText themeColor="textSecondary">
                    {events[0]!.start.includes('T')
                      ? new Date(events[0]!.start).toLocaleString(undefined, {
                          weekday: 'short',
                          hour: 'numeric',
                          minute: '2-digit',
                        })
                      : 'All day'}
                  </ThemedText>
                </>
              ) : (
                <ThemedText themeColor="textSecondary">No events yet — connect Calendar.</ThemedText>
              )}
            </Card>

            <Card title="Music" href="/music">
              {spotify && spotify.recentTracks.length > 0 ? (
                <>
                  <ThemedText type="smallBold" numberOfLines={1}>
                    {spotify.recentTracks[0]!.name}
                  </ThemedText>
                  <ThemedText themeColor="textSecondary" numberOfLines={1}>
                    {spotify.topArtists[0]
                      ? `Top artist: ${spotify.topArtists[0].name}`
                      : spotify.recentTracks[0]!.artists}
                  </ThemedText>
                </>
              ) : (
                <ThemedText themeColor="textSecondary">No listening history yet — connect Spotify.</ThemedText>
              )}
            </Card>

            <Card title="Knowledge" href="/knowledge">
              <ThemedText type="title" style={styles.bigNumber}>
                Lv {insightLevel.level}
              </ThemedText>
              <ThemedText themeColor="textSecondary">
                {lessonDoneToday ? "Today's lesson done" : 'No lesson generated today'}
                {pendingReadingCount > 0
                  ? ` · ${pendingReadingCount} unread article${pendingReadingCount === 1 ? '' : 's'}`
                  : ''}
              </ThemedText>
            </Card>
          </View>

          <WeekActivity tasks={tasks} activities={activities} />

          <View style={styles.sections}>
            <TasksSection tasks={shownTasks} uid={user.uid} />
            <GoalsSection goals={shownGoals} tasks={tasks} uid={user.uid} />
            <ChallengesSection challenges={challenges} activities={activities} uid={user.uid} />
            <RemindersSection reminders={reminders} uid={user.uid} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1 },
  content: {
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.four,
  },
  header: {
    width: '100%',
    maxWidth: MaxContentWidth,
    marginTop: Spacing.four,
    gap: Spacing.one,
  },
  eyebrow: { letterSpacing: 2, textTransform: 'uppercase' },
  grid: {
    width: '100%',
    maxWidth: MaxContentWidth,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  cardSlot: { flexGrow: 1, flexBasis: 160 },
  cardFill: { flex: 1 },
  cardPressed: { opacity: 0.7 },
  card: {
    borderWidth: 1,
    borderRadius: Spacing.three,
    padding: Spacing.four,
    gap: Spacing.one,
  },
  cardEyebrow: { letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: Spacing.one },
  bigNumber: { fontSize: 32, lineHeight: 36 },
  sections: { width: '100%', maxWidth: MaxContentWidth, gap: Spacing.five },
  weekSection: { width: '100%', maxWidth: MaxContentWidth },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  logToggle: { borderWidth: 1, borderRadius: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
  smallOutlineButton: { borderWidth: 1, borderRadius: Spacing.two, paddingHorizontal: Spacing.two, paddingVertical: Spacing.half },
  bulkBar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, borderWidth: 1, borderRadius: Spacing.two, padding: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one + Spacing.half,
  },
  checkbox: { width: 16, height: 16, borderWidth: 1, borderRadius: 4 },
  renameInput: { borderWidth: 1, borderRadius: Spacing.half, paddingHorizontal: Spacing.one, paddingVertical: 2 },
  doneText: { textDecorationLine: 'line-through' },
  deleteText: { color: '#dc2626' },
  emptyText: { textAlign: 'center', paddingVertical: Spacing.three },
  form: { gap: Spacing.two, borderWidth: 1, borderRadius: Spacing.three, padding: Spacing.three },
  input: { borderWidth: 1, borderRadius: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: Spacing.half },
  addButton: { borderWidth: 1, borderRadius: Spacing.two, paddingVertical: Spacing.two, paddingHorizontal: Spacing.three, alignItems: 'center' },
  cardActionsRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  error: {},
  emptyState: { borderRadius: Spacing.three, padding: Spacing.five, alignItems: 'center' },
  reminderCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: Spacing.three,
    padding: Spacing.three,
  },
  cardInfo: { flex: 1, gap: 2 },
  cardActions: { gap: Spacing.one, alignItems: 'flex-end' },
  badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: 2 },
  badgeText: { fontSize: 10 },
  recurrenceIntervalRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  intervalInput: { width: 44, borderWidth: 1, borderRadius: Spacing.half, paddingHorizontal: Spacing.one, paddingVertical: 2 },
  weekdayChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: Spacing.one + Spacing.half, paddingVertical: Spacing.half },
});
