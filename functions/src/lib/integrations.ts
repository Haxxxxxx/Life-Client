import { db } from "./admin";
import type { IntegrationProvider } from "./types";

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
  await db
    .collection("users")
    .doc(uid)
    .collection("integrations")
    .doc(provider)
    .set(patch, { merge: true });
}
