import {
  type CodeDrill,
  type CodeDrillDifficulty,
  type DailyLesson,
  type ReadingListItem,
  type VocabMastery,
  type VocabWord,
  createReadingListItem,
  deleteReadingListItem,
  generateCodeDrill,
  generateDailyLesson,
  generateVocabWord,
  getTodayLesson,
  markReadingListItemRead,
  requestReadingSummary,
  setVocabMastery,
  subscribeCodeDrills,
  subscribeReadingList,
  subscribeVocabWords,
} from '@life-client/shared';
import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { db } from '@/lib/firebase';
import { knowledgeApiClient } from '@/lib/knowledgeClient';

function SectionHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <ThemedText type="code" themeColor="primary" style={styles.eyebrow}>
        {eyebrow}
      </ThemedText>
      <ThemedText type="subtitle">{title}</ThemedText>
    </View>
  );
}

function DailyLessonSection() {
  const { user } = useAuth();
  const theme = useTheme();
  const [lesson, setLesson] = useState<DailyLesson | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !db) return;
    getTodayLesson(db, user.uid)
      .then(setLesson)
      .finally(() => setLoading(false));
  }, [user]);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      setLesson(await generateDailyLesson(knowledgeApiClient));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate today's lesson");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <View style={styles.section}>
      <SectionHeader eyebrow="Today" title="Daily Lesson" />
      {loading ? (
        <ThemedText themeColor="textSecondary">Loading…</ThemedText>
      ) : lesson ? (
        <View style={styles.lessonGrid}>
          <ThemedView type="backgroundElement" style={[styles.lessonCard, { borderColor: theme.border }]}>
            <ThemedText type="code" themeColor="primary" style={styles.cardLabel}>
              Code Concept
            </ThemedText>
            <ThemedText type="smallBold">{lesson.codeConcept}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {lesson.codeExplanation}
            </ThemedText>
          </ThemedView>
          <ThemedView type="backgroundElement" style={[styles.lessonCard, { borderColor: theme.border }]}>
            <ThemedText type="code" themeColor="primary" style={styles.cardLabel}>
              New Word{lesson.wordLanguage ? ` · ${lesson.wordLanguage.toUpperCase()}` : ''}
            </ThemedText>
            <ThemedText type="smallBold">{lesson.word}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {lesson.wordDefinition}
            </ThemedText>
          </ThemedView>
          <ThemedView type="backgroundElement" style={[styles.lessonCard, { borderColor: theme.border }]}>
            <ThemedText type="code" themeColor="primary" style={styles.cardLabel}>
              Read About
            </ThemedText>
            <ThemedText type="smallBold">{lesson.articleTopic}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {lesson.articleReason}
            </ThemedText>
            {lesson.articleUrl && (
              <Pressable onPress={() => Linking.openURL(lesson.articleUrl!)}>
                <ThemedText type="code" themeColor="primary" style={styles.wikiLink}>
                  Read on Wikipedia →
                </ThemedText>
              </Pressable>
            )}
          </ThemedView>
        </View>
      ) : (
        <ThemedView type="backgroundElement" style={[styles.emptyState, { borderColor: theme.border }]}>
          <ThemedText themeColor="textSecondary">No lesson generated yet today.</ThemedText>
          <Pressable
            onPress={handleGenerate}
            disabled={generating}
            style={[styles.primaryButton, { backgroundColor: theme.primary, borderColor: theme.border }]}>
            <ThemedText style={{ color: theme.primaryForeground, fontWeight: '700' }}>
              {generating ? 'Generating…' : "Generate today's lesson"}
            </ThemedText>
          </Pressable>
        </ThemedView>
      )}
      {error && <ThemedText style={styles.errorText}>{error}</ThemedText>}
    </View>
  );
}

const DIFFICULTIES: { id: CodeDrillDifficulty; label: string }[] = [
  { id: 'beginner', label: 'Beginner' },
  { id: 'intermediate', label: 'Intermediate' },
  { id: 'advanced', label: 'Advanced' },
];

