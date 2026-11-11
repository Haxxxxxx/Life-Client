import { todayLessonId } from "./knowledge";
import type { CodeDrill, CodeDrillDifficulty, DailyLesson, ReadingListItem, VocabWord } from "./types";

export interface KnowledgeApiClient {
  /** "" for same-origin (web) or the deployed web app's absolute origin (mobile). */
  baseUrl: string;
  getIdToken: () => Promise<string | null>;
}

// A misconfigured/unreachable baseUrl (e.g. a web app not actually deployed at
// the configured origin) returns an HTML error page rather than JSON — that
// full markup must never reach the UI as an error message verbatim. Any body
// that opens with a tag (not just <!doctype/<html>, which misses fragments
// like "<b>502 Bad Gateway</b>" from a proxy/CDN) is treated as markup, not text.
export function errorMessageFromBody(text: string, fallback: string): string {
  const trimmed = text.trim();
  if (!trimmed || trimmed.startsWith("<") || trimmed.length > 300) return fallback;
  return trimmed;
}

// Every API route in this codebase replies with `{ error: string }` on failure —
// pulls that string out so it (not the enclosing JSON) is what gets sanitized/shown.
function extractErrorField(text: string): string | null {
  try {
    const body: unknown = JSON.parse(text);
    if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
      return body.error;
    }
    return null;
  } catch {
    return null;
  }
}

// The single fetch path every API client in this package goes through, so
// error-body sanitization (errorMessageFromBody) can't be bypassed by a call
// site that forgets to apply it — see knowledgeApi/spotifyApi/remindersApi/
// calendarApi, none of which call `fetch` directly anymore.
export async function apiRequest<T>(
  client: KnowledgeApiClient,
  path: string,
  init: { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown } = {},
): Promise<T> {
  const token = await client.getIdToken();
  if (!token) throw new Error("Not signed in");
  const hasBody = init.body !== undefined;
  const response = await fetch(`${client.baseUrl}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
    },
    ...(hasBody ? { body: JSON.stringify(init.body) } : {}),
  });
  if (!response.ok) {
    const text = await response.text();
    // API routes reply with a `{ error: string }` envelope, but that `error` string
    // can itself be a third-party API's raw error body wrapped by our own server code
    // (e.g. syncSpotifyForUser embedding Spotify's response text into an Error message)
    // — sanitize the EXTRACTED message, not the enclosing JSON, so a short embedded
    // HTML fragment doesn't slip past the length heuristic by hiding inside `{"error":"..."}`.
    const message = extractErrorField(text) ?? text;
    throw new Error(errorMessageFromBody(message, `Request to ${path} failed: ${response.status}`));
  }
  return (await response.json()) as T;
}

function post<T>(client: KnowledgeApiClient, path: string, body: unknown): Promise<T> {
  return apiRequest<T>(client, path, { method: "POST", body: body ?? {} });
}

/**
 * The client sends its own local date.
 *
 * The route used to call todayLessonId() server-side, where "local" is UTC on
 * Vercel. At UTC-5, 21:00 local on the 10th is already the 11th in UTC: the
 * server wrote lesson `2026-11-11` while the client looked up `2026-11-10` and
 * reported "no lesson today", and the streak walked local date keys over
 * UTC-keyed ids. The date has to come from whoever defines "today" for the
 * user, which is the client.
 */
export function generateDailyLesson(client: KnowledgeApiClient): Promise<DailyLesson> {
  return post(client, "/api/knowledge/lesson", { localDate: todayLessonId() });
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
