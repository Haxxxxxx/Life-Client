import { isIntegrationProvider } from "@life-client/shared";
import { NextRequest, NextResponse } from "next/server";
import { setIntegrationStatus } from "@/lib/server/integrationStatus";
import { requireUid } from "@/lib/server/requireAuth";
import { deleteTokens } from "@/lib/server/tokens";

/**
 * Disconnects a provider for the *authenticated* caller.
 *
 * This used to be a GET taking `?uid=` with no auth at all, so
 * `/api/oauth/disconnect?provider=strava&uid=<anyone>` deleted that user's
 * tokens — and because it was a GET with side effects, a bare <img> tag was
 * enough to fire it cross-site.
 *
 * It is now a POST (no longer reachable by image/prefetch) that derives the uid
 * from a verified Firebase ID token. Auth rides in the Authorization header, so
 * there is no ambient-credential CSRF surface either.
 */
export async function POST(req: NextRequest) {
  const uid = await requireUid(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { provider?: string };
  const provider = body.provider;

  if (!isIntegrationProvider(provider)) {
    return NextResponse.json({ error: "Missing or invalid provider" }, { status: 400 });
  }

  await deleteTokens(uid, provider);
  await setIntegrationStatus(uid, provider, { status: "disconnected" });

  return NextResponse.json({ ok: true });
}
