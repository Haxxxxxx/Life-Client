import type { KnowledgeApiClient } from '@life-client/shared';
import { auth, WEB_APP_URL } from './firebase';

// The reminders-sync routes live on the deployed web app's own API
// (apps/web/src/app/api/reminders/*) — same backend as OAuth, not on-device.
export const webApiClient: KnowledgeApiClient = {
  baseUrl: WEB_APP_URL,
  getIdToken: async () => (auth?.currentUser ? auth.currentUser.getIdToken() : null),
};
