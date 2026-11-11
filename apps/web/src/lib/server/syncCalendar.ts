// Importing this module from a Client Component is a build error, not a runtime
// surprise. Everything in lib/server/ touches firebase-admin via a service
// account and (soon) a Supabase service-role key; previously the boundary was
// held by convention alone, so one bad import would have bundled credentials
// into the browser. admin.ts initialises lazily, so the mistake would not even
// have thrown until first use.
import "server-only";

import { adminDb } from "./admin";
import { forEachUser, type FanOutResult } from "./fanOut";
// The event shape was declared a second time here, minus `description`. One
// definition, in the module that owns the Google client.
import { type GoogleCalendarEvent } from "./googleCalendarClient";
import { briefProviderError, setIntegrationStatus } from "./integrationStatus";
import { allConnectedUids, ensureFreshToken, getTokens } from "./tokens";

export async function syncGoogleCalendarForUser(uid: string): Promise<void> {
  const tokens = await getTokens(uid, "google_calendar");
  if (!tokens?.refreshToken) return;

  try {
    // This used to call refreshAccessToken directly on every run, which was
    // wrong twice over. It never looked at expiresAt, so each sweep spent one
    // token request per user whether or not the existing token was still
    // valid. And it never stored the result: when Google returns a rotated
    // refresh_token the new one was dropped on the floor, so the saved
    // credential would eventually stop working and that user's calendar sync
    // would fail for good. ensureFreshToken in ./tokens does both correctly,
    // for every provider.
    const { accessToken } = await ensureFreshToken(uid, "google_calendar", tokens);

    const timeMin = new Date().toISOString();
    const timeMax = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    url.searchParams.set("timeMin", timeMin);
    url.searchParams.set("timeMax", timeMax);
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    // 250 with paging below, not 20. A busy week silently lost everything past
    // the twentieth event, and nothing ever told the user.
    url.searchParams.set("maxResults", "250");

    // Follow nextPageToken rather than taking whatever the first page held.
    const items: GoogleCalendarEvent[] = [];
    let pageToken: string | undefined;
    do {
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!response.ok) {
        throw new Error(
          `Google Calendar fetch failed: ${briefProviderError(response.status, await response.text())}`,
        );
      }
      const page = (await response.json()) as { items?: GoogleCalendarEvent[]; nextPageToken?: string };
      items.push(...(page.items ?? []));
      pageToken = page.nextPageToken;
    } while (pageToken);

    const batch = adminDb.batch();
    const collection = adminDb.collection("users").doc(uid).collection("calendarEvents");
    const seen = new Set<string>();
    for (const event of items) {
      seen.add(event.id);
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

    // Reconcile: anything mirrored that Google no longer returns for this
    // window has been cancelled, moved out of it, or deleted.
    //
    // The sync only ever upserted, so those rows stayed forever — and because
    // the client reads the collection ordered by start with a limit, once
    // enough stale past events accumulated they filled the whole page and the
    // agenda showed "No events yet" while real upcoming events existed.
    const mirrored = await collection.get();
    for (const doc of mirrored.docs) {
      if (seen.has(doc.id)) continue;
      const start = doc.data().start as string | undefined;
      // Only prune inside the window we just fetched; events outside it were
      // never candidates for this response and must not be deleted on its say-so.
      if (start && start >= timeMin && start <= timeMax) batch.delete(doc.ref);
      // Past events are dropped too: nothing renders them, and they are what
      // crowds out the live ones.
      else if (start && start < timeMin) batch.delete(doc.ref);
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
