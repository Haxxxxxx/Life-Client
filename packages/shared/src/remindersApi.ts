import type { KnowledgeApiClient } from "./knowledgeApi";

async function call<T>(
  client: KnowledgeApiClient,
  path: string,
  method: "POST" | "DELETE",
  body: unknown,
): Promise<T> {
  const token = await client.getIdToken();
  if (!token) throw new Error("Not signed in");
  const response = await fetch(`${client.baseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body ?? {}),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request to ${path} failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

/**
 * Best-effort mirrors a reminder to the user's connected Google Calendar (a
 * no-op server-side if Calendar isn't connected). Call after creating a
 * reminder; failures shouldn't block the reminder itself from existing.
 */
export function syncReminderToCalendar(
  client: KnowledgeApiClient,
  reminderId: string,
): Promise<{ ok: true }> {
  return call(client, "/api/reminders/sync", "POST", { reminderId });
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
  return call(client, "/api/reminders/sync", "DELETE", { reminderId });
}
