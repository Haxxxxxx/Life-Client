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

  const results = await Promise.allSettled([
    syncAllStrava(),
    syncAllDevActivity(),
    syncAllGoogleCalendar(),
    syncAllSpotify(),
  ]);
  const failures = results.filter((r) => r.status === "rejected");
  if (failures.length > 0) {
    console.error("cron/sync: some syncs failed", failures);
  }

  // Runs after syncing so the digest reflects freshly-synced data. A failure
  // here shouldn't mark the whole cron run as failed.
  try {
    await sendDailyDigests();
  } catch (err) {
    console.error("cron/sync: sendDailyDigests failed", err);
  }

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

  return NextResponse.json({ ok: true, failures: failures.length, archived });
}
