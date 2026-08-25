import { logger } from "firebase-functions";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { db } from "../lib/admin";
import { setIntegrationStatus } from "../lib/integrations";
import { refreshAccessToken } from "../lib/providers";
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } from "../lib/secrets";
import { allConnectedUids, getTokens } from "../lib/tokens";

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
      clientId: GOOGLE_CLIENT_ID.value(),
      clientSecret: GOOGLE_CLIENT_SECRET.value(),
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

    const batch = db.batch();
    const collection = db.collection("users").doc(uid).collection("calendarEvents");
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
    logger.error(`syncGoogleCalendarForUser(${uid}) failed`, error);
    await setIntegrationStatus(uid, "google_calendar", {
      status: "error",
      lastError: error instanceof Error ? error.message : String(error),
    });
  }
}

export const syncGoogleCalendar = onSchedule(
  { schedule: "every 30 minutes", secrets: [GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET] },
  async () => {
    const uids = await allConnectedUids("google_calendar");
    await Promise.all(uids.map((uid) => syncGoogleCalendarForUser(uid)));
  },
);
