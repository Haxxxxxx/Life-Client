import {
  TASK_CATEGORIES,
  TASK_DIFFICULTIES,
  TASK_PRIORITIES,
  createTask,
  deleteTask,
  setTaskStatus,
  subscribeGoals,
  subscribeTasks,
  updateTask,
  type Goal,
  type Task,
  type TaskCategory,
  type TaskDifficulty,
  type TaskPriority,
  type TaskStatus,
} from '@life-client/shared';
import { useEffect, useState } from 'react';
import { FlatList, Linking, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { db } from '@/lib/firebase';

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

function nextStatus(status: TaskStatus): TaskStatus {
  const idx = STATUS_ORDER.indexOf(status);
  return STATUS_ORDER[(idx + 1) % STATUS_ORDER.length]!;
}

function EditTaskForm({
  task,
  goals,
  onSave,
  onCancel,
}: {
  task: Task;
  goals: Goal[];
  onSave: (patch: Partial<Task>) => void;
  onCancel: () => void;
}) {
  const theme = useTheme();
  const [title, setTitle] = useState(task.title);
  const [category, setCategory] = useState<TaskCategory>(task.category);
  const [difficulty, setDifficulty] = useState<TaskDifficulty>(task.difficulty);
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [dueDate, setDueDate] = useState(task.dueDate ?? '');
  const [goalId, setGoalId] = useState(task.goalId ?? '');

  return (
    <View style={{ flex: 1, gap: Spacing.one }}>
      <TextInput
        value={title}
        onChangeText={setTitle}
        style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
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
        style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
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
      <View style={styles.taskActions}>
        <Pressable
          onPress={() =>
            onSave({
              title: title.trim() || task.title,
              category,
              difficulty,
              priority,
              dueDate: dueDate || undefined,
              goalId: goalId || undefined,
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
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !db) return;
    return subscribeTasks(db, user.uid, setTasks, (err) => setError(err.message));
  }, [user]);

  useEffect(() => {
    if (!user || !db) return;
    return subscribeGoals(db, user.uid, setGoals);
  }, [user]);

  async function handleAdd() {
    if (!user || !db || !title.trim()) return;
    setError(null);
    try {
      await createTask(db, user.uid, {
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
            style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
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
          data={tasks}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <ThemedView type="backgroundElement" style={styles.emptyState}>
              <ThemedText themeColor="textSecondary">No tasks yet — add your first one above.</ThemedText>
            </ThemedView>
          }
          renderItem={({ item }) =>
            editingId === item.id ? (
              <ThemedView type="backgroundElement" style={[styles.taskCard, { borderColor: theme.border }]}>
                <EditTaskForm
                  task={item}
                  goals={goals}
                  onSave={(patch) => {
                    updateTask(db!, user!.uid, item.id, patch);
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
                    onPress={() => setTaskStatus(db!, user!.uid, item.id, nextStatus(item.status))}
                    style={[styles.pillButton, { borderColor: theme.border }]}>
                    <ThemedText type="small">{STATUS_LABEL[nextStatus(item.status)]}</ThemedText>
                  </Pressable>
                  <Pressable onPress={() => deleteTask(db!, user!.uid, item.id)} style={styles.deleteButton}>
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
  screen: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four },
  header: { marginTop: Spacing.four, gap: Spacing.one },
  eyebrow: { letterSpacing: 2, textTransform: 'uppercase' },
  form: { gap: Spacing.two, borderWidth: 2, borderRadius: Spacing.three, padding: Spacing.three, marginTop: Spacing.four },
  input: { borderWidth: 2, borderRadius: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  chipRowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  chip: { borderWidth: 2, borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: Spacing.half },
  addButton: { borderWidth: 2, borderRadius: Spacing.two, paddingVertical: Spacing.two, alignItems: 'center' },
  error: { marginTop: Spacing.two },
  listContent: { paddingVertical: Spacing.four, gap: Spacing.two },
  emptyState: { borderRadius: Spacing.three, padding: Spacing.five, alignItems: 'center' },
  taskCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 2,
    borderRadius: Spacing.three,
    padding: Spacing.three,
  },
  taskInfo: { flex: 1, gap: 2, minWidth: 0 },
  doneText: { textDecorationLine: 'line-through' },
  taskActions: { gap: Spacing.one, alignItems: 'flex-end' },
  pillButton: { borderWidth: 2, borderRadius: Spacing.two, paddingHorizontal: Spacing.two, paddingVertical: Spacing.half },
  deleteButton: { paddingHorizontal: Spacing.two, paddingVertical: Spacing.half },
  deleteText: { color: '#dc2626' },
});
