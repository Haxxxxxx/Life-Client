import {
  TASK_CATEGORIES,
  TASK_DIFFICULTIES,
  TASK_PRIORITIES,
  WEEKDAY_LABELS,
  describeRecurrence,
  type Goal,
  type Recurrence,
  type RecurrenceFreq,
  type Task,
  type TaskPatch,
  type TaskCategory,
  type TaskDifficulty,
  type TaskPriority,
  type TaskStatus,
  taskCompletedIso,
  archivedTasks,
  visibleTasks,
} from '@life-client/shared';
import { data } from '@life-client/shared';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Linking, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BarTrend, ChartCard, countPerDay, lastNDays, weekdayInitial } from '@/components/charts';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { SkeletonList } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { confirmDestructive } from '@/lib/confirm';

const STATUS_ORDER: TaskStatus[] = ['todo', 'in_progress', 'done'];
const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  done: 'Done',
};

const CATEGORY_LABEL = Object.fromEntries(TASK_CATEGORIES.map((c) => [c.id, c.label])) as Record<
  TaskCategory,
  string
>;
const DIFFICULTY_LABEL = Object.fromEntries(TASK_DIFFICULTIES.map((d) => [d.id, d.label])) as Record<
  TaskDifficulty,
  string
>;

const TREND_DAYS = 14;

function CompletionChart({ tasks }: { tasks: Task[] }) {
  const theme = useTheme();
  const { days, counts, total } = useMemo(() => {
    const days = lastNDays(TREND_DAYS);
    // archived done tasks are still in `tasks`, so the full window is covered.
    const timestamps = tasks
      .filter((t) => t.status === 'done')
      .map(taskCompletedIso)
      .filter((iso): iso is string => iso !== null);
    const counts = countPerDay(timestamps, days);
    return { days, counts, total: counts.reduce((a, b) => a + b, 0) };
  }, [tasks]);

  return (
    <View style={styles.chartSection}>
      <ChartCard title={`Completed · last ${TREND_DAYS} days`} summary={`${total} done`}>
        <BarTrend colors={[theme.primary]} groups={days.map((d, i) => ({ label: weekdayInitial(d), values: [counts[i]!] }))} />
      </ChartCard>
    </View>
  );
}

