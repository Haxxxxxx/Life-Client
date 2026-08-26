import type { CodeDrill, CodeDrillDifficulty, DailyLesson, ReadingListItem, VocabWord } from "./types";

export interface KnowledgeApiClient {
  /** "" for same-origin (web) or the deployed web app's absolute origin (mobile). */
  baseUrl: string;
  getIdToken: () => Promise<string | null>;
}

async function post<T>(client: KnowledgeApiClient, path: string, body: unknown): Promise<T> {
  const token = await client.getIdToken();
  if (!token) throw new Error("Not signed in");
  const response = await fetch(`${client.baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body ?? {}),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request to ${path} failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

export function generateDailyLesson(client: KnowledgeApiClient): Promise<DailyLesson> {
  return post(client, "/api/knowledge/lesson", {});
}

export function generateCodeDrill(
  client: KnowledgeApiClient,
  input: { topic?: string; difficulty: CodeDrillDifficulty },
): Promise<CodeDrill> {
  return post(client, "/api/knowledge/drill", input);
}

export function generateVocabWord(client: KnowledgeApiClient): Promise<VocabWord> {
  return post(client, "/api/knowledge/vocab", {});
}

export function requestReadingSummary(
  client: KnowledgeApiClient,
  itemId: string,
): Promise<ReadingListItem> {
  return post(client, "/api/knowledge/summarize", { itemId });
}

export interface GradeResult {
  correct: boolean;
  feedback: string;
}

export interface DrillGradeResult {
  score: number; // 0-10
  correct: boolean; // score >= 7
  feedback: string;
  hint?: string; // present when score < 7
  videoUrl?: string; // present when score < 7 — a YouTube search-results link, not a specific video
}

export function gradeDrillAnswer(
  client: KnowledgeApiClient,
  drillId: string,
  answer: string,
): Promise<DrillGradeResult> {
  return post(client, "/api/knowledge/drill/grade", { drillId, answer });
}

export function deleteCodeDrill(client: KnowledgeApiClient, drillId: string): Promise<{ ok: true }> {
  return post(client, "/api/knowledge/drill/delete", { drillId });
}

export function gradeVocabSentence(
  client: KnowledgeApiClient,
  wordId: string,
  sentence: string,
): Promise<GradeResult> {
  return post(client, "/api/knowledge/vocab/grade", { wordId, sentence });
}
