import * as fb from "../integrations";
import * as sb from "../supabase/integrations";
import type { IntegrationConnection, IntegrationProvider } from "../types";
import { getDataBackend } from "./backend";

// pure URL builders — backend-agnostic
export { buildConnectUrl, buildDisconnectUrl } from "../integrations";

export function subscribeIntegrations(
  uid: string,
  onChange: (connections: Record<IntegrationProvider, IntegrationConnection>) => void,
  onError?: (error: Error) => void,
): () => void {
  const b = getDataBackend();
  return b.provider === "firebase"
    ? fb.subscribeIntegrations(b.firestore, uid, onChange, onError)
    : sb.subscribeIntegrationsSb(b.client, uid, onChange, onError);
}
