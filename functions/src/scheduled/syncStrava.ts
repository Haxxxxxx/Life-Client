import { logger } from "firebase-functions";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { db } from "../lib/admin";
import { setIntegrationStatus } from "../lib/integrations";
import { refreshAccessToken } from "../lib/providers";
import { STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET } from "../lib/secrets";
import { allConnectedUids, getTokens, storeTokens, type StoredTokens } from "../lib/tokens";

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
    clientId: STRAVA_CLIENT_ID.value(),
    clientSecret: STRAVA_CLIENT_SECRET.value(),
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

export async function syncStravaForUser(uid: string): Promise<void> {
  const tokens = await getTokens(uid, "strava");
  if (!tokens) return;

  try {
    const fresh = await ensureFreshToken(uid, tokens);

    const response = await fetch("https://www.strava.com/api/v3/athlete/activities?per_page=30", {
      headers: { Authorization: `Bearer ${fresh.accessToken}` },
    });
    if (!response.ok) {
      throw new Error(`Strava activities fetch failed: ${response.status} ${await response.text()}`);
    }
    const activities = (await response.json()) as StravaActivity[];

    const batch = db.batch();
    const collection = db.collection("users").doc(uid).collection("sportActivities");
    for (const activity of activities) {
      batch.set(
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
    await batch.commit();

    await setIntegrationStatus(uid, "strava", {
      status: "connected",
      lastSyncAt: new Date().toISOString(),
    });
  } catch (error) {
    logger.error(`syncStravaForUser(${uid}) failed`, error);
    await setIntegrationStatus(uid, "strava", {
      status: "error",
      lastError: error instanceof Error ? error.message : String(error),
    });
  }
}

export const syncStravaActivities = onSchedule(
  { schedule: "every 60 minutes", secrets: [STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET] },
  async () => {
    const uids = await allConnectedUids("strava");
    await Promise.all(uids.map((uid) => syncStravaForUser(uid)));
  },
);