function DrillCard({ drill }: { drill: CodeDrill }) {
  const theme = useTheme();
  const [revealed, setRevealed] = useState(false);
  return (
    <ThemedView type="backgroundElement" style={[styles.listCard, { borderColor: theme.border }]}>
      <View style={styles.rowBetween}>
        <View style={[styles.badge, { borderColor: theme.border, backgroundColor: theme.accent }]}>
          <ThemedText type="code" style={styles.badgeText}>
            {drill.difficulty}
          </ThemedText>
        </View>
        <ThemedText type="code" themeColor="textSecondary">
          {drill.topic}
        </ThemedText>
      </View>
      <ThemedText type="smallBold" style={styles.spacedTop}>
        {drill.prompt}
      </ThemedText>
      {revealed ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.spacedTop}>
          {drill.explanation}
        </ThemedText>
      ) : (
        <Pressable onPress={() => setRevealed(true)} style={styles.spacedTop}>
          <ThemedText type="code" themeColor="primary">
            Show answer
          </ThemedText>
        </Pressable>
      )}
    </ThemedView>
  );
}

function CodeDrillsSection() {
  const { user } = useAuth();
  const theme = useTheme();
  const [drills, setDrills] = useState<CodeDrill[]>([]);
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState<CodeDrillDifficulty>('intermediate');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !db) return;
    return subscribeCodeDrills(db, user.uid, setDrills);
  }, [user]);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      await generateCodeDrill(knowledgeApiClient, { topic: topic.trim() || undefined, difficulty });
      setTopic('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate a drill');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <View style={styles.section}>
      <SectionHeader eyebrow="Practice" title="Code Drills" />
      <View style={[styles.form, { borderColor: theme.border }]}>
        <TextInput
          value={topic}
          onChangeText={setTopic}
          placeholder="Topic (optional) — e.g. recursion, closures…"
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
        />
        <View style={styles.chipRowWrap}>
          {DIFFICULTIES.map((d) => {
            const active = d.id === difficulty;
            return (
              <Pressable
                key={d.id}
                onPress={() => setDifficulty(d.id)}
                style={[styles.chip, { borderColor: theme.border, backgroundColor: active ? theme.primary : 'transparent' }]}>
                <ThemedText type="small" style={active ? { color: theme.primaryForeground, fontWeight: '700' } : undefined}>
                  {d.label}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
        <Pressable
          onPress={handleGenerate}
          disabled={generating}
          style={[styles.primaryButton, { backgroundColor: theme.primary, borderColor: theme.border }]}>
          <ThemedText style={{ color: theme.primaryForeground, fontWeight: '700' }}>
            {generating ? 'Generating…' : 'Generate drill'}
          </ThemedText>
        </Pressable>
      </View>
      {error && <ThemedText style={styles.errorText}>{error}</ThemedText>}
      <View style={styles.list}>
        {drills.map((drill) => (
          <DrillCard key={drill.id} drill={drill} />
        ))}
        {drills.length === 0 && (
          <ThemedView type="backgroundElement" style={[styles.emptyState, { borderColor: theme.border }]}>
            <ThemedText themeColor="textSecondary">No drills yet — generate your first one above.</ThemedText>
          </ThemedView>
        )}
      </View>
    </View>
  );
}

const MASTERY_ORDER: VocabMastery[] = ['new', 'learning', 'known'];
const MASTERY_LABEL: Record<VocabMastery, string> = { new: 'New', learning: 'Learning', known: 'Known' };

function VocabularySection() {
  const { user } = useAuth();
  const theme = useTheme();
  const [words, setWords] = useState<VocabWord[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !db) return;
    return subscribeVocabWords(db, user.uid, setWords);
  }, [user]);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      await generateVocabWord(knowledgeApiClient);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate a new word');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <View style={styles.section}>
      <View style={styles.rowBetween}>
        <SectionHeader eyebrow="Vocabulary" title="New Words" />
        <Pressable
          onPress={handleGenerate}
          disabled={generating}
          style={[styles.primaryButtonSmall, { backgroundColor: theme.primary, borderColor: theme.border }]}>
          <ThemedText type="small" style={{ color: theme.primaryForeground, fontWeight: '700' }}>
            {generating ? 'Generating…' : 'New word'}
          </ThemedText>
        </Pressable>
      </View>
      {error && <ThemedText style={styles.errorText}>{error}</ThemedText>}
      <View style={styles.list}>
        {words.map((w) => (
          <ThemedView key={w.id} type="backgroundElement" style={[styles.listCard, { borderColor: theme.border }]}>
            <ThemedText type="smallBold">{w.word}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {w.definition}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.italic}>
              &ldquo;{w.example}&rdquo;
            </ThemedText>
            <View style={[styles.chipRowWrap, styles.spacedTop]}>
              {MASTERY_ORDER.map((m) => (
                <Pressable
                  key={m}
                  onPress={() => user && db && setVocabMastery(db, user.uid, w.id, m)}
                  style={[styles.chip, { borderColor: theme.border, backgroundColor: w.mastery === m ? theme.accent : 'transparent' }]}>
                  <ThemedText type="code">{MASTERY_LABEL[m]}</ThemedText>
                </Pressable>
              ))}
            </View>
          </ThemedView>
        ))}
        {words.length === 0 && (
          <ThemedView type="backgroundElement" style={[styles.emptyState, { borderColor: theme.border }]}>
            <ThemedText themeColor="textSecondary">No words yet — get your first one above.</ThemedText>
          </ThemedView>
        )}
      </View>
    </View>
  );
}

