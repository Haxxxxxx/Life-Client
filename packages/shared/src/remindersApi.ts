import { apiRequest, type KnowledgeApiClient } from "./knowledgeApi";

/**
 * Best-effort mirrors a reminder to the user's connected Google Calendar (a
 * no-op server-side if Calendar isn't connected). Call after creating a
 * reminder; failures shouldn't block the reminder itself from existing.
 */
export function syncReminderToCalendar(
  client: KnowledgeApiClient,
  reminderId: string,
): Promise<{ ok: true }> {
  return apiRequest<{ ok: true }>(client, "/api/reminders/sync", { method: "POST", body: { reminderId } });
}

/**
 * Deletes the reminder's mirrored Google Calendar event (if any) and the
 * reminder document itself — the single way to delete a reminder, so the two
 * stay in sync.
 */
export function deleteReminderEverywhere(
  client: KnowledgeApiClient,
  reminderId: string,
): Promise<{ ok: true }> {
  return apiRequest<{ ok: true }>(client, "/api/reminders/sync", { method: "DELETE", body: { reminderId } });
}
