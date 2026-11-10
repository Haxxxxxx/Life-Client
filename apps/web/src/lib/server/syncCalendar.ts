import { adminDb } from "./admin";
import { forEachUser, type FanOutResult } from "./fanOut";
import { setIntegrationStatus } from "./integrationStatus";
import { clientIdFor, clientSecretFor, refreshAccessToken } from "./providers";
import { allConnectedUids, getTokens } from "./tokens";

interface GoogleCalendarEvent {
  id: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  location?: string;
  htmlLink?: string;
}

export async function syncGoogleCalendarForUser(uid: string): Promise<void> {
  const tokens = await getTokens(uid, "google_calendar");
  if (!tokens?.refreshToken) return;

  try {
    const refreshed = await refreshAccessToken("google_calendar", {
      clientId: clientIdFor("google_calendar"),
      clientSecret: clientSecretFor("google_calendar"),
      refreshToken: tokens.refreshToken,
    });
    const accessToken = refreshed.access_token as string;

    const timeMin = new Date().toISOString();
    const timeMax = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    url.searchParams.set("timeMin", timeMin);
    url.searchParams.set("timeMax", timeMax);
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("maxResults", "20");

    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) {
      throw new Error(`Google Calendar fetch failed: ${response.status} ${await response.text()}`);
    }
    const data = (await response.json()) as { items: GoogleCalendarEvent[] };

    const batch = adminDb.batch();
    const collection = adminDb.collection("users").doc(uid).collection("calendarEvents");
    for (const event of data.items ?? []) {
      batch.set(
        collection.doc(event.id),
        {
          title: event.summary ?? "(no title)",
          start: event.start?.dateTime ?? event.start?.date,
          end: event.end?.dateTime ?? event.end?.date,
          location: event.location,
          url: event.htmlLink,
        },
        { merge: true },
      );
    }
    await batch.commit();

    await setIntegrationStatus(uid, "google_calendar", {
      status: "connected",
      lastSyncAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`syncGoogleCalendarForUser(${uid}) failed`, error);
    await setIntegrationStatus(uid, "google_calendar", {
      status: "error",
      lastError: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function syncAllGoogleCalendar(): Promise<FanOutResult> {
  const uids = await allConnectedUids("google_calendar");
  return forEachUser("google_calendar", uids, syncGoogleCalendarForUser);
}
