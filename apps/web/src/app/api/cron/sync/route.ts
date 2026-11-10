import { NextRequest, NextResponse } from "next/server";
import { archiveStaleItemsForAllUsers } from "@/lib/server/archiveStaleItems";
import { sendDailyDigests } from "@/lib/server/sendDailyDigests";
import { syncAllGoogleCalendar } from "@/lib/server/syncCalendar";
import { syncAllDevActivity } from "@/lib/server/syncDevActivity";
import { syncAllSpotify } from "@/lib/server/syncSpotify";
import { syncAllStrava } from "@/lib/server/syncStrava";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Runs first, before the syncs/digest below get a chance to eat into the
  // route's shared 300s budget — archiving is cheap and shouldn't get starved
  // on a day where an upstream sync API is slow.
  let archived = { users: 0, goals: 0, tasks: 0 };
  try {
    archived = await archiveStaleItemsForAllUsers();
    if (archived.goals + archived.tasks > 0) {
      console.log(
        `cron/sync: archived ${archived.goals} goal(s) and ${archived.tasks} task(s) across ${archived.users} user(s)`,
      );
    }
  } catch (err) {
    console.error("cron/sync: archiveStaleItemsForAllUsers failed", err);
  }

  // Each syncAll* now isolates per-user failures internally and reports a
  // tally, so a provider only rejects here if the whole fan-out blew up
  // (e.g. listing connected uids failed).
  const settled = await Promise.allSettled([
    syncAllStrava(),
    syncAllDevActivity(),
    syncAllGoogleCalendar(),
    syncAllSpotify(),
  ]);

  let userFailures = 0;
  let providerFailures = 0;
  for (const result of settled) {
    if (result.status === "rejected") {
      providerFailures += 1;
      console.error("cron/sync: a provider sweep failed outright", result.reason);
    } else {
      userFailures += result.value.failed;
    }
  }

  // Runs after syncing so the digest reflects freshly-synced data. A failure
  // here shouldn't mark the whole cron run as failed.
  let digestFailed = false;
  try {
    await sendDailyDigests();
  } catch (err) {
    digestFailed = true;
    console.error("cron/sync: sendDailyDigests failed", err);
  }

  // Previously this always returned 200 with a `failures` count in the body,
  // so Vercel Cron and any alerting recorded a clean run no matter how much
  // had actually failed. A non-200 is the only signal those systems read.
  const body = {
    ok: providerFailures === 0 && userFailures === 0,
    providerFailures,
    userFailures,
    digestFailed,
    archived,
  };
  return NextResponse.json(body, { status: body.ok ? 200 : 500 });
}
