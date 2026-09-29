import { apiRequest, type KnowledgeApiClient } from "./knowledgeApi";

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
  return apiRequest<{ id: string }>(client, "/api/calendar/events", { method: "POST", body: input });
}

export function updateCalendarEvent(
  client: KnowledgeApiClient,
  eventId: string,
  input: NewCalendarEventInput,
): Promise<{ id: string }> {
  return apiRequest<{ id: string }>(client, "/api/calendar/events", {
    method: "PATCH",
    body: { eventId, ...input },
  });
}

export function deleteCalendarEvent(client: KnowledgeApiClient, eventId: string): Promise<{ ok: true }> {
  return apiRequest<{ ok: true }>(client, "/api/calendar/events", { method: "DELETE", body: { eventId } });
}
