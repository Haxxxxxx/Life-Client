import {
  createTask,
  deleteTask,
  setTaskStatus,
  subscribeTasks,
  type Task,
  type TaskStatus,
} from '@life-client/shared';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { db } from '@/lib/firebase';

const STATUS_ORDER: TaskStatus[] = ['todo', 'in_progress', 'done'];
const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  done: 'Done',
};

function nextStatus(status: TaskStatus): TaskStatus {
  const idx = STATUS_ORDER.indexOf(status);
  return STATUS_ORDER[(idx + 1) % STATUS_ORDER.length]!;
}

export default function TasksScreen() {
  const { user } = useAuth();
  const theme = useTheme();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState('');
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

        <View style={styles.inputRow}>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Add a task…"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundElement }]}
            onSubmitEditing={handleAdd}
            returnKeyType="done"
          />
          <Pressable
            onPress={handleAdd}
            disabled={!title.trim()}
            style={[styles.addButton, { backgroundColor: theme.primary, borderColor: theme.border, opacity: title.trim() ? 1 : 0.5 }]}>
            <ThemedText style={{ color: theme.primaryForeground, fontWeight: '700' }}>Add</ThemedText>
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
                  style={item.status === 'done' ? styles.doneText : undefined}
                  themeColor={item.status === 'done' ? 'textSecondary' : 'text'}>
                  {item.title}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {STATUS_LABEL[item.status]} · {item.source}
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
  inputRow: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.four },
  input: { flex: 1, borderWidth: 2, borderRadius: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  addButton: { borderWidth: 2, borderRadius: Spacing.two, paddingHorizontal: Spacing.four, justifyContent: 'center' },
  error: { marginTop: Spacing.two },
  listContent: { paddingVertical: Spacing.four, paddingBottom: BottomTabInset + Spacing.four, gap: Spacing.two },
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
  taskInfo: { flex: 1, gap: 2 },
  doneText: { textDecorationLine: 'line-through' },
  taskActions: { gap: Spacing.one, alignItems: 'flex-end' },
  pillButton: { borderWidth: 2, borderRadius: Spacing.two, paddingHorizontal: Spacing.two, paddingVertical: Spacing.half },
  deleteButton: { paddingHorizontal: Spacing.two, paddingVertical: Spacing.half },
  deleteText: { color: '#dc2626' },
});
