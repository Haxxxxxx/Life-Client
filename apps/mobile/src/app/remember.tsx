import {
  createReminder,
  daysUntil,
  deleteReminderEverywhere,
  isDueSoon,
  type Reminder,
  type ReminderUrgency,
  reminderUrgency,
  subscribeReminders,
  syncReminderToCalendar,
  updateReminder,
} from '@life-client/shared';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { db } from '@/lib/firebase';
import { webApiClient } from '@/lib/webApiClient';

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
  if (urgency === 'due-soon') return `${days}d`;
  return `${days}d`;
}

function EditReminderForm({
  reminder,
  onSave,
  onCancel,
}: {
  reminder: Reminder;
  onSave: (patch: { title: string; note?: string; deadline: string }) => void;
  onCancel: () => void;
}) {
  const theme = useTheme();
  const [title, setTitle] = useState(reminder.title);
  const [note, setNote] = useState(reminder.note ?? '');
  const [offsetDays, setOffsetDays] = useState(7);

  return (
    <View style={{ flex: 1, gap: Spacing.one }}>
      <TextInput
        value={title}
        onChangeText={setTitle}
        style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
      />
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="Notes"
        placeholderTextColor={theme.textSecondary}
        style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
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
      <View style={styles.cardActions}>
        <Pressable
          onPress={() =>
            onSave({
              title: title.trim() || reminder.title,
              note: note.trim() || undefined,
              deadline: new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000).toISOString(),
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

export default function RememberScreen() {
  const { user } = useAuth();
  const theme = useTheme();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [offsetDays, setOffsetDays] = useState(7);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !db) return;
    return subscribeReminders(db, user.uid, setReminders, (err) => setError(err.message));
  }, [user]);

  async function handleAdd() {
    if (!user || !db || !title.trim()) return;
    setError(null);
    try {
      const deadline = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
      const reminderId = await createReminder(db, user.uid, {
        title: title.trim(),
        note: note.trim() || undefined,
        deadline: deadline.toISOString(),
      });
      setTitle('');
      setNote('');
      // Best-effort — a no-op server-side if Google Calendar isn't connected.
      syncReminderToCalendar(webApiClient, reminderId).catch((err) =>
        console.error('Could not sync reminder to Google Calendar', err),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create reminder');
    }
  }

  async function handleDelete(reminderId: string) {
    try {
      await deleteReminderEverywhere(webApiClient, reminderId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete reminder');
    }
  }

  async function handleSaveEdit(reminderId: string, patch: { title: string; note?: string; deadline: string }) {
    if (!user || !db) return;
    try {
      await updateReminder(db, user.uid, reminderId, patch);
      setEditingId(null);
      syncReminderToCalendar(webApiClient, reminderId).catch((err) =>
        console.error('Could not sync reminder to Google Calendar', err),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update reminder');
    }
  }

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <ThemedText type="code" themeColor="primary" style={styles.eyebrow}>
            Deadlines
          </ThemedText>
          <ThemedText type="subtitle">Remember</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Referral codes, trial expirations, renewal dates — anything with a deadline.
          </ThemedText>
        </View>

        <View style={[styles.form, { borderColor: theme.border }]}>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="What do you need to remember?"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
          />
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Notes (e.g. account it's linked to)"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
          />
          <View style={styles.chipRow}>
            {QUICK_OFFSETS.map((opt) => {
              const active = opt.days === offsetDays;
              return (
                <Pressable
                  key={opt.days}
                  onPress={() => setOffsetDays(opt.days)}
                  style={[
                    styles.chip,
                    { borderColor: theme.border, backgroundColor: active ? theme.primary : 'transparent' },
                  ]}>
                  <ThemedText
                    type="small"
                    style={active ? { color: theme.primaryForeground, fontWeight: '700' } : undefined}>
                    In {opt.label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
          <Pressable
            onPress={handleAdd}
            disabled={!title.trim()}
            style={[styles.addButton, { backgroundColor: theme.primary, borderColor: theme.border, opacity: title.trim() ? 1 : 0.5 }]}>
            <ThemedText style={{ color: theme.primaryForeground, fontWeight: '700' }}>Add reminder</ThemedText>
          </Pressable>
        </View>

        {error && (
          <ThemedText themeColor="text" style={styles.error}>
            {error}
          </ThemedText>
        )}

        <FlatList
          data={reminders}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <ThemedView type="backgroundElement" style={styles.emptyState}>
              <ThemedText themeColor="textSecondary">
                Nothing to remember yet — add your first deadline above.
              </ThemedText>
            </ThemedView>
          }
          renderItem={({ item }) => {
            const urgency = reminderUrgency(item.deadline);
            const days = daysUntil(item.deadline);
            const borderKey = URGENCY_BORDER[urgency];
            const borderColor = borderKey === 'primary' ? theme.primary : borderKey === 'border' ? theme.border : borderKey;
            if (editingId === item.id) {
              return (
                <ThemedView type="backgroundElement" style={[styles.card, { borderColor }]}>
                  <EditReminderForm
                    reminder={item}
                    onSave={(patch) => handleSaveEdit(item.id, patch)}
                    onCancel={() => setEditingId(null)}
                  />
                </ThemedView>
              );
            }
            return (
              <ThemedView
                type={isDueSoon(item.deadline) ? 'backgroundSelected' : 'backgroundElement'}
                style={[styles.card, { borderColor }]}>
                <Pressable style={styles.cardInfo} onPress={() => setEditingId(item.id)}>
                  <ThemedText type="smallBold">{item.title}</ThemedText>
                  {item.note && (
                    <ThemedText type="small" themeColor="textSecondary">
                      {item.note}
                    </ThemedText>
                  )}
                  <ThemedText type="code" themeColor="textSecondary">
                    {new Date(item.deadline).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                  </ThemedText>
                </Pressable>
                <View style={styles.cardActions}>
                  <View style={[styles.badge, { borderColor: theme.border, backgroundColor: theme.accent }]}>
                    <ThemedText type="code" style={styles.badgeText}>
                      {urgencyLabel(urgency, days)}
                    </ThemedText>
                  </View>
                  <Pressable onPress={() => handleDelete(item.id)}>
                    <ThemedText type="small" style={styles.deleteText}>
                      Delete
                    </ThemedText>
                  </Pressable>
                </View>
              </ThemedView>
            );
          }}
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
  form: { gap: Spacing.two, borderWidth: 2, borderRadius: Spacing.three, padding: Spacing.three, marginTop: Spacing.three },
  input: { borderWidth: 2, borderRadius: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  chip: { borderWidth: 2, borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: Spacing.half },
  addButton: { borderWidth: 2, borderRadius: Spacing.two, paddingVertical: Spacing.two, alignItems: 'center' },
  error: { marginTop: Spacing.two },
  listContent: { paddingVertical: Spacing.four, gap: Spacing.two },
  emptyState: { borderRadius: Spacing.three, padding: Spacing.five, alignItems: 'center' },
  card: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.two,
    borderWidth: 2,
    borderRadius: Spacing.three,
    padding: Spacing.three,
  },
  cardInfo: { flex: 1, gap: 2 },
  cardActions: { gap: Spacing.one, alignItems: 'flex-end' },
  badge: { borderWidth: 2, borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: 2 },
  badgeText: { fontSize: 10 },
  deleteText: { color: '#dc2626' },
});
