import { type Firestore, collection, doc, onSnapshot } from "firebase/firestore";
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
 * Builds the URL that kicks off the server-side OAuth flow for a provider.
 * `functionsBaseUrl` is the deployed Cloud Functions HTTP base, e.g.
 * https://us-central1-<project-id>.cloudfunctions.net
 */
export function buildConnectUrl(
  functionsBaseUrl: string,
  provider: IntegrationProvider,
  uid: string,
  returnTo: string,
): string {
  const url = new URL(`${functionsBaseUrl}/oauthStart`);
  url.searchParams.set("provider", provider);
  url.searchParams.set("uid", uid);
  url.searchParams.set("returnTo", returnTo);
  return url.toString();
}

export function buildDisconnectUrl(
  functionsBaseUrl: string,
  provider: IntegrationProvider,
  uid: string,
  returnTo: string,
): string {
  const url = new URL(`${functionsBaseUrl}/oauthDisconnect`);
  url.searchParams.set("provider", provider);
  url.searchParams.set("uid", uid);
  url.searchParams.set("returnTo", returnTo);
  return url.toString();
}
