import * as crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { archiveStaleItemsForAllUsers } from "@/lib/server/archiveStaleItems";
import { sendDailyDigests } from "@/lib/server/sendDailyDigests";
import { syncAllGoogleCalendar } from "@/lib/server/syncCalendar";
import { syncAllDevActivity } from "@/lib/server/syncDevActivity";
import { syncAllSpotify } from "@/lib/server/syncSpotify";
import { syncAllStrava } from "@/lib/server/syncStrava";

export const maxDuration = 300;

/**
 * Constant-time compare of the bearer secret.
 *
 * The previous check was `authHeader !== \`Bearer ${process.env.CRON_SECRET}\``,
 * which fails *open*: with CRON_SECRET unset the expected value is the literal
 * string "Bearer undefined", so anyone could trigger a full cross-user sync and
 * the daily push digests on a preview deploy or a misconfigured production.
 * Requiring a non-trivial secret makes a missing env var deny every request
 * instead of accepting every request.
 *
 * Both sides are hashed first so timingSafeEqual always gets equal-length
 * buffers (it throws otherwise, and the throw itself leaks the length).
 */
function isAuthorizedCron(authHeader: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) {
    console.error("CRON_SECRET is unset or too short — refusing to run the sync cron");
    return false;
  }
  if (!authHeader) return false;
  const expected = crypto.createHash("sha256").update(`Bearer ${secret}`).digest();
  const actual = crypto.createHash("sha256").update(authHeader).digest();
  return crypto.timingSafeEqual(expected, actual);
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req.headers.get("authorization"))) {
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
  let digestUserFailures = 0;
  try {
    // Per-user failures are isolated inside the fan-out and come back as a
    // tally; `digestFailed` now means only that the sweep itself blew up, e.g.
    // listing the users with devices failed.
    digestUserFailures = (await sendDailyDigests()).failed;
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
    // Reported but deliberately not folded into `ok`: a digest is a courtesy
    // notification, and failing the whole cron run over one would mask the
    // sync result that actually matters.
    digestUserFailures,
    archived,
  };
  return NextResponse.json(body, { status: body.ok ? 200 : 500 });
}
