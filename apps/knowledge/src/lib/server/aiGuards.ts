import { adminDb } from "./admin";

/**
 * Per-user daily quota and input caps for the AI routes.
 *
 * Every knowledge route verifies the caller's ID token, but authentication is
 * not authorisation to spend: any signed-in account could loop /drill or
 * /vocab indefinitely, and each call is a paid LLM request plus a Firestore
 * write. Inputs were uncapped too, so a single request could carry megabytes
 * of prompt — which also fed the zod advisory (GHSA-mrhx-c7xc-m3w5, memory
 * exhaustion on oversized constrained collections) that these routes' schemas
 * sit behind.
 *
 * The counter is a Firestore transaction rather than an in-memory map because
 * functions are per-instance: an in-process counter would reset on every cold
 * start and be trivially bypassed under any concurrency.
 */

export const AI_CALLS_PER_DAY = 40;

/** Local-date key for the quota document. */
function todayKey(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export class QuotaExceededError extends Error {
  constructor(public readonly limit: number) {
    super(`Daily AI limit of ${limit} requests reached — try again tomorrow`);
    this.name = "QuotaExceededError";
  }
}

/**
 * Reserves one unit of the caller's daily AI budget.
 *
 * Read and increment happen in one transaction so concurrent requests cannot
 * both observe the same count and overshoot the limit.
 */
export async function consumeAiQuota(uid: string, limit = AI_CALLS_PER_DAY): Promise<void> {
  const ref = adminDb.collection("users").doc(uid).collection("aiUsage").doc(todayKey());
  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const used = (snap.exists ? (snap.data()?.count as number | undefined) : 0) ?? 0;
    if (used >= limit) throw new QuotaExceededError(limit);
    tx.set(ref, { count: used + 1, updatedAt: new Date().toISOString() }, { merge: true });
  });
}

export class InvalidInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidInputError";
  }
}

/**
 * Validates and truncates a free-text field heading for a prompt.
 *
 * Truncating rather than rejecting keeps the UX forgiving for a long paste,
 * while still bounding what reaches the model.
 */
export function boundedText(
  value: unknown,
  field: string,
  maxChars: number,
  { required = false }: { required?: boolean } = {},
): string | undefined {
  if (value === undefined || value === null || value === "") {
    if (required) throw new InvalidInputError(`${field} is required`);
    return undefined;
  }
  if (typeof value !== "string") throw new InvalidInputError(`${field} must be text`);
  const trimmed = value.trim();
  if (required && !trimmed) throw new InvalidInputError(`${field} is required`);
  return trimmed.slice(0, maxChars);
}

/** Field limits, kept together so they are easy to compare and tune. */
export const LIMITS = {
  topic: 200,
  sentence: 500,
  answer: 4000,
  url: 2048,
} as const;

/** Maps a guard failure onto its HTTP response; anything else re-throws. */
export function guardErrorResponse(error: unknown): { error: string; status: number } | null {
  if (error instanceof QuotaExceededError) return { error: error.message, status: 429 };
  if (error instanceof InvalidInputError) return { error: error.message, status: 400 };
  return null;
}
