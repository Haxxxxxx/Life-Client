// Importing this module from a Client Component is a build error, not a runtime
// surprise. Everything in lib/server/ touches firebase-admin via a service
// account and (soon) a Supabase service-role key; previously the boundary was
// held by convention alone, so one bad import would have bundled credentials
// into the browser. admin.ts initialises lazily, so the mistake would not even
// have thrown until first use.
import "server-only";

import { adminDb } from "./admin";
import { forEachUser, type FanOutResult } from "./fanOut";
import { briefProviderError, getSyncCursor, setIntegrationStatus } from "./integrationStatus";
import { clientIdFor, clientSecretFor, refreshAccessToken } from "./providers";
import { allConnectedUids, getTokens, storeTokens, type StoredTokens } from "./tokens";

interface StravaActivity {
  id: number;
  name: string;
  type: string;
  start_date: string;
  distance?: number;
  moving_time?: number;
  total_elevation_gain?: number;
  average_heartrate?: number;
}

async function ensureFreshToken(uid: string, tokens: StoredTokens): Promise<StoredTokens> {
  const isExpired = tokens.expiresAt !== undefined && tokens.expiresAt < Date.now() + 60_000;
  if (!isExpired || !tokens.refreshToken) return tokens;

  const refreshed = await refreshAccessToken("strava", {
    clientId: clientIdFor("strava"),
    clientSecret: clientSecretFor("strava"),
    refreshToken: tokens.refreshToken,
  });

  const next: StoredTokens = {
    accessToken: refreshed.access_token as string,
    refreshToken: (refreshed.refresh_token as string | undefined) ?? tokens.refreshToken,
    expiresAt: (refreshed.expires_at as number) * 1000,
  };
  await storeTokens(uid, "strava", next);
  return next;
}

// Strava allows up to 200 per page; 100 is the usual courtesy ceiling and
// halves the chance of a slow response against their 15-minute rate window.
const PER_PAGE = 100;
// A run fetches at most this many pages. The cursor means the next run picks up
// where this one stopped, so the cap bounds a single invocation's time and
// memory without losing anything — it just takes more runs to backfill.
const MAX_PAGES = 10;
// Strava stamps an activity with when it *started*, but it arrives whenever the
// watch syncs — sometimes days later. Rewinding the cursor a day means a late
// upload is still inside the window on the next run rather than falling behind
// it forever. Re-fetching a day of activities is cheap; they are merge-written
// to a deterministic doc id, so a repeat is a no-op.
const CURSOR_OVERLAP_SEC = 24 * 60 * 60;

/**
 * Pages Strava's activity list from `after` towards the present.
 *
 * This used to be a single `per_page=30` fetch with no paging and no cursor:
 * the newest 30 activities, every run, forever. A user who came back from a
 * week away with 40 logged activities lost the oldest 10 permanently — the
 * next run asked for the newest 30 again and never looked further back.
 */
async function fetchActivities(accessToken: string, after: number | undefined): Promise<StravaActivity[]> {
  const all: StravaActivity[] = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = new URL("https://www.strava.com/api/v3/athlete/activities");
    url.searchParams.set("per_page", String(PER_PAGE));
    url.searchParams.set("page", String(page));
    if (after !== undefined) url.searchParams.set("after", String(after));

    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) {
      throw new Error(`Strava activities fetch failed: ${briefProviderError(response.status, await response.text())}`);
    }
    const batch = (await response.json()) as StravaActivity[];
    if (!Array.isArray(batch) || batch.length === 0) break;
    all.push(...batch);
    // A short page is the last page. Strava has no total count to compare to.
    if (batch.length < PER_PAGE) return all;

    if (page === MAX_PAGES) {
      // Worth stating plainly: the cursor still advances to the newest start
      // time seen, so an account with more than PER_PAGE * MAX_PAGES
      // activities waiting would have the middle of that window skipped
      // rather than fetched on a later run. Holding the cursor back instead
      // would re-fetch the same capped window forever and never progress at
      // all, which is worse. Reaching this at all needs a sync that has been
      // broken for a very long time, and the log makes it visible if it
      // happens.
      console.warn(`syncStrava: hit the ${MAX_PAGES}-page cap; older activities in this window were skipped`);
    }
  }

  return all;
}

export async function syncStravaForUser(uid: string): Promise<void> {
  const tokens = await getTokens(uid, "strava");
  if (!tokens) return;

  try {
    const fresh = await ensureFreshToken(uid, tokens);

    const storedCursor = await getSyncCursor(uid, "strava");
    const cursorSec = storedCursor === undefined ? undefined : Number(storedCursor);
    const after =
      cursorSec !== undefined && Number.isFinite(cursorSec)
        ? Math.max(0, Math.floor(cursorSec) - CURSOR_OVERLAP_SEC)
        : undefined;

    const activities = await fetchActivities(fresh.accessToken, after);

    // BulkWriter rather than a single batch: a batch caps at 500 writes, and
    // paging can now return far more than that in one run. It also retries
    // individual failures instead of losing the whole commit.
    const writer = adminDb.bulkWriter();
    const collection = adminDb.collection("users").doc(uid).collection("sportActivities");
    let newestStartSec = cursorSec !== undefined && Number.isFinite(cursorSec) ? cursorSec : 0;

    for (const activity of activities) {
      const startedAt = Date.parse(activity.start_date);
      // An activity Strava gave us without a usable start date would otherwise
      // poison the cursor with NaN and reset the window on every run.
      if (Number.isFinite(startedAt)) {
        newestStartSec = Math.max(newestStartSec, Math.floor(startedAt / 1000));
      }
      void writer.set(
        collection.doc(String(activity.id)),
        {
          provider: "strava",
          externalId: String(activity.id),
          type: activity.type,
          name: activity.name,
          startDate: activity.start_date,
          distanceMeters: activity.distance,
          movingTimeSec: activity.moving_time,
          elevationGainMeters: activity.total_elevation_gain,
          avgHeartRate: activity.average_heartrate,
          externalUrl: `https://www.strava.com/activities/${activity.id}`,
        },
        { merge: true },
      );
    }
    await writer.close();

    await setIntegrationStatus(uid, "strava", {
      status: "connected",
      lastSyncAt: new Date().toISOString(),
      // Only advanced after the writes land, so a crash mid-sync re-fetches
      // rather than skipping the window it never stored.
      ...(newestStartSec > 0 ? { syncCursor: String(newestStartSec) } : {}),
    });
  } catch (error) {
    console.error(`syncStravaForUser(${uid}) failed`, error);
    await setIntegrationStatus(uid, "strava", {
      status: "error",
      lastError: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function syncAllStrava(): Promise<FanOutResult> {
  const uids = await allConnectedUids("strava");
  return forEachUser("strava", uids, syncStravaForUser);
}