function nextStatus(status: TaskStatus): TaskStatus {
  const idx = STATUS_ORDER.indexOf(status);
  return STATUS_ORDER[(idx + 1) % STATUS_ORDER.length]!;
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
      <View style={styles.chipRowWrap}>
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
        <View style={styles.chipRowWrap}>
          {WEEKDAY_LABELS.map((label, i) => {
            const active = daysOfWeek.includes(i);
            return (
              <Pressable
                key={i}
                onPress={() => toggleDay(i)}
                style={[
                  styles.weekdayChip,
                  { borderColor: theme.border, backgroundColor: active ? theme.primary : 'transparent' },
                ]}>
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

function EditTaskForm({
  task,
  goals,
  onSave,
  onCancel,
}: {
  task: Task;
  goals: Goal[];
  onSave: (patch: TaskPatch) => void;
  onCancel: () => void;
}) {
  const theme = useTheme();
  const [title, setTitle] = useState(task.title);
  const [category, setCategory] = useState<TaskCategory>(task.category);
  const [difficulty, setDifficulty] = useState<TaskDifficulty>(task.difficulty);
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [dueDate, setDueDate] = useState(task.dueDate ?? '');
  const [goalId, setGoalId] = useState(task.goalId ?? '');
  const [recurrence, setRecurrence] = useState<Recurrence | undefined>(task.recurrence);

  return (
    <View style={{ flex: 1, gap: Spacing.one }}>
      <TextInput
        value={title}
        onChangeText={setTitle}
        style={[styles.input, { color: theme.text, borderColor: theme.borderStrong, backgroundColor: theme.background }]}
      />
      <View style={styles.chipRowWrap}>
        {TASK_CATEGORIES.map((c) => {
          const active = c.id === category;
          return (
            <Pressable
              key={c.id}
              onPress={() => setCategory(c.id)}
              style={[styles.chip, { borderColor: theme.border, backgroundColor: active ? theme.primary : 'transparent' }]}>
              <ThemedText type="small" style={active ? { color: theme.primaryForeground, fontWeight: '700' } : undefined}>
                {c.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.chipRowWrap}>
        {TASK_DIFFICULTIES.map((d) => {
          const active = d.id === difficulty;
          return (
            <Pressable
              key={d.id}
              onPress={() => setDifficulty(d.id)}
              style={[styles.chip, { borderColor: theme.border, backgroundColor: active ? theme.accent : 'transparent' }]}>
              <ThemedText type="small" style={active ? { fontWeight: '700' } : undefined}>
                {d.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.chipRowWrap}>
        {TASK_PRIORITIES.map((p) => {
          const active = p.id === priority;
          return (
            <Pressable
              key={p.id}
              onPress={() => setPriority(p.id)}
              style={[styles.chip, { borderColor: theme.border, backgroundColor: active ? theme.primary : 'transparent' }]}>
              <ThemedText type="small" style={active ? { color: theme.primaryForeground, fontWeight: '700' } : undefined}>
                {p.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
      <TextInput
        value={dueDate}
        onChangeText={setDueDate}
        placeholder="Due date YYYY-MM-DD"
        placeholderTextColor={theme.textSecondary}
        style={[styles.input, { color: theme.text, borderColor: theme.borderStrong, backgroundColor: theme.background }]}
      />
      <View style={styles.chipRowWrap}>
        <Pressable
          onPress={() => setGoalId('')}
          style={[styles.chip, { borderColor: theme.border, backgroundColor: !goalId ? theme.accent : 'transparent' }]}>
          <ThemedText type="small">No goal</ThemedText>
        </Pressable>
        {goals.map((g) => (
          <Pressable
            key={g.id}
            onPress={() => setGoalId(g.id)}
            style={[styles.chip, { borderColor: theme.border, backgroundColor: goalId === g.id ? theme.accent : 'transparent' }]}>
            <ThemedText type="small">{g.title}</ThemedText>
          </Pressable>
        ))}
      </View>
      <RecurrencePicker value={recurrence} onChange={setRecurrence} />
      <View style={styles.taskActions}>
        <Pressable
          onPress={() =>
            onSave({
              title: title.trim() || task.title,
              category,
              difficulty,
              priority,
              // See the web edit form: null clears, undefined is dropped.
              dueDate: dueDate || null,
              goalId: goalId || null,
              recurrence: recurrence ?? null,
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

export default function TasksScreen() {
  const { user } = useAuth();
  const theme = useTheme();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<TaskCategory>('work');
  const [difficulty, setDifficulty] = useState<TaskDifficulty>('medium');
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  // Which uid the loaded data belongs to, rather than a bare boolean reset
  // inside the effect. Two reasons: setState in an effect body triggers a
  // cascading render (the react-compiler lint rule rejects it), and deriving
  // it means a user switch cannot briefly show the previous account's rows as
  // though they were loaded.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const loaded = Boolean(user) && loadedFor === user?.uid;
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const uid = user.uid;
    return data.subscribeTasks(
      uid,
      (next) => {
        setTasks(next);
        setLoadedFor(uid);
      },
      (err) => setError(err.message),
    );
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return data.subscribeGoals(user.uid, setGoals);
  }, [user]);

  async function handleAdd() {
    if (!user || !title.trim()) return;
    setError(null);
    try {
      await data.createTask(user.uid, {
        title: title.trim(),
        status: 'todo',
        priority: 'medium',
        difficulty,
        category,
        source: 'manual',
        tags: [],
      });
      setTitle('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create task');
    }
  }

  const shownTasks = useMemo(() => visibleTasks(tasks), [tasks]);
  const archived = useMemo(() => archivedTasks(tasks), [tasks]);

  /**
   * Un-archiving keeps the task's status. `archived` is a flag separate from
   * status (unlike goals, where archived *is* the status), so a restored task
   * comes back still done — which is what you want from something the daily
   * cleanup filed away rather than something you un-finished.
   */
  async function handleRestoreTask(taskId: string) {
    if (!user) return;
    setError(null);
    try {
      await data.updateTask(user.uid, taskId, { archived: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not restore this task');
    }
  }

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <ThemedText type="code" themeColor="primary" style={styles.eyebrow}>
            Today
          </ThemedText>
          <ThemedText type="subtitle">Tasks</ThemedText>
        </View>

        <View style={[styles.form, { borderColor: theme.border }]}>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Add a task…"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, borderColor: theme.borderStrong, backgroundColor: theme.background }]}
            onSubmitEditing={handleAdd}
            returnKeyType="done"
          />
          <View style={styles.chipRowWrap}>
            {TASK_CATEGORIES.map((c) => {
              const active = c.id === category;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => setCategory(c.id)}
                  style={[
                    styles.chip,
                    { borderColor: theme.border, backgroundColor: active ? theme.primary : 'transparent' },
                  ]}>
                  <ThemedText
                    type="small"
                    style={active ? { color: theme.primaryForeground, fontWeight: '700' } : undefined}>
                    {c.label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.chipRowWrap}>
            {TASK_DIFFICULTIES.map((d) => {
              const active = d.id === difficulty;
              return (
                <Pressable
                  key={d.id}
                  onPress={() => setDifficulty(d.id)}
                  style={[
                    styles.chip,
                    { borderColor: theme.border, backgroundColor: active ? theme.accent : 'transparent' },
                  ]}>
                  <ThemedText type="small" style={active ? { fontWeight: '700' } : undefined}>
                    {d.label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
          <Pressable
            onPress={handleAdd}
            disabled={!title.trim()}
            style={[styles.addButton, { backgroundColor: theme.primary, borderColor: theme.border, opacity: title.trim() ? 1 : 0.5 }]}>
            <ThemedText style={{ color: theme.primaryForeground, fontWeight: '700' }}>Add task</ThemedText>
          </Pressable>
        </View>

        {error && (
          <ThemedText themeColor="text" style={styles.error}>
            {error}
          </ThemedText>
        )}

        <FlatList
          data={shownTasks}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={tasks.some((t) => t.status === 'done') ? <CompletionChart tasks={tasks} /> : null}
          ListFooterComponent={
            archived.length > 0 ? (
              <View style={{ gap: Spacing.two, marginTop: Spacing.four }}>
                <Pressable
                  onPress={() => setShowArchived((v) => !v)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: showArchived }}
                  accessibilityLabel={`Archived tasks, ${archived.length}`}>
                  <ThemedText type="code" themeColor="textSecondary" style={styles.eyebrow}>
                    {showArchived ? '▾' : '▸'} Archived ({archived.length})
                  </ThemedText>
                </Pressable>
                {showArchived && (
                  <View style={{ gap: Spacing.two }}>
                    <ThemedText type="small" themeColor="textSecondary">
                      Tasks the daily cleanup filed away after being done for 30 days. Nothing here is deleted —
                      restore one to put it back in the list above.
                    </ThemedText>
                    {archived.map((task) => (
                      <ThemedView
                        key={task.id}
                        type="backgroundElement"
                        style={[styles.archivedRow, { borderColor: theme.border }]}>
                        <ThemedText type="small" numberOfLines={1} style={styles.archivedTitle}>
                          {task.title}
                        </ThemedText>
                        <Pressable
                          onPress={() => handleRestoreTask(task.id)}
                          hitSlop={8}
                          accessibilityRole="button"
                          accessibilityLabel={`Restore task ${task.title}`}
                          style={[styles.restoreButton, { borderColor: theme.border }]}>
                          <ThemedText type="small">Restore</ThemedText>
                        </Pressable>
                      </ThemedView>
                    ))}
                  </View>
                )}
              </View>
            ) : null
          }
          ListEmptyComponent={
            !loaded ? (
              <SkeletonList rows={4} />
            ) : (
              <ThemedView type="backgroundElement" style={styles.emptyState}>
                <ThemedText themeColor="textSecondary">
                  {tasks.length === 0
                    ? 'No tasks yet — add your first one above.'
                    : 'All caught up — everything here has been done long enough to auto-archive.'}
                </ThemedText>
              </ThemedView>
            )
          }
          renderItem={({ item }) =>
            editingId === item.id ? (
              <ThemedView type="backgroundElement" style={[styles.taskCard, { borderColor: theme.border }]}>
                <EditTaskForm
                  task={item}
                  goals={goals}
                  onSave={(patch) => {
                    data.updateTask(user!.uid, item.id, patch);
                    setEditingId(null);
                  }}
                  onCancel={() => setEditingId(null)}
                />
              </ThemedView>
            ) : (
              <ThemedView type="backgroundElement" style={[styles.taskCard, { borderColor: theme.border }]}>
                <Pressable style={styles.taskInfo} onPress={() => setEditingId(item.id)}>
                  <ThemedText
                    numberOfLines={1}
                    style={item.status === 'done' ? styles.doneText : undefined}
                    themeColor={item.status === 'done' ? 'textSecondary' : 'text'}>
                    {item.title}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {STATUS_LABEL[item.status]} · {item.source}
                    {item.category && ` · ${CATEGORY_LABEL[item.category]}`}
                    {item.difficulty && ` · ${DIFFICULTY_LABEL[item.difficulty]}`}
                    {item.goalId && ` · ${goals.find((g) => g.id === item.goalId)?.title ?? 'Goal'}`}
                    {item.recurrence && ` · ↻ ${describeRecurrence(item.recurrence)}`}
                  </ThemedText>
                </Pressable>
                <View style={styles.taskActions}>
                  {item.sourceUrl && (
                    <Pressable onPress={() => Linking.openURL(item.sourceUrl!)}>
                      <ThemedText type="small" themeColor="primary">
                        {item.source === 'gitlab' ? 'GitLab' : 'GitHub'} ↗
                      </ThemedText>
                    </Pressable>
                  )}
                  <Pressable
                    onPress={() => data.advanceTaskStatus(user!.uid, item, nextStatus(item.status))}
                    style={[styles.pillButton, { borderColor: theme.border }]}>
                    <ThemedText type="small">{STATUS_LABEL[nextStatus(item.status)]}</ThemedText>
                  </Pressable>
                  <Pressable
                    onPress={() =>
                      confirmDestructive({
                        title: 'Delete this task?',
                        message: item.title,
                        onConfirm: () => data.deleteTask(user!.uid, item.id),
                      })
                    }
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete task ${item.title}`}
                    style={styles.deleteButton}>
                    <ThemedText type="small" style={styles.deleteText}>
                      Delete
                    </ThemedText>
                  </Pressable>
                </View>
              </ThemedView>
            )
          }
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  archivedRow: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: Spacing.two,
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  archivedTitle: { flex: 1 },
  restoreButton: {
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: Spacing.three,
  },
  screen: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four },
  header: { marginTop: Spacing.four, gap: Spacing.one },
  eyebrow: { letterSpacing: 2, textTransform: 'uppercase' },
  form: { gap: Spacing.two, borderWidth: 1, borderRadius: Spacing.three, padding: Spacing.three, marginTop: Spacing.four },
  input: { borderWidth: 1, borderRadius: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  chipRowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: Spacing.half },
  addButton: { borderWidth: 1, borderRadius: Spacing.two, paddingVertical: Spacing.two, alignItems: 'center' },
  error: { marginTop: Spacing.two },
  listContent: { paddingVertical: Spacing.four, gap: Spacing.two },
  chartSection: { marginBottom: Spacing.two },
  emptyState: { borderRadius: Spacing.three, padding: Spacing.five, alignItems: 'center' },
  taskCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: Spacing.three,
    padding: Spacing.three,
  },
  taskInfo: { flex: 1, gap: 2, minWidth: 0 },
  doneText: { textDecorationLine: 'line-through' },
  taskActions: { gap: Spacing.one, alignItems: 'flex-end' },
  pillButton: { borderWidth: 1, borderRadius: Spacing.two, paddingHorizontal: Spacing.two, paddingVertical: Spacing.half },
  deleteButton: { paddingHorizontal: Spacing.two, paddingVertical: Spacing.half },
  deleteText: { color: Colors.dark.danger },
  recurrenceIntervalRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  intervalInput: { width: 44, borderWidth: 1, borderRadius: Spacing.half, paddingHorizontal: Spacing.one, paddingVertical: 2 },
  weekdayChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: Spacing.one + Spacing.half, paddingVertical: Spacing.half },
});
