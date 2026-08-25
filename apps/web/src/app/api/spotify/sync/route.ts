import { NextRequest, NextResponse } from "next/server";
import { requireUid } from "@/lib/server/requireAuth";
import { syncSpotifyForUser } from "@/lib/server/syncSpotify";

/** Lets the signed-in user refresh their own recently-played/top-artists on
 * demand, rather than waiting for the once-daily cron (Vercel Hobby plan only
 * allows daily cron jobs). */
export async function POST(req: NextRequest) {
  const uid = await requireUid(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await syncSpotifyForUser(uid);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(`POST /api/spotify/sync failed for ${uid}`, error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Sync failed" }, { status: 500 });
  }
}
