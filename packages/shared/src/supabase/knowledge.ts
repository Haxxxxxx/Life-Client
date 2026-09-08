import type { SupabaseClient } from "@supabase/supabase-js";
import { todayLessonId } from "../knowledge";
import type {
  CodeDrill,
  DailyLesson,
  NewReadingListItem,
  ReadingListItem,
  VocabMastery,
  VocabWord,
} from "../types";
import { subscribeCollection } from "./realtime";

// -------- daily lessons --------
interface DailyLessonRow {
  id: string;
  code_concept: string;
  code_explanation: string;
  word: string;
  word_language: "en" | "fr";
  word_definition: string;
  word_example: string;
  article_topic: string;
  article_reason: string;
  article_source: string | null;
  article_url: string | null;
  created_at: string;
}
function rowToLesson(r: DailyLessonRow): DailyLesson {
  return {
    id: r.id,
    codeConcept: r.code_concept,
    codeExplanation: r.code_explanation,
    word: r.word,
    wordLanguage: r.word_language,
    wordDefinition: r.word_definition,
    wordExample: r.word_example,
    articleTopic: r.article_topic,
    articleReason: r.article_reason,
    articleSource: r.article_source ?? undefined,
    articleUrl: r.article_url ?? undefined,
    createdAt: r.created_at,
  };
}

export async function getTodayLessonSb(client: SupabaseClient, userId: string): Promise<DailyLesson | null> {
  const { data, error } = await client
    .from("daily_lessons")
    .select("*")
    .eq("user_id", userId)
    .eq("id", todayLessonId())
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToLesson(data as DailyLessonRow) : null;
}

export function subscribeDailyLessonsSb(
  client: SupabaseClient,
  userId: string,
  onChange: (lessons: DailyLesson[]) => void,
  onError?: (error: Error) => void,
  max = 30,
): () => void {
  return subscribeCollection<DailyLessonRow, DailyLesson>({
    client,
    table: "daily_lessons",
    filterColumn: "user_id",
    filterValue: userId,
    rowId: (r) => r.id,
    map: rowToLesson,
    order: { column: "created_at", ascending: false },
    sort: (a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0),
    onChange: (rows) => onChange(rows.slice(0, max)),
    onError,
  });
}

// -------- code drills --------
interface CodeDrillRow {
  id: string;
  topic: string;
  difficulty: CodeDrill["difficulty"];
  prompt: string;
  explanation: string;
  user_answer: string | null;
  graded: boolean | null;
  score: number | null;
  correct: boolean | null;
  feedback: string | null;
  hint: string | null;
  video_url: string | null;
  created_at: string;
}
function rowToDrill(r: CodeDrillRow): CodeDrill {
  return {
    id: r.id,
    topic: r.topic,
    difficulty: r.difficulty,
    prompt: r.prompt,
    explanation: r.explanation,
    userAnswer: r.user_answer ?? undefined,
    graded: r.graded ?? undefined,
    score: r.score ?? undefined,
    correct: r.correct ?? undefined,
    feedback: r.feedback ?? undefined,
    hint: r.hint ?? undefined,
    videoUrl: r.video_url ?? undefined,
    createdAt: r.created_at,
  };
}

export function subscribeCodeDrillsSb(
  client: SupabaseClient,
  userId: string,
  onChange: (drills: CodeDrill[]) => void,
  onError?: (error: Error) => void,
  max = 50,
): () => void {
  return subscribeCollection<CodeDrillRow, CodeDrill>({
    client,
    table: "code_drills",
    filterColumn: "user_id",
    filterValue: userId,
    rowId: (r) => r.id,
    map: rowToDrill,
    order: { column: "created_at", ascending: false },
    sort: (a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0),
    onChange: (rows) => onChange(rows.slice(0, max)),
    onError,
  });
}

// -------- vocab --------
interface VocabRow {
  id: string;
  word: string;
  definition: string;
  example: string;
  mastery: VocabMastery;
  practice_sentence: string | null;
  practice_correct: boolean | null;
  practice_feedback: string | null;
  created_at: string;
  updated_at: string;
}
function rowToVocab(r: VocabRow): VocabWord {
  return {
    id: r.id,
    word: r.word,
    definition: r.definition,
    example: r.example,
    mastery: r.mastery,
    practiceSentence: r.practice_sentence ?? undefined,
    practiceCorrect: r.practice_correct ?? undefined,
    practiceFeedback: r.practice_feedback ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function subscribeVocabWordsSb(
  client: SupabaseClient,
  userId: string,
  onChange: (words: VocabWord[]) => void,
  onError?: (error: Error) => void,
): () => void {
  return subscribeCollection<VocabRow, VocabWord>({
    client,
    table: "vocab_words",
    filterColumn: "user_id",
    filterValue: userId,
    rowId: (r) => r.id,
    map: rowToVocab,
    order: { column: "created_at", ascending: false },
    sort: (a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0),
    onChange,
    onError,
  });
}

export async function setVocabMasterySb(
  client: SupabaseClient,
  userId: string,
  wordId: string,
  mastery: VocabMastery,
): Promise<void> {
  const { error } = await client
    .from("vocab_words")
    .update({ mastery })
    .eq("id", wordId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

// -------- reading list --------
interface ReadingRow {
  id: string;
  url: string;
  title: string | null;
  summary: string | null;
  key_takeaways: string[] | null;
  status: ReadingListItem["status"];
  error: string | null;
  created_at: string;
  updated_at: string;
}
function rowToReading(r: ReadingRow): ReadingListItem {
  return {
    id: r.id,
    url: r.url,
    title: r.title ?? undefined,
    summary: r.summary ?? undefined,
    keyTakeaways: r.key_takeaways ?? undefined,
    status: r.status,
    error: r.error ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function subscribeReadingListSb(
  client: SupabaseClient,
  userId: string,
  onChange: (items: ReadingListItem[]) => void,
  onError?: (error: Error) => void,
): () => void {
  return subscribeCollection<ReadingRow, ReadingListItem>({
    client,
    table: "reading_list",
    filterColumn: "user_id",
    filterValue: userId,
    rowId: (r) => r.id,
    map: rowToReading,
    order: { column: "created_at", ascending: false },
    sort: (a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0),
    onChange,
    onError,
  });
}

export async function createReadingListItemSb(
  client: SupabaseClient,
  userId: string,
  item: NewReadingListItem,
): Promise<string> {
  const id = globalThis.crypto.randomUUID();
  const { error } = await client
    .from("reading_list")
    .insert({ id, user_id: userId, url: item.url, status: "pending" });
  if (error) throw new Error(error.message);
  return id;
}

export async function markReadingListItemReadSb(
  client: SupabaseClient,
  userId: string,
  itemId: string,
): Promise<void> {
  const { error } = await client
    .from("reading_list")
    .update({ status: "read" })
    .eq("id", itemId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function deleteReadingListItemSb(
  client: SupabaseClient,
  userId: string,
  itemId: string,
): Promise<void> {
  const { error } = await client.from("reading_list").delete().eq("id", itemId).eq("user_id", userId);
  if (error) throw new Error(error.message);
}
