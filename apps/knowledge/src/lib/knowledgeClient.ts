import type { KnowledgeApiClient } from "@life-client/shared";
import { auth } from "./firebase";

export const knowledgeApiClient: KnowledgeApiClient = {
  baseUrl: "",
  getIdToken: async () => (auth?.currentUser ? auth.currentUser.getIdToken() : null),
};
