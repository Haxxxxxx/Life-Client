// Importing this module from a Client Component is a build error, not a runtime
// surprise. Everything in lib/server/ touches firebase-admin via a service
// account and (soon) a Supabase service-role key; previously the boundary was
// held by convention alone, so one bad import would have bundled credentials
// into the browser. admin.ts initialises lazily, so the mistake would not even
// have thrown until first use.
import "server-only";

import { expiresAtFrom, type IntegrationProvider } from "@life-client/shared";
import { adminDb } from "./admin";
import { clientIdFor, clientSecretFor, refreshAccessToken } from "./providers";

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


/**
 * Returns the stored tokens, refreshing and persisting them first if the
 * access token is within a minute of expiring.
 *
 * This existed four times over — in syncStrava, syncSpotify, syncDevActivity
 * (GitLab) and googleCalendarClient — identical but for the provider string
 * and the expiry shape above. syncCalendar had a fifth variant that skipped
 * the expiry check and the persist step entirely.
 *
 * An unknown expiry refreshes rather than skipping. The alternative is to
 * treat "I cannot tell" as "still valid", which is how a token ends up never
 * being refreshed at all.
 */
export async function ensureFreshToken(
  uid: string,
  provider: IntegrationProvider,
  tokens: StoredTokens,
): Promise<StoredTokens> {
  if (!tokens.refreshToken) return tokens;
  const unknownExpiry = tokens.expiresAt === undefined || !Number.isFinite(tokens.expiresAt);
  if (!unknownExpiry && tokens.expiresAt! >= Date.now() + 60_000) return tokens;

  const refreshed = await refreshAccessToken(provider, {
    clientId: clientIdFor(provider),
    clientSecret: clientSecretFor(provider),
    refreshToken: tokens.refreshToken,
  });

  const next: StoredTokens = {
    accessToken: refreshed.access_token as string,
    // A provider may rotate the refresh token on use; keeping the old one when
    // it does not is what makes this safe to call on every sweep.
    refreshToken: (refreshed.refresh_token as string | undefined) ?? tokens.refreshToken,
    expiresAt: expiresAtFrom(refreshed),
  };
  await storeTokens(uid, provider, next);
  return next;
}
