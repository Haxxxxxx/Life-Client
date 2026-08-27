import {
  JOURNAL_MOODS,
  createJournalEntry,
  deleteJournalEntry,
  subscribeJournalEntries,
  updateJournalEntry,
  type JournalEntry,
  type JournalMood,
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

const MOOD_EMOJI = Object.fromEntries(JOURNAL_MOODS.map((m) => [m.id, m.emoji])) as Record<JournalMood, string>;

function MoodPicker({ value, onChange }: { value: JournalMood | undefined; onChange: (mood: JournalMood | undefined) => void }) {
  const theme = useTheme();
  return (
    <View style={styles.chipRowWrap}>
      {JOURNAL_MOODS.map((m) => {
        const active = value === m.id;
        return (
          <Pressable
            key={m.id}
            onPress={() => onChange(active ? undefined : m.id)}
            style={[styles.moodChip, { borderColor: theme.border, backgroundColor: active ? theme.accent : 'transparent' }]}>
            <ThemedText type="small">
              {m.emoji} {m.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

function EditEntryForm({
  entry,
  onSave,
  onCancel,
}: {
  entry: JournalEntry;
  onSave: (patch: { content: string; mood?: JournalMood }) => void;
  onCancel: () => void;
}) {
  const theme = useTheme();
  const [content, setContent] = useState(entry.content);
  const [mood, setMood] = useState<JournalMood | undefined>(entry.mood);

  return (
    <View style={{ flex: 1, gap: Spacing.two }}>
      <TextInput
        value={content}
        onChangeText={setContent}
        multiline
        numberOfLines={4}
        style={[styles.textarea, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
      />
      <MoodPicker value={mood} onChange={setMood} />
      <View style={styles.cardActionsRow}>
        <Pressable onPress={() => onSave({ content: content.trim() || entry.content, mood })}>
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

export default function JournalScreen() {
  const { user } = useAuth();
  const theme = useTheme();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [content, setContent] = useState('');
  const [mood, setMood] = useState<JournalMood | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !db) return;
    return subscribeJournalEntries(db, user.uid, setEntries, (err) => setError(err.message));
  }, [user]);

  async function handleAdd() {
    if (!user || !db || !content.trim()) return;
    setError(null);
    try {
      await createJournalEntry(db, user.uid, { content: content.trim(), mood });
      setContent('');
      setMood(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save entry');
    }
  }

  async function handleSaveEdit(entryId: string, patch: { content: string; mood?: JournalMood }) {
    if (!user || !db) return;
    try {
      await updateJournalEntry(db, user.uid, entryId, patch);
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update entry');
    }
  }

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <ThemedText type="code" themeColor="primary" style={styles.eyebrow}>
            Journal
          </ThemedText>
          <ThemedText type="subtitle">Journal</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Freeform notes and reflections — whatever&apos;s on your mind.
          </ThemedText>
        </View>

        <View style={[styles.form, { borderColor: theme.border }]}>
          <TextInput
            value={content}
            onChangeText={setContent}
            multiline
            numberOfLines={4}
            placeholder="What's on your mind?"
            placeholderTextColor={theme.textSecondary}
            style={[styles.textarea, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
          />
          <MoodPicker value={mood} onChange={setMood} />
          <Pressable
            onPress={handleAdd}
            disabled={!content.trim()}
            style={[styles.addButton, { backgroundColor: theme.primary, borderColor: theme.border, opacity: content.trim() ? 1 : 0.5 }]}>
            <ThemedText style={{ color: theme.primaryForeground, fontWeight: '700' }}>Save entry</ThemedText>
          </Pressable>
        </View>

        {error && (
          <ThemedText themeColor="text" style={styles.error}>
            {error}
          </ThemedText>
        )}

        <FlatList
          data={entries}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <ThemedView type="backgroundElement" style={styles.emptyState}>
              <ThemedText themeColor="textSecondary">No entries yet — write your first one above.</ThemedText>
            </ThemedView>
          }
          renderItem={({ item }) =>
            editingId === item.id ? (
              <ThemedView type="backgroundElement" style={[styles.card, { borderColor: theme.border }]}>
                <EditEntryForm entry={item} onSave={(patch) => handleSaveEdit(item.id, patch)} onCancel={() => setEditingId(null)} />
              </ThemedView>
            ) : (
              <ThemedView type="backgroundElement" style={[styles.card, { borderColor: theme.border }]}>
                <Pressable style={styles.cardInfo} onPress={() => setEditingId(item.id)}>
                  <ThemedText type="small">{item.content}</ThemedText>
                  <ThemedText type="code" themeColor="textSecondary" style={styles.timestamp}>
                    {new Date(item.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                    {item.mood && ` · ${MOOD_EMOJI[item.mood]}`}
                  </ThemedText>
                </Pressable>
                <Pressable onPress={() => user && db && deleteJournalEntry(db, user.uid, item.id)}>
                  <ThemedText type="small" style={styles.deleteText}>
                    Delete
                  </ThemedText>
                </Pressable>
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
  form: { gap: Spacing.two, borderWidth: 2, borderRadius: Spacing.three, padding: Spacing.three, marginTop: Spacing.three },
  textarea: { borderWidth: 2, borderRadius: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, minHeight: 90, textAlignVertical: 'top' },
  chipRowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  moodChip: { borderWidth: 2, borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: Spacing.half },
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
  cardInfo: { flex: 1, gap: Spacing.one, minWidth: 0 },
  timestamp: { marginTop: 2 },
  deleteText: { color: '#dc2626' },
  cardActionsRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
});
