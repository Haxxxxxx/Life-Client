import type { KnowledgeApiClient } from '@life-client/shared';
import { auth, KNOWLEDGE_APP_URL } from './firebase';

// The Knowledge AI routes live on the separately-deployed Knowledge app
// (apps/knowledge/src/app/api/knowledge/*), not on-device — mobile just calls
// out to them over HTTPS.
export const knowledgeApiClient: KnowledgeApiClient = {
  baseUrl: KNOWLEDGE_APP_URL,
  getIdToken: async () => (auth?.currentUser ? auth.currentUser.getIdToken() : null),
};
