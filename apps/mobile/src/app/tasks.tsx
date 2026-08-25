import {
  TASK_CATEGORIES,
  TASK_DIFFICULTIES,
  createTask,
  deleteTask,
  setTaskStatus,
  subscribeTasks,
  type Task,
  type TaskCategory,
  type TaskDifficulty,
  type TaskStatus,
} from '@life-client/shared';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
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

export default function TasksScreen() {
  const { user } = useAuth();
  const theme = useTheme();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<TaskCategory>('work');
  const [difficulty, setDifficulty] = useState<TaskDifficulty>('medium');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !db) return;
    return subscribeTasks(db, user.uid, setTasks, (err) => setError(err.message));
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
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
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
          </ScrollView>
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
          renderItem={({ item }) => (
            <ThemedView type="backgroundElement" style={[styles.taskCard, { borderColor: theme.border }]}>
              <View style={styles.taskInfo}>
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
                </ThemedText>
              </View>
              <View style={styles.taskActions}>
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
  form: { gap: Spacing.two, borderWidth: 2, borderRadius: Spacing.three, padding: Spacing.three, marginTop: Spacing.four },
  input: { borderWidth: 2, borderRadius: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  chipRow: { gap: Spacing.one },
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
