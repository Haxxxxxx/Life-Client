import {
  VICE_PRESETS,
  type Goal,
  type NewGoal,
  type Task,
  type ViceLog,
  archivedGoals as selectArchivedGoals,
  computeGoalProgress,
  goalStatusCounts,
} from '@life-client/shared';
import { data } from '@life-client/shared';
import { useEffect, useState } from 'react';
import { ScrollView, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChartCard, Donut, withAlpha } from '@/components/charts';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { SkeletonList } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { confirmDestructive } from '@/lib/confirm';

function daysUntil(dateStr: string): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / msPerDay);
}

const GOAL_EXAMPLES = ['Ship WeSplit v2', 'Read 12 books this year', 'Run a half marathon'];

function GoalStatusChart({ goals }: { goals: Goal[] }) {
  const theme = useTheme();
  // Shared with web, which used to divide by every goal including archived —
  // the same data read "2 of 10" there and 50% here. Archived goals were
  // dropped rather than missed, so they stay out of the denominator.
  const counts = goalStatusCounts(goals);
  const { active, completed, archived } = counts;
  const hitRate = Math.round(counts.hitRate * 100);

  return (
    <ChartCard title="Goal split" summary={`${counts.total} total`}>
      <Donut
        centerValue={`${hitRate}%`}
        centerCaption="done"
        slices={[
          { label: 'Active', value: active, color: theme.primary },
          { label: 'Completed', value: completed, color: withAlpha(theme.primary, 0.45) },
          { label: 'Archived', value: archived, color: withAlpha(theme.textSecondary, 0.35) },
        ]}
      />
    </ChartCard>
  );
}

