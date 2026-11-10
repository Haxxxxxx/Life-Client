// Importing this module from a Client Component is a build error, not a runtime
// surprise. Everything in lib/server/ touches firebase-admin via a service
// account and (soon) a Supabase service-role key; previously the boundary was
// held by convention alone, so one bad import would have bundled credentials
// into the browser. admin.ts initialises lazily, so the mistake would not even
// have thrown until first use.
import "server-only";

import type { IntegrationProvider } from "@life-client/shared";
import { adminDb } from "./admin";

export interface IntegrationStatusPatch {
  status: "connected" | "disconnected" | "error";
  externalAccountLabel?: string;
  scopes?: string[];
  connectedAt?: string;
  lastSyncAt?: string;
  lastError?: string;
}

export async function setIntegrationStatus(
  uid: string,
  provider: IntegrationProvider,
  patch: IntegrationStatusPatch,
): Promise<void> {
  await adminDb
    .collection("users")
    .doc(uid)
    .collection("integrations")
    .doc(provider)
    .set(patch, { merge: true });
}
