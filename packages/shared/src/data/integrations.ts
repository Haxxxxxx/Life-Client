import * as fb from "../integrations";
import * as sb from "../supabase/integrations";
import type { IntegrationConnection, IntegrationProvider } from "../types";
import { getDataBackend } from "./backend";

// HTTP calls against the web app's OAuth routes — backend-agnostic, and
// authenticated by the caller's ID token rather than a uid parameter.
export { startOAuthConnect, disconnectIntegration } from "../integrations";

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
