import { type Firestore, collection, doc, onSnapshot } from "firebase/firestore";
import { apiRequest, type KnowledgeApiClient } from "./knowledgeApi";
import type { IntegrationConnection, IntegrationProvider } from "./types";

const ALL_PROVIDERS: IntegrationProvider[] = ["github", "gitlab", "google_calendar", "strava"];

export function subscribeIntegrations(
  db: Firestore,
  uid: string,
  onChange: (connections: Record<IntegrationProvider, IntegrationConnection>) => void,
  onError?: (error: Error) => void,
): () => void {
  return onSnapshot(
    collection(db, "users", uid, "integrations"),
    (snapshot) => {
      const byProvider = {} as Record<IntegrationProvider, IntegrationConnection>;
      for (const provider of ALL_PROVIDERS) {
        byProvider[provider] = { provider, status: "disconnected" };
      }
      for (const d of snapshot.docs) {
        const data = d.data() as IntegrationConnection;
        byProvider[d.id as IntegrationProvider] = { ...data, provider: d.id as IntegrationProvider };
      }
      onChange(byProvider);
    },
    (error) => onError?.(error),
  );
}

export function integrationDocRef(db: Firestore, uid: string, provider: IntegrationProvider) {
  return doc(db, "users", uid, "integrations", provider);
}

/**
 * Asks the web app to begin a provider OAuth flow and returns the provider's
 * authorization URL for the caller to navigate to.
 *
 * These were `buildConnectUrl`/`buildDisconnectUrl`, which pasted the uid into
 * a query string that the server then trusted — so anyone could act on anyone
 * else's account. The uid is gone: the server derives it from the ID token that
 * `apiRequest` attaches, so a client can only ever act on itself.
 *
 * The caller performs the navigation (`location.href` on web,
 * `WebBrowser.openBrowserAsync` on mobile) because the bearer token can't ride
 * on a top-level browser navigation.
 */
export async function startOAuthConnect(
  client: KnowledgeApiClient,
  provider: IntegrationProvider,
  returnTo: string,
): Promise<string> {
  const { url } = await apiRequest<{ url: string }>(client, "/api/oauth/start", {
    method: "POST",
    body: { provider, returnTo },
  });
  return url;
}

/** Revokes the stored tokens for a provider on the caller's own account. */
export function disconnectIntegration(
  client: KnowledgeApiClient,
  provider: IntegrationProvider,
): Promise<{ ok: true }> {
  return apiRequest<{ ok: true }>(client, "/api/oauth/disconnect", {
    method: "POST",
    body: { provider },
  });
}