function GoalForm({ onSubmit, onCancel }: { onSubmit: (input: NewGoal) => void; onCancel: () => void }) {
  const theme = useTheme();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [targetDate, setTargetDate] = useState('');

  return (
    <View style={[styles.form, { borderColor: theme.border }]}>
      <ThemedText type="code" themeColor="primary" style={styles.eyebrow}>
        New goal
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        What are you working toward?
      </ThemedText>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="e.g. Ship WeSplit v2"
        placeholderTextColor={theme.textSecondary}
        style={[styles.input, { color: theme.text, borderColor: theme.borderStrong, backgroundColor: theme.background }]}
      />
      <TextInput
        value={description}
        onChangeText={setDescription}
        placeholder="Description (optional)"
        placeholderTextColor={theme.textSecondary}
        style={[styles.input, { color: theme.text, borderColor: theme.borderStrong, backgroundColor: theme.background }]}
      />
      <TextInput
        value={targetDate}
        onChangeText={setTargetDate}
        placeholder="Target date YYYY-MM-DD (optional)"
        placeholderTextColor={theme.textSecondary}
        style={[styles.input, { color: theme.text, borderColor: theme.borderStrong, backgroundColor: theme.background }]}
      />
      {!title.trim() && (
        <View style={styles.chipRowWrap}>
          {GOAL_EXAMPLES.map((example) => (
            <Pressable key={example} onPress={() => setTitle(example)} style={[styles.chip, { borderColor: theme.border }]}>
              <ThemedText type="small" themeColor="textSecondary">
                {example}
              </ThemedText>
            </Pressable>
          ))}
        </View>
      )}
      <View style={styles.goalActions}>
        <Pressable
          disabled={!title.trim()}
          onPress={() =>
            onSubmit({
              title: title.trim(),
              description: description.trim() || undefined,
              targetDate: targetDate || undefined,
            })
          }
          style={[styles.addButton, { backgroundColor: theme.primary, borderColor: theme.border, opacity: title.trim() ? 1 : 0.5 }]}>
          <ThemedText style={{ color: theme.primaryForeground, fontWeight: '700' }}>Set goal</ThemedText>
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

function GoalCard({
  goal,
  tasks,
  onEdit,
  onComplete,
  onArchive,
  onDelete,
  onLinkTask,
  onUnlinkTask,
  onNewTask,
}: {
  goal: Goal;
  tasks: Task[];
  onEdit: (patch: Partial<NewGoal>) => void;
  onComplete: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onLinkTask: (taskId: string) => void;
  onUnlinkTask: (taskId: string) => void;
  onNewTask: (title: string) => void;
}) {
  const theme = useTheme();
  const progress = computeGoalProgress(goal, tasks);
  const linkedTasks = tasks.filter((t) => t.goalId === goal.id);
  const unlinkedTasks = tasks.filter((t) => !t.goalId);

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(goal.title);
  const [description, setDescription] = useState(goal.description ?? '');
  const [targetDate, setTargetDate] = useState(goal.targetDate ?? '');
  const [newTaskTitle, setNewTaskTitle] = useState('');

  const days = goal.targetDate ? daysUntil(goal.targetDate) : null;

  return (
    <ThemedView type="backgroundElement" style={[styles.goalCard, { borderColor: theme.border }]}>
      <View style={styles.goalHeaderRow}>
        {editing ? (
          <View style={{ flex: 1, gap: Spacing.one }}>
            <TextInput
              value={title}
              onChangeText={setTitle}
              style={[styles.input, { color: theme.text, borderColor: theme.borderStrong, backgroundColor: theme.background }]}
            />
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Description"
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { color: theme.text, borderColor: theme.borderStrong, backgroundColor: theme.background }]}
            />
            <TextInput
              value={targetDate}
              onChangeText={setTargetDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { color: theme.text, borderColor: theme.borderStrong, backgroundColor: theme.background }]}
            />
            <View style={styles.goalActions}>
              <Pressable
                onPress={() => {
                  onEdit({
                    title: title.trim() || goal.title,
                    description: description.trim() || undefined,
                    targetDate: targetDate || undefined,
                  });
                  setEditing(false);
                }}>
                <ThemedText type="small" themeColor="primary" style={{ fontWeight: '700' }}>
                  Save
                </ThemedText>
              </Pressable>
              <Pressable onPress={() => setEditing(false)}>
                <ThemedText type="small" themeColor="textSecondary">
                  Cancel
                </ThemedText>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable style={{ flex: 1 }} onPress={() => setEditing(true)}>
            <ThemedText type="smallBold">{goal.title}</ThemedText>
            {goal.description && (
              <ThemedText type="small" themeColor="textSecondary">
                {goal.description}
              </ThemedText>
            )}
            {days !== null && (
              <ThemedText type="small" themeColor={days < 0 ? undefined : 'textSecondary'} style={days < 0 ? styles.deleteText : undefined}>
                {days < 0
                  ? `${Math.abs(days)}d overdue`
                  : days === 0
                    ? 'Due today'
                    : `${days}d left · ${new Date(goal.targetDate!).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`}
              </ThemedText>
            )}
          </Pressable>
        )}
        {!editing && (
          <View style={{ alignItems: 'flex-end', gap: Spacing.one }}>
            <View
              style={[
                styles.badge,
                {
                  borderColor: theme.border,
                  backgroundColor: goal.status === 'completed' ? theme.primary : theme.accent,
                },
              ]}>
              <ThemedText
                type="code"
                style={[styles.badgeText, goal.status === 'completed' ? { color: theme.primaryForeground } : undefined]}>
                {goal.status}
              </ThemedText>
            </View>
            <View style={styles.goalActions}>
              {goal.status === 'active' && (
                <Pressable onPress={onComplete}>
                  <ThemedText type="small" themeColor="primary">
                    Complete
                  </ThemedText>
                </Pressable>
              )}
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
        )}
      </View>

      <View style={styles.progressRow}>
        <View style={[styles.progressTrack, { borderColor: theme.borderStrong, backgroundColor: theme.background }]}>
          <View style={[styles.progressFill, { width: `${Math.round(progress.percent * 100)}%`, backgroundColor: theme.primary }]} />
        </View>
        <ThemedText type="code" themeColor="textSecondary">
          {progress.completedTaskCount}/{progress.linkedTaskCount}
        </ThemedText>
      </View>

      {linkedTasks.length > 0 ? (
        <View style={{ gap: Spacing.half }}>
          {linkedTasks.map((task) => (
            <View key={task.id} style={styles.linkedTaskRow}>
              <ThemedText
                type="small"
                numberOfLines={1}
                style={[{ flex: 1 }, task.status === 'done' ? styles.doneText : undefined]}
                themeColor={task.status === 'done' ? 'textSecondary' : 'text'}>
                {task.title}
              </ThemedText>
              <Pressable onPress={() => onUnlinkTask(task.id)}>
                <ThemedText type="small" themeColor="textSecondary">
                  Unlink
                </ThemedText>
              </Pressable>
            </View>
          ))}
        </View>
      ) : (
        <ThemedText type="small" themeColor="textSecondary" style={styles.italicText}>
          No tasks linked yet — link one or add a new one below.
        </ThemedText>
      )}

      <View style={[styles.linkSection, { borderColor: theme.border }]}>
        <ThemedText type="code" themeColor="textSecondary" style={styles.eyebrow}>
          Link tasks to this goal
        </ThemedText>
        <View style={styles.chipRowWrap}>
          {unlinkedTasks.map((t) => (
            <Pressable
              key={t.id}
              onPress={() => onLinkTask(t.id)}
              style={[styles.chip, { borderColor: theme.border }]}>
              <ThemedText type="small">+ {t.title}</ThemedText>
            </Pressable>
          ))}
        </View>
        <View style={styles.newTaskRow}>
          <TextInput
            value={newTaskTitle}
            onChangeText={setNewTaskTitle}
            placeholder="Or create a new task…"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { flex: 1, color: theme.text, borderColor: theme.borderStrong, backgroundColor: theme.background }]}
          />
          <Pressable
            disabled={!newTaskTitle.trim()}
            onPress={() => {
              onNewTask(newTaskTitle.trim());
              setNewTaskTitle('');
            }}
            style={[styles.smallButton, { borderColor: theme.border, opacity: newTaskTitle.trim() ? 1 : 0.5 }]}>
            <ThemedText type="small" style={{ fontWeight: '700' }}>
              Add
            </ThemedText>
          </Pressable>
        </View>
      </View>
    </ThemedView>
  );
}

