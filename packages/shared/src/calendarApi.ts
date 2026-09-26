import { errorMessageFromBody, type KnowledgeApiClient } from "./knowledgeApi";

async function call<T>(
  client: KnowledgeApiClient,
  path: string,
  method: "POST" | "PATCH" | "DELETE",
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
    throw new Error(errorMessageFromBody(text, `Request to ${path} failed: ${response.status}`));
  }
  return (await response.json()) as T;
}

export interface NewCalendarEventInput {
  title: string;
  start: string; // ISO datetime
  end: string; // ISO datetime
  location?: string;
}

/** Creates an event directly on the user's connected Google Calendar (requires Calendar to be connected). */
export function createCalendarEvent(
  client: KnowledgeApiClient,
  input: NewCalendarEventInput,
): Promise<{ id: string }> {
  return call(client, "/api/calendar/events", "POST", input);
}

export function updateCalendarEvent(
  client: KnowledgeApiClient,
  eventId: string,
  input: NewCalendarEventInput,
): Promise<{ id: string }> {
  return call(client, "/api/calendar/events", "PATCH", { eventId, ...input });
}

export function deleteCalendarEvent(client: KnowledgeApiClient, eventId: string): Promise<{ ok: true }> {
  return call(client, "/api/calendar/events", "DELETE", { eventId });
}
