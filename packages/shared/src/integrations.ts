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
 * `webAppBaseUrl` is the deployed web app's origin, e.g. https://life-client.vercel.app
 * (its /api/oauth/* routes handle the exchange — see apps/web/src/app/api/oauth).
 */
export function buildConnectUrl(
  webAppBaseUrl: string,
  provider: IntegrationProvider,
  uid: string,
  returnTo: string,
): string {
  const url = new URL(`${webAppBaseUrl}/api/oauth/start`);
  url.searchParams.set("provider", provider);
  url.searchParams.set("uid", uid);
  url.searchParams.set("returnTo", returnTo);
  return url.toString();
}

export function buildDisconnectUrl(
  webAppBaseUrl: string,
  provider: IntegrationProvider,
  uid: string,
  returnTo: string,
): string {
  const url = new URL(`${webAppBaseUrl}/api/oauth/disconnect`);
  url.searchParams.set("provider", provider);
  url.searchParams.set("uid", uid);
  url.searchParams.set("returnTo", returnTo);
  return url.toString();
}