function ReadingListSection() {
  const { user } = useAuth();
  const theme = useTheme();
  const [items, setItems] = useState<ReadingListItem[]>([]);
  const [url, setUrl] = useState('');
  const [adding, setAdding] = useState(false);
  const [summarizingId, setSummarizingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !db) return;
    return subscribeReadingList(db, user.uid, setItems);
  }, [user]);

  async function handleAdd() {
    if (!user || !db || !url.trim()) return;
    setAdding(true);
    setError(null);
    try {
      await createReadingListItem(db, user.uid, { url: url.trim() });
      setUrl('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add this link');
    } finally {
      setAdding(false);
    }
  }

  async function handleSummarize(itemId: string) {
    setSummarizingId(itemId);
    setError(null);
    try {
      await requestReadingSummary(knowledgeApiClient, itemId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not summarize this article');
    } finally {
      setSummarizingId(null);
    }
  }

  return (
    <View style={styles.section}>
      <SectionHeader eyebrow="Reading" title="Reading List" />
      <View style={styles.inputRow}>
        <TextInput
          value={url}
          onChangeText={setUrl}
          placeholder="Paste a link to read later…"
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, styles.flex1, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundElement }]}
          onSubmitEditing={handleAdd}
          returnKeyType="done"
        />
        <Pressable
          onPress={handleAdd}
          disabled={adding || !url.trim()}
          style={[styles.addButton, { backgroundColor: theme.primary, borderColor: theme.border, opacity: url.trim() ? 1 : 0.5 }]}>
          <ThemedText style={{ color: theme.primaryForeground, fontWeight: '700' }}>Add</ThemedText>
        </Pressable>
      </View>
      {error && <ThemedText style={styles.errorText}>{error}</ThemedText>}
      <View style={styles.list}>
        {items.map((item) => (
          <ThemedView key={item.id} type="backgroundElement" style={[styles.listCard, { borderColor: theme.border }]}>
            <View style={styles.rowBetween}>
              <View style={styles.flex1}>
                <ThemedText type="smallBold" numberOfLines={1}>
                  {item.title ?? item.url}
                </ThemedText>
                <ThemedText type="code" themeColor="textSecondary" numberOfLines={1}>
                  {item.url}
                </ThemedText>
              </View>
              <ThemedText type="code" themeColor="textSecondary">
                {item.status}
              </ThemedText>
            </View>
            {item.summary && (
              <ThemedText type="small" themeColor="textSecondary" style={styles.spacedTop}>
                {item.summary}
              </ThemedText>
            )}
            {item.keyTakeaways?.map((t, i) => (
              <ThemedText key={i} type="small" themeColor="textSecondary">
                {'•'} {t}
              </ThemedText>
            ))}
            {item.status === 'error' && <ThemedText style={styles.errorText}>{item.error}</ThemedText>}
            <View style={[styles.rowBetween, styles.spacedTop]}>
              {(item.status === 'pending' || item.status === 'error') && (
                <Pressable
                  onPress={() => handleSummarize(item.id)}
                  disabled={summarizingId === item.id}
                  style={[styles.pillButton, { borderColor: theme.border }]}>
                  <ThemedText type="small">{summarizingId === item.id ? 'Summarizing…' : 'Summarize'}</ThemedText>
                </Pressable>
              )}
              {item.status === 'summarized' && (
                <Pressable
                  onPress={() => user && db && markReadingListItemRead(db, user.uid, item.id)}
                  style={[styles.pillButton, { borderColor: theme.border }]}>
                  <ThemedText type="small">Mark read</ThemedText>
                </Pressable>
              )}
              <Pressable onPress={() => user && db && deleteReadingListItem(db, user.uid, item.id)}>
                <ThemedText type="small" style={styles.errorText}>
                  Delete
                </ThemedText>
              </Pressable>
            </View>
          </ThemedView>
        ))}
        {items.length === 0 && (
          <ThemedView type="backgroundElement" style={[styles.emptyState, { borderColor: theme.border }]}>
            <ThemedText themeColor="textSecondary">Nothing on your reading list yet.</ThemedText>
          </ThemedView>
        )}
      </View>
    </View>
  );
}