export default function GoalsScreen() {
  const { user } = useAuth();
  const theme = useTheme();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [viceLogs, setViceLogs] = useState<ViceLog[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  // Which uid the loaded data belongs to, rather than a bare boolean reset
  // inside the effect. Two reasons: setState in an effect body triggers a
  // cascading render (the react-compiler lint rule rejects it), and deriving
  // it means a user switch cannot briefly show the previous account's rows as
  // though they were loaded.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const loaded = Boolean(user) && loadedFor === user?.uid;

  useEffect(() => {
    if (!user) return;
    const uid = user.uid;
    return data.subscribeGoals(
      uid,
      (next) => {
        setGoals(next);
        setLoadedFor(uid);
      },
      (err) => setError(err.message),
    );
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return data.subscribeTasks(user.uid, setTasks);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return data.subscribeViceLogs(user.uid, setViceLogs);
  }, [user]);

  async function handleCreate(input: NewGoal) {
    if (!user) return;
    setError(null);
    try {
      await data.createGoal(user.uid, input);
      setFormOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create goal');
    }
  }

  async function handleLogVice(vicePresetId: string) {
    if (!user) return;
    setError(null);
    try {
      await data.logVice(user.uid, vicePresetId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not log slip');
    }
  }

  const activeViceLogs = viceLogs.filter((v) => !v.compensated);

  /**
   * Restores to "active", not "completed" — a goal can be archived from either
   * state and nothing records which, so restoring as completed would invent an
   * achievement and inflate the stats. Matches the web behaviour.
   */
  async function handleRestoreGoal(goalId: string) {
    if (!user) return;
    setError(null);
    try {
      await data.setGoalStatus(user.uid, goalId, 'active');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not restore this goal');
    }
  }

  const activeGoals = goals.filter((g) => g.status === 'active');
  const completedGoals = goals.filter((g) => g.status === 'completed');
  const archived = selectArchivedGoals(goals);
  const overallPercent =
    activeGoals.length > 0
      ? Math.round(
          (activeGoals.reduce((sum, g) => sum + computeGoalProgress(g, tasks).percent, 0) / activeGoals.length) * 100,
        )
      : 0;
  const [showCompleted, setShowCompleted] = useState(false);

  function renderGoalCard(goal: Goal) {
    return (
      <GoalCard
        key={goal.id}
        goal={goal}
        tasks={tasks}
        onEdit={(patch) => user && data.updateGoal(user.uid, goal.id, patch)}
        onComplete={() => user && data.setGoalStatus(user.uid, goal.id, 'completed')}
        onArchive={() => user && data.setGoalStatus(user.uid, goal.id, 'archived')}
        onDelete={() =>
          user &&
          confirmDestructive({
            title: 'Delete this goal?',
            message: goal.title,
            onConfirm: () => data.deleteGoal(user.uid, goal.id),
          })
        }
        onLinkTask={(taskId) => user && data.updateTask(user.uid, taskId, { goalId: goal.id })}
        onUnlinkTask={(taskId) => user && data.updateTask(user.uid, taskId, { goalId: undefined })}
        onNewTask={(title) =>
          user &&

          data.createTask(user.uid, {
            title,
            status: 'todo',
            priority: 'medium',
            difficulty: 'medium',
            category: 'personal',
            source: 'manual',
            tags: [],
            goalId: goal.id,
          })
        }
      />
    );
  }

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <ThemedText type="code" themeColor="primary" style={styles.eyebrow}>
              Long-term
            </ThemedText>
            <ThemedText type="subtitle">Goals</ThemedText>
          </View>
          {!formOpen && (
            <Pressable
              onPress={() => setFormOpen(true)}
              style={[styles.logToggle, { backgroundColor: theme.primary, borderColor: theme.border }]}>
              <ThemedText type="small" style={{ color: theme.primaryForeground, fontWeight: '700' }}>
                New goal
              </ThemedText>
            </Pressable>
          )}
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.statsRow}>
            <View style={[styles.statTile, { borderColor: theme.border }]}>
              <ThemedText type="subtitle" themeColor="primary">
                {activeGoals.length}
              </ThemedText>
              <ThemedText type="code" themeColor="textSecondary" style={styles.statLabel}>
                Active
              </ThemedText>
            </View>
            <View style={[styles.statTile, { borderColor: theme.border }]}>
              <ThemedText type="subtitle">{completedGoals.length}</ThemedText>
              <ThemedText type="code" themeColor="textSecondary" style={styles.statLabel}>
                Completed
              </ThemedText>
            </View>
            <View style={[styles.statTile, { borderColor: theme.border }]}>
              <ThemedText type="subtitle">{overallPercent}%</ThemedText>
              <ThemedText type="code" themeColor="textSecondary" style={styles.statLabel}>
                Avg. progress
              </ThemedText>
            </View>
          </View>

          {goals.length > 0 && <GoalStatusChart goals={goals} />}

          {formOpen && <GoalForm onSubmit={handleCreate} onCancel={() => setFormOpen(false)} />}
          {error && (
            <ThemedText themeColor="text" style={styles.error}>
              {error}
            </ThemedText>
          )}
          {!loaded && <SkeletonList rows={3} />}

          {loaded && activeGoals.length > 0 && (
            <View style={{ gap: Spacing.three }}>{activeGoals.map(renderGoalCard)}</View>
          )}

          {loaded && activeGoals.length === 0 && !formOpen && (
            <ThemedView type="backgroundElement" style={styles.emptyState}>
              <ThemedText themeColor="textSecondary">
                No active goals yet — set one above, e.g. &ldquo;Ship WeSplit v2&rdquo;, then link Tasks to it.
              </ThemedText>
            </ThemedView>
          )}

          {completedGoals.length > 0 && (
            <View style={{ gap: Spacing.two }}>
              <Pressable onPress={() => setShowCompleted((v) => !v)}>
                <ThemedText type="code" themeColor="textSecondary" style={styles.eyebrow}>
                  {showCompleted ? '▾' : '▸'} Completed ({completedGoals.length})
                </ThemedText>
              </Pressable>
              {showCompleted && <View style={{ gap: Spacing.three }}>{completedGoals.map(renderGoalCard)}</View>}
            </View>
          )}

          {archived.length > 0 && (
            <View style={{ gap: Spacing.two }}>
              <Pressable
                onPress={() => setShowArchived((v) => !v)}
                accessibilityRole="button"
                accessibilityState={{ expanded: showArchived }}
                accessibilityLabel={`Archived goals, ${archived.length}`}>
                <ThemedText type="code" themeColor="textSecondary" style={styles.eyebrow}>
                  {showArchived ? '▾' : '▸'} Archived ({archived.length})
                </ThemedText>
              </Pressable>
              {showArchived && (
                <View style={{ gap: Spacing.two }}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Goals you archived, plus any completed goal the daily cleanup filed away after 30 days.
                    Nothing here is deleted — restore one to put it back in your active list.
                  </ThemedText>
                  {archived.map((goal) => (
                    <ThemedView
                      key={goal.id}
                      type="backgroundElement"
                      style={[styles.archivedRow, { borderColor: theme.border }]}>
                      <ThemedText type="small" numberOfLines={1} style={styles.archivedTitle}>
                        {goal.title}
                      </ThemedText>
                      <Pressable
                        onPress={() => handleRestoreGoal(goal.id)}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={`Restore goal ${goal.title}`}
                        style={[styles.restoreButton, { borderColor: theme.border }]}>
                        <ThemedText type="small">Restore</ThemedText>
                      </Pressable>
                    </ThemedView>
                  ))}
                </View>
              )}
            </View>
          )}

          <View style={[styles.section, styles.viceSection, { borderColor: theme.border }]}>
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
                    <View key={v.id} style={[styles.viceRow, { borderColor: theme.border }]}>
                      <View style={{ flex: 1 }}>
                        <ThemedText type="smallBold">{preset?.label ?? v.viceId}</ThemedText>
                        <ThemedText type="code" themeColor="textSecondary">
                          -{v.penaltyXp} XP · {task ? `${task.title} (${task.status})` : 'Task missing'}
                        </ThemedText>
                      </View>
                      <Pressable onPress={() => user && data.deleteViceLog(user.uid, v.id)}>
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
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  screen: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: Spacing.two, marginTop: Spacing.four },
  headerText: { flex: 1, gap: Spacing.one },
  eyebrow: { letterSpacing: 2, textTransform: 'uppercase' },
  logToggle: { borderWidth: 1, borderRadius: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
  scrollContent: { paddingVertical: Spacing.four, gap: Spacing.three },
  error: { marginBottom: Spacing.two },
  emptyState: { borderRadius: Spacing.three, padding: Spacing.five, alignItems: 'center' },
  form: { gap: Spacing.two, borderWidth: 1, borderStyle: 'dashed', borderRadius: Spacing.two, padding: Spacing.two, marginBottom: Spacing.three },
  input: { borderWidth: 1, borderRadius: Spacing.one, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one },
  addButton: { borderWidth: 1, borderRadius: Spacing.two, paddingVertical: Spacing.two, alignItems: 'center' },
  goalCard: { borderWidth: 1, borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
  goalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: Spacing.two },
  goalActions: { flexDirection: 'row', gap: Spacing.two },
  badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: 2 },
  badgeText: { fontSize: 10 },
  deleteText: { color: '#dc2626' },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  progressTrack: { flex: 1, height: 8, borderWidth: 1, borderRadius: 999, overflow: 'hidden' },
  progressFill: { height: '100%' },
  linkedTaskRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two },
  doneText: { textDecorationLine: 'line-through' },
  chipRowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: Spacing.half },
  newTaskRow: { flexDirection: 'row', gap: Spacing.one, alignItems: 'center' },
  smallButton: { borderWidth: 1, borderRadius: Spacing.one, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one },
  statsRow: { flexDirection: 'row', gap: Spacing.two, marginBottom: Spacing.three },
  statTile: { flex: 1, borderWidth: 1, borderRadius: Spacing.two, paddingVertical: Spacing.two, alignItems: 'center', gap: 2 },
  statLabel: { textTransform: 'uppercase', letterSpacing: 0.5 },
  linkSection: { gap: Spacing.one, borderTopWidth: 1, paddingTop: Spacing.two },
  italicText: { fontStyle: 'italic' },
  section: { gap: Spacing.one },
  viceSection: { borderTopWidth: 1, borderStyle: 'dashed', paddingTop: Spacing.four },
  viceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
});
