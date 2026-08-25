import type { KnowledgeApiClient } from "@life-client/shared";
import { auth } from "./firebase";

// Same-origin client for apps/web's own API routes (/api/reminders/*, etc.) —
// distinct from apps/knowledge's client, which targets that separate deployment.
export const webApiClient: KnowledgeApiClient = {
  baseUrl: "",
  getIdToken: async () => (auth?.currentUser ? auth.currentUser.getIdToken() : null),
};