export default function KnowledgeScreen() {
  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <ThemedText type="code" themeColor="primary" style={styles.eyebrow}>
              Grow
            </ThemedText>
            <ThemedText type="subtitle">Knowledge</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              A daily lesson, coding drills, new words, and articles worth reading.
            </ThemedText>
          </View>
          <DailyLessonSection />
          <CodeDrillsSection />
          <VocabularySection />
          <ReadingListSection />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four },
  content: { paddingBottom: Spacing.six, gap: Spacing.six },
  header: { marginTop: Spacing.four, gap: Spacing.one },
  eyebrow: { letterSpacing: 2, textTransform: 'uppercase' },
  section: { gap: Spacing.three },
  sectionHeader: { gap: 2 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two },
  flex1: { flex: 1, minWidth: 0 },
  spacedTop: { marginTop: Spacing.two },
  italic: { fontStyle: 'italic' },
  errorText: { color: '#dc2626' },
  lessonGrid: { gap: Spacing.two },
  lessonCard: { borderWidth: 2, borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.half },
  cardLabel: { textTransform: 'uppercase', letterSpacing: 0.5 },
  wikiLink: { marginTop: Spacing.one, textTransform: 'uppercase' },
  emptyState: { borderWidth: 2, borderStyle: 'dashed', borderRadius: Spacing.three, padding: Spacing.five, alignItems: 'center', gap: Spacing.three },
  primaryButton: { borderWidth: 2, borderRadius: Spacing.two, paddingVertical: Spacing.two, paddingHorizontal: Spacing.four, alignItems: 'center' },
  primaryButtonSmall: { borderWidth: 2, borderRadius: Spacing.two, paddingVertical: Spacing.one, paddingHorizontal: Spacing.three },
  form: { gap: Spacing.two, borderWidth: 2, borderRadius: Spacing.three, padding: Spacing.three },
  input: { borderWidth: 2, borderRadius: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  inputRow: { flexDirection: 'row', gap: Spacing.two },
  addButton: { borderWidth: 2, borderRadius: Spacing.two, paddingHorizontal: Spacing.four, justifyContent: 'center' },
  chipRowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  chip: { borderWidth: 2, borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: Spacing.half },
  list: { gap: Spacing.two },
  listCard: { borderWidth: 2, borderRadius: Spacing.three, padding: Spacing.three },
  badge: { borderWidth: 2, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { fontSize: 10 },
  pillButton: { borderWidth: 2, borderRadius: Spacing.two, paddingHorizontal: Spacing.two, paddingVertical: Spacing.half },
});
