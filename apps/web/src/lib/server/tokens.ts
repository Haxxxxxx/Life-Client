// Importing this module from a Client Component is a build error, not a runtime
// surprise. Everything in lib/server/ touches firebase-admin via a service
// account and (soon) a Supabase service-role key; previously the boundary was
// held by convention alone, so one bad import would have bundled credentials
// into the browser. admin.ts initialises lazily, so the mistake would not even
// have thrown until first use.
import "server-only";

import type { IntegrationProvider } from "@life-client/shared";
import { adminDb } from "./admin";

export interface StoredTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number; // epoch ms; absent means the token doesn't expire
  scope?: string;
}

function tokenDocId(uid: string, provider: IntegrationProvider): string {
  return `${uid}_${provider}`;
}

export async function storeTokens(
  uid: string,
  provider: IntegrationProvider,
  tokens: StoredTokens,
): Promise<void> {
  await adminDb
    .collection("integrationTokens")
    .doc(tokenDocId(uid, provider))
    .set({ uid, provider, ...tokens, updatedAt: Date.now() });
}

export async function getTokens(
  uid: string,
  provider: IntegrationProvider,
): Promise<StoredTokens | null> {
  const snap = await adminDb.collection("integrationTokens").doc(tokenDocId(uid, provider)).get();
  return snap.exists ? (snap.data() as StoredTokens) : null;
}

export async function deleteTokens(uid: string, provider: IntegrationProvider): Promise<void> {
  await adminDb.collection("integrationTokens").doc(tokenDocId(uid, provider)).delete();
}

export async function allConnectedUids(provider: IntegrationProvider): Promise<string[]> {
  const snap = await adminDb.collection("integrationTokens").where("provider", "==", provider).get();
  return snap.docs.map((d) => (d.data() as { uid: string }).uid);
}
