import { NextRequest, NextResponse } from "next/server";
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

  return NextResponse.json({ ok: true, failures: failures.length });
}
