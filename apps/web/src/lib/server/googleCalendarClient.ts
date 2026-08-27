import { clientIdFor, clientSecretFor, refreshAccessToken } from "./providers";
import { getTokens, storeTokens, type StoredTokens } from "./tokens";

export async function ensureFreshGoogleToken(uid: string, tokens: StoredTokens): Promise<StoredTokens> {
  const isExpired = tokens.expiresAt !== undefined && tokens.expiresAt < Date.now() + 60_000;
  if (!isExpired || !tokens.refreshToken) return tokens;

  const refreshed = await refreshAccessToken("google_calendar", {
    clientId: clientIdFor("google_calendar"),
    clientSecret: clientSecretFor("google_calendar"),
    refreshToken: tokens.refreshToken,
  });
  const next: StoredTokens = {
    accessToken: refreshed.access_token as string,
    refreshToken: (refreshed.refresh_token as string | undefined) ?? tokens.refreshToken,
    expiresAt: Date.now() + (refreshed.expires_in as number) * 1000,
  };
  await storeTokens(uid, "google_calendar", next);
  return next;
}

/** Null if the user hasn't connected Google Calendar. */
export async function getGoogleCalendarAccessToken(uid: string): Promise<string | null> {
  const tokens = await getTokens(uid, "google_calendar");
  if (!tokens?.refreshToken) return null;
  const { accessToken } = await ensureFreshGoogleToken(uid, tokens);
  return accessToken;
}

export interface GoogleCalendarEventInput {
  summary: string;
  description?: string;
  location?: string;
  start: string; // ISO datetime
  end: string; // ISO datetime
}

export interface GoogleCalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  htmlLink?: string;
}

const EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

function eventBody(input: GoogleCalendarEventInput) {
  return {
    summary: input.summary,
    description: input.description,
    location: input.location,
    start: { dateTime: input.start },
    end: { dateTime: input.end },
  };
}

export async function createGoogleCalendarEvent(
  accessToken: string,
  input: GoogleCalendarEventInput,
): Promise<GoogleCalendarEvent> {
  const res = await fetch(EVENTS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(eventBody(input)),
  });
  if (!res.ok) throw new Error(`Google Calendar event create failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as GoogleCalendarEvent;
}

/** Updates an event; if it was deleted on the Google side (404), transparently recreates it instead. */
export async function updateGoogleCalendarEvent(
  accessToken: string,
  eventId: string,
  input: GoogleCalendarEventInput,
): Promise<GoogleCalendarEvent> {
  const res = await fetch(`${EVENTS_URL}/${eventId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(eventBody(input)),
  });
  if (res.ok) return (await res.json()) as GoogleCalendarEvent;
  if (res.status === 404) return createGoogleCalendarEvent(accessToken, input);
  throw new Error(`Google Calendar event update failed: ${res.status} ${await res.text()}`);
}

export async function deleteGoogleCalendarEvent(accessToken: string, eventId: string): Promise<void> {
  const res = await fetch(`${EVENTS_URL}/${eventId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`Google Calendar event delete failed: ${res.status}`);
  }
}
