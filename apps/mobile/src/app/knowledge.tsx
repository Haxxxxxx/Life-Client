import {
  type CodeDrill,
  type CodeDrillDifficulty,
  type DailyLesson,
  type DrillGradeResult,
  type GradeResult,
  type ReadingListItem,
  type VocabMastery,
  type VocabWord,
  computeInsightXp,
  dailyLessonStreak,
  deleteCodeDrill,
  gradeDrillAnswer,
  gradeVocabSentence,
  generateCodeDrill,
  generateDailyLesson,
  generateVocabWord,
  levelFromXp,
  requestReadingSummary,
} from '@life-client/shared';
import { data } from '@life-client/shared';
import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { knowledgeApiClient } from '@/lib/knowledgeClient';

const CORRECT_COLOR = '#16a34a';
const INCORRECT_COLOR = '#dc2626';

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
    if (!user) return;
    data.getTodayLesson(user.uid)
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
            {lesson.articleSource && (
              <ThemedText type="code" themeColor="textSecondary" style={styles.cardLabel}>
                {lesson.articleSource}
              </ThemedText>
            )}
            <ThemedText type="smallBold">{lesson.articleTopic}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {lesson.articleReason}
            </ThemedText>
            {lesson.articleUrl && (
              <Pressable onPress={() => Linking.openURL(lesson.articleUrl!)}>
                <ThemedText type="code" themeColor="primary" style={styles.wikiLink}>
                  Read the article →
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

function DrillCard({
  drill,
  onSkip,
  skipping,
  onDelete,
  deleting,
}: {
  drill: CodeDrill;
  onSkip: () => void;
  skipping: boolean;
  onDelete: () => void;
  deleting: boolean;
}) {
  const theme = useTheme();
  const [revealed, setRevealed] = useState(false);
  const [answer, setAnswer] = useState(drill.userAnswer ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<DrillGradeResult | null>(
    drill.graded
      ? {
          score: drill.score ?? (drill.correct ? 10 : 0),
          correct: Boolean(drill.correct),
          feedback: drill.feedback ?? '',
          hint: drill.hint,
          videoUrl: drill.videoUrl,
        }
      : null,
  );
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!answer.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      setResult(await gradeDrillAnswer(knowledgeApiClient, drill.id, answer.trim()));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not grade your answer');
    } finally {
      setSubmitting(false);
    }
  }

  const resultColor = result?.correct ? CORRECT_COLOR : INCORRECT_COLOR;

  return (
    <ThemedView type="backgroundElement" style={[styles.listCard, { borderColor: theme.border }]}>
      <View style={styles.rowBetween}>
        <View style={[styles.badge, { borderColor: theme.border, backgroundColor: theme.accent }]}>
          <ThemedText type="code" style={styles.badgeText}>
            {drill.difficulty}
          </ThemedText>
        </View>
        <View style={styles.rowGapThree}>
          <ThemedText type="code" themeColor="textSecondary">
            {drill.topic}
          </ThemedText>
          <Pressable onPress={onDelete} disabled={deleting}>
            <ThemedText type="code" style={styles.errorText}>
              {deleting ? 'Deleting…' : 'Delete'}
            </ThemedText>
          </Pressable>
        </View>
      </View>
      <ThemedText type="smallBold" style={styles.spacedTop}>
        {drill.prompt}
      </ThemedText>

      {!result && (
        <View style={[styles.spacedTop, styles.formGap]}>
          <TextInput
            value={answer}
            onChangeText={setAnswer}
            placeholder="Type your answer or explanation…"
            placeholderTextColor={theme.textSecondary}
            multiline
            numberOfLines={3}
            style={[styles.textArea, { color: theme.text, borderColor: theme.borderStrong, backgroundColor: theme.background }]}
          />
          <View style={styles.rowBetween}>
            <Pressable
              onPress={handleSubmit}
              disabled={submitting || !answer.trim()}
              style={[
                styles.primaryButtonSmall,
                { backgroundColor: theme.primary, borderColor: theme.border, opacity: submitting || !answer.trim() ? 0.5 : 1 },
              ]}>
              <ThemedText type="small" style={{ color: theme.primaryForeground, fontWeight: '700' }}>
                {submitting ? 'Grading…' : 'Submit answer'}
              </ThemedText>
            </Pressable>
            <View style={styles.rowGapThree}>
              {!revealed && (
                <Pressable onPress={() => setRevealed(true)}>
                  <ThemedText type="code" themeColor="primary">
                    Show answer
                  </ThemedText>
                </Pressable>
              )}
              <Pressable onPress={onSkip} disabled={skipping}>
                <ThemedText type="code" themeColor="textSecondary">
                  {skipping ? 'Skipping…' : 'Skip'}
                </ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {error && <ThemedText style={[styles.errorText, styles.spacedTop]}>{error}</ThemedText>}

      {result && (
        <View style={[styles.resultBox, { borderColor: resultColor, backgroundColor: `${resultColor}1A` }]}>
          <ThemedText type="code" style={{ color: resultColor }}>
            {result.correct ? 'Correct' : 'Not quite'} · {result.score}/10
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.spacedTop}>
            {result.feedback}
          </ThemedText>
          {!result.correct && (result.hint || result.videoUrl) && (
            <View style={[styles.hintBox, { borderColor: theme.border }]}>
              <ThemedText type="code" themeColor="primary">
                Need a hand?
              </ThemedText>
              {result.hint && (
                <ThemedText type="small" themeColor="textSecondary" style={styles.spacedTop}>
                  {result.hint}
                </ThemedText>
              )}
              {result.videoUrl && (
                <Pressable onPress={() => Linking.openURL(result.videoUrl!)} style={styles.spacedTop}>
                  <ThemedText type="code" themeColor="primary">
                    Watch a video on this →
                  </ThemedText>
                </Pressable>
              )}
            </View>
          )}
          <Pressable onPress={() => setResult(null)} style={styles.spacedTop}>
            <ThemedText type="code" themeColor="primary">
              Edit answer
            </ThemedText>
          </Pressable>
        </View>
      )}

      {(revealed || result) && (
        <ThemedText type="small" themeColor="textSecondary" style={styles.spacedTop}>
          {drill.explanation}
        </ThemedText>
      )}
    </ThemedView>
  );
}

function PastDrillRow({
  drill,
  onDelete,
  deleting,
}: {
  drill: CodeDrill;
  onDelete: () => void;
  deleting: boolean;
}) {
  const theme = useTheme();
  const scoreColor = drill.graded ? (drill.correct ? CORRECT_COLOR : INCORRECT_COLOR) : theme.textSecondary;
  return (
    <View style={[styles.pastDrillRow, { borderColor: theme.border }]}>
      <View style={styles.flex1}>
        <ThemedText type="small" numberOfLines={1}>
          {drill.prompt}
        </ThemedText>
        <ThemedText type="code" themeColor="textSecondary">
          {drill.difficulty} · {drill.topic}
        </ThemedText>
      </View>
      <View style={styles.rowGapThree}>
        {drill.graded ? (
          <View style={[styles.badge, { borderColor: scoreColor }]}>
            <ThemedText type="code" style={{ color: scoreColor }}>
              {typeof drill.score === 'number' ? `${drill.score}/10` : drill.correct ? 'Correct' : 'Missed'}
            </ThemedText>
          </View>
        ) : (
          <ThemedText type="code" themeColor="textSecondary">
            Skipped
          </ThemedText>
        )}
        <Pressable onPress={onDelete} disabled={deleting}>
          <ThemedText type="code" style={styles.errorText}>
            {deleting ? '…' : 'Delete'}
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

function CodeDrillsSection() {
  const { user } = useAuth();
  const theme = useTheme();
  const [drills, setDrills] = useState<CodeDrill[]>([]);
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState<CodeDrillDifficulty>('intermediate');
  const [generating, setGenerating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    return data.subscribeCodeDrills(user.uid, setDrills);
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

  async function handleDelete(id: string) {
    setDeletingId(id);
    setError(null);
    try {
      await deleteCodeDrill(knowledgeApiClient, id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete this drill');
    } finally {
      setDeletingId(null);
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
          style={[styles.input, { color: theme.text, borderColor: theme.borderStrong, backgroundColor: theme.background }]}
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
        {drills[0] ? (
          <DrillCard
            drill={drills[0]}
            onSkip={handleGenerate}
            skipping={generating}
            onDelete={() => handleDelete(drills[0]!.id)}
            deleting={deletingId === drills[0].id}
          />
        ) : (
          <ThemedView type="backgroundElement" style={[styles.emptyState, { borderColor: theme.border }]}>
            <ThemedText themeColor="textSecondary">No drills yet — generate your first one above.</ThemedText>
          </ThemedView>
        )}
      </View>
      {drills.length > 1 && (
        <View style={styles.list}>
          <ThemedText type="code" themeColor="textSecondary">
            Past drills
          </ThemedText>
          {drills.slice(1, 9).map((d) => (
            <PastDrillRow key={d.id} drill={d} onDelete={() => handleDelete(d.id)} deleting={deletingId === d.id} />
          ))}
        </View>
      )}
    </View>
  );
}

const MASTERY_ORDER: VocabMastery[] = ['new', 'learning', 'known'];
const MASTERY_LABEL: Record<VocabMastery, string> = { new: 'New', learning: 'Learning', known: 'Known' };

function VocabCard({ w }: { w: VocabWord }) {
  const { user } = useAuth();
  const theme = useTheme();
  const [sentence, setSentence] = useState(w.practiceSentence ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<GradeResult | null>(
    w.practiceSentence ? { correct: Boolean(w.practiceCorrect), feedback: w.practiceFeedback ?? '' } : null,
  );
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!sentence.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      setResult(await gradeVocabSentence(knowledgeApiClient, w.id, sentence.trim()));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not grade your sentence');
    } finally {
      setSubmitting(false);
    }
  }

  const resultColor = result?.correct ? CORRECT_COLOR : INCORRECT_COLOR;

  return (
    <ThemedView type="backgroundElement" style={[styles.listCard, { borderColor: theme.border }]}>
      <View style={styles.rowBetween}>
        <View style={styles.flex1}>
          <ThemedText type="smallBold">{w.word}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {w.definition}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.italic}>
            &ldquo;{w.example}&rdquo;
          </ThemedText>
        </View>
        <View style={styles.chipRowWrap}>
          {MASTERY_ORDER.map((m) => (
            <Pressable
              key={m}
              onPress={() => user && data.setVocabMastery(user.uid, w.id, m)}
              style={[styles.chip, { borderColor: theme.border, backgroundColor: w.mastery === m ? theme.accent : 'transparent' }]}>
              <ThemedText type="code">{MASTERY_LABEL[m]}</ThemedText>
            </Pressable>
          ))}
        </View>
      </View>
      <View style={[styles.spacedTop, styles.formGap, styles.practiceBlock, { borderColor: theme.border }]}>
        <ThemedText type="code" themeColor="primary">
          Practice it
        </ThemedText>
        <TextInput
          value={sentence}
          onChangeText={setSentence}
          placeholder={`Write a sentence using "${w.word}"…`}
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { color: theme.text, borderColor: theme.borderStrong, backgroundColor: theme.background }]}
        />
        <Pressable
          onPress={handleSubmit}
          disabled={submitting || !sentence.trim()}
          style={[
            styles.primaryButtonSmall,
            styles.alignStart,
            { backgroundColor: theme.primary, borderColor: theme.border, opacity: submitting || !sentence.trim() ? 0.5 : 1 },
          ]}>
          <ThemedText type="small" style={{ color: theme.primaryForeground, fontWeight: '700' }}>
            {submitting ? 'Checking…' : 'Check my sentence'}
          </ThemedText>
        </Pressable>
        {error && <ThemedText style={styles.errorText}>{error}</ThemedText>}
        {result && (
          <View style={[styles.resultBox, { borderColor: resultColor, backgroundColor: `${resultColor}1A` }]}>
            <ThemedText type="code" style={{ color: resultColor }}>
              {result.correct ? 'Nice, that works' : 'Not quite'}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.spacedTop}>
              {result.feedback}
            </ThemedText>
          </View>
        )}
      </View>
    </ThemedView>
  );
}

function DictionaryEntry({ w }: { w: VocabWord }) {
  const theme = useTheme();
  return (
    <View style={[styles.dictionaryEntry, { borderColor: theme.border }]}>
      <View style={styles.rowBetween}>
        <ThemedText type="smallBold">{w.word}</ThemedText>
        <ThemedText type="code" style={{ color: CORRECT_COLOR }}>
          Learned
        </ThemedText>
      </View>
      <ThemedText type="small" themeColor="textSecondary" style={styles.spacedTop}>
        {w.definition}
      </ThemedText>
      {w.practiceSentence && (
        <ThemedText type="small" themeColor="textSecondary" style={[styles.italic, styles.spacedTop]}>
          &ldquo;{w.practiceSentence}&rdquo;
        </ThemedText>
      )}
    </View>
  );
}

function VocabularySection() {
  const { user } = useAuth();
  const theme = useTheme();
  const [words, setWords] = useState<VocabWord[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    return data.subscribeVocabWords(user.uid, setWords);
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

  const activeWords = words.filter((w) => !w.practiceCorrect);
  const dictionaryWords = words
    .filter((w) => w.practiceCorrect)
    .slice()
    .sort((a, b) => a.word.localeCompare(b.word));

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
        {activeWords.map((w) => (
          <VocabCard key={w.id} w={w} />
        ))}
        {activeWords.length === 0 && (
          <ThemedView type="backgroundElement" style={[styles.emptyState, { borderColor: theme.border }]}>
            <ThemedText themeColor="textSecondary">
              {words.length === 0
                ? 'No words yet — get your first one above.'
                : "All caught up — every word's in your dictionary. Get a new one above."}
            </ThemedText>
          </ThemedView>
        )}
      </View>

      {dictionaryWords.length > 0 && (
        <View style={[styles.list, styles.dictionarySection, { borderColor: theme.border }]}>
          <SectionHeader eyebrow={`${dictionaryWords.length} learned`} title="Dictionary" />
          {dictionaryWords.map((w) => (
            <DictionaryEntry key={w.id} w={w} />
          ))}
        </View>
      )}
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
    if (!user) return;
    return data.subscribeReadingList(user.uid, setItems);
  }, [user]);

  async function handleAdd() {
    if (!user || !url.trim()) return;
    setAdding(true);
    setError(null);
    try {
      await data.createReadingListItem(user.uid, { url: url.trim() });
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
          style={[styles.input, styles.flex1, { color: theme.text, borderColor: theme.borderStrong, backgroundColor: theme.backgroundElement }]}
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
                  onPress={() => user && data.markReadingListItemRead(user.uid, item.id)}
                  style={[styles.pillButton, { borderColor: theme.border }]}>
                  <ThemedText type="small">Mark read</ThemedText>
                </Pressable>
              )}
              <Pressable onPress={() => user && data.deleteReadingListItem(user.uid, item.id)}>
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
  const { user } = useAuth();
  const theme = useTheme();
  const [lessons, setLessons] = useState<DailyLesson[]>([]);
  const [drills, setDrills] = useState<CodeDrill[]>([]);
  const [vocabWords, setVocabWords] = useState<VocabWord[]>([]);
  const [readingItems, setReadingItems] = useState<ReadingListItem[]>([]);

  useEffect(() => {
    if (!user) return;
    const unsubs = [
      data.subscribeDailyLessons(user.uid, setLessons),
      data.subscribeCodeDrills(user.uid, setDrills),
      data.subscribeVocabWords(user.uid, setVocabWords),
      data.subscribeReadingList(user.uid, setReadingItems),
    ];
    return () => unsubs.forEach((u) => u());
  }, [user]);

  const insightLevel = levelFromXp(computeInsightXp(lessons, drills, vocabWords, readingItems));
  const streak = dailyLessonStreak(lessons);
  const firstName = user?.displayName?.split(' ')[0];

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <View style={styles.rowBetween}>
              <View style={styles.flex1}>
                <ThemedText type="subtitle">{firstName ? `${firstName}'s Knowledge` : 'Knowledge'}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Your daily lesson, coding drills, vocab, and reading list.
                </ThemedText>
              </View>
              {streak > 0 && (
                <View style={[styles.badge, { borderColor: theme.border, backgroundColor: theme.accent }]}>
                  <ThemedText type="code">{streak}-day streak</ThemedText>
                </View>
              )}
            </View>
            <View style={[styles.insightCard, { borderColor: theme.border }]}>
              <View style={styles.rowBetween}>
                <ThemedText type="code" themeColor="primary">
                  Insight · Level {insightLevel.level}
                </ThemedText>
                <ThemedText type="code" themeColor="textSecondary">
                  {insightLevel.xpIntoLevel} / {insightLevel.xpForNextLevel} XP
                </ThemedText>
              </View>
              <View style={[styles.progressTrack, { borderColor: theme.border }]}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${Math.min(100, Math.max(0, insightLevel.progress * 100))}%`, backgroundColor: theme.primary },
                  ]}
                />
              </View>
            </View>
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
  header: { marginTop: Spacing.four, gap: Spacing.three },
  eyebrow: { letterSpacing: 2, textTransform: 'uppercase' },
  section: { gap: Spacing.three },
  sectionHeader: { gap: 2 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two },
  rowGapThree: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  flex1: { flex: 1, minWidth: 0 },
  alignStart: { alignSelf: 'flex-start' },
  spacedTop: { marginTop: Spacing.two },
  formGap: { gap: Spacing.two },
  italic: { fontStyle: 'italic' },
  errorText: { color: INCORRECT_COLOR },
  lessonGrid: { gap: Spacing.two },
  lessonCard: { borderWidth: 1, borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.half },
  cardLabel: { textTransform: 'uppercase', letterSpacing: 0.5 },
  wikiLink: { marginTop: Spacing.one, textTransform: 'uppercase' },
  emptyState: { borderWidth: 1, borderStyle: 'dashed', borderRadius: Spacing.three, padding: Spacing.five, alignItems: 'center', gap: Spacing.three },
  primaryButton: { borderWidth: 1, borderRadius: Spacing.two, paddingVertical: Spacing.two, paddingHorizontal: Spacing.four, alignItems: 'center' },
  primaryButtonSmall: { borderWidth: 1, borderRadius: Spacing.two, paddingVertical: Spacing.one, paddingHorizontal: Spacing.three },
  form: { gap: Spacing.two, borderWidth: 1, borderRadius: Spacing.three, padding: Spacing.three },
  input: { borderWidth: 1, borderRadius: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  textArea: { borderWidth: 1, borderRadius: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, minHeight: 72, textAlignVertical: 'top' },
  inputRow: { flexDirection: 'row', gap: Spacing.two },
  addButton: { borderWidth: 1, borderRadius: Spacing.two, paddingHorizontal: Spacing.four, justifyContent: 'center' },
  chipRowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: Spacing.half },
  list: { gap: Spacing.two },
  listCard: { borderWidth: 1, borderRadius: Spacing.three, padding: Spacing.three },
  badge: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { fontSize: 10 },
  pillButton: { borderWidth: 1, borderRadius: Spacing.two, paddingHorizontal: Spacing.two, paddingVertical: Spacing.half },
  resultBox: { borderWidth: 1, borderRadius: Spacing.two, padding: Spacing.three, marginTop: Spacing.two },
  hintBox: { borderTopWidth: 1, marginTop: Spacing.three, paddingTop: Spacing.three },
  pastDrillRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two, borderWidth: 1, borderRadius: Spacing.three, padding: Spacing.two },
  practiceBlock: { borderTopWidth: 1, paddingTop: Spacing.two },
  dictionaryEntry: { borderWidth: 1, borderRadius: Spacing.three, padding: Spacing.three },
  dictionarySection: { marginTop: Spacing.two, borderTopWidth: 1, paddingTop: Spacing.three },
  insightCard: { borderWidth: 1, borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
  progressTrack: { height: 10, borderRadius: 999, borderWidth: 1, overflow: 'hidden' },
  progressFill: { height: '100%' },
});
