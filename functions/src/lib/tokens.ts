import { db } from "./admin";
import type { IntegrationProvider } from "./types";

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
  await db
    .collection("integrationTokens")
    .doc(tokenDocId(uid, provider))
    .set({ uid, provider, ...tokens, updatedAt: Date.now() });
}

export async function getTokens(
  uid: string,
  provider: IntegrationProvider,
): Promise<StoredTokens | null> {
  const snap = await db.collection("integrationTokens").doc(tokenDocId(uid, provider)).get();
  return snap.exists ? (snap.data() as StoredTokens) : null;
}

export async function deleteTokens(uid: string, provider: IntegrationProvider): Promise<void> {
  await db.collection("integrationTokens").doc(tokenDocId(uid, provider)).delete();
}

export async function allConnectedUids(provider: IntegrationProvider): Promise<string[]> {
  const snap = await db.collection("integrationTokens").where("provider", "==", provider).get();
  return snap.docs.map((d) => (d.data() as { uid: string }).uid);
}
