// Importing this module from a Client Component is a build error, not a runtime
// surprise. Everything in lib/server/ touches firebase-admin via a service
// account and (soon) a Supabase service-role key; previously the boundary was
// held by convention alone, so one bad import would have bundled credentials
// into the browser. admin.ts initialises lazily, so the mistake would not even
// have thrown until first use.
import "server-only";

import type { IntegrationProvider } from "@life-client/shared";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./admin";

export interface IntegrationStatusPatch {
  status: "connected" | "disconnected" | "error";
  externalAccountLabel?: string;
  scopes?: string[];
  connectedAt?: string;
  lastSyncAt?: string;
  lastError?: string;
  /**
   * Where the last successful sync got to, in whatever form the provider's
   * API wants back — Strava takes epoch seconds, Spotify a millisecond
   * cursor. Stored per provider so a sweep resumes instead of re-fetching the
   * same newest page forever and never reaching what it missed.
   */
  syncCursor?: string;
}

export async function setIntegrationStatus(
  uid: string,
  provider: IntegrationProvider,
  patch: IntegrationStatusPatch,
): Promise<void> {
  // A merge never removes a key, so `lastError` from an earlier failure
  // survived every later success — the Integrations page kept showing a stale
  // error next to a provider that was working again. Clear it explicitly
  // whenever a patch reports a non-error status and does not set a new one.
  const shouldClearError = patch.status !== "error" && patch.lastError === undefined;
  await adminDb
    .collection("users")
    .doc(uid)
    .collection("integrations")
    .doc(provider)
    .set(
      shouldClearError ? { ...patch, lastError: FieldValue.delete() } : patch,
      { merge: true },
    );
}

/** The cursor the last successful sync stored, or undefined on a first run. */
export async function getSyncCursor(
  uid: string,
  provider: IntegrationProvider,
): Promise<string | undefined> {
  const snapshot = await adminDb
    .collection("users")
    .doc(uid)
    .collection("integrations")
    .doc(provider)
    .get();
  const cursor = snapshot.data()?.syncCursor;
  return typeof cursor === "string" && cursor !== "" ? cursor : undefined;
}

/**
 * A provider's error body, trimmed for storage in `lastError`.
 *
 * That field is rendered verbatim on the Integrations page, and an upstream
 * error body is arbitrary third-party text of arbitrary length — an HTML error
 * page in the worst case. Bounding it keeps one bad response from bloating the
 * document and from filling the UI with markup.
 */
export function briefProviderError(status: number, body: string): string {
  const flattened = body.replace(/\s+/g, " ").trim();
  const MAX = 200;
  const text = flattened.length > MAX ? `${flattened.slice(0, MAX)}…` : flattened;
  return text ? `${status} ${text}` : String(status);
}
