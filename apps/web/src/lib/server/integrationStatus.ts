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
