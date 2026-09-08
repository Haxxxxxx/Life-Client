import { isIntegrationProvider } from "@life-client/shared";
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/server/admin";
import { triggerInitialSync } from "@/lib/server/oauthExchange";
import { requireUid } from "@/lib/server/requireAuth";

// GitHub GraphQL x2 + merged count, or GitLab list + a pipeline call per MR —
// well under a minute in practice, but give it headroom.
export const maxDuration = 60;

/**
 * On-demand re-sync for a single connected provider. Same work the OAuth callback
 * kicks off via `after()`, exposed so the Integrations page has a "Sync now" button
 * (the per-provider syncers swallow their own errors and just write `status: error`
 * on the integration doc, so we read that back to report the real outcome).
 */
export async function POST(req: NextRequest) {
  const uid = await requireUid(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { provider } = (await req.json().catch(() => ({}))) as { provider?: string };
  if (!isIntegrationProvider(provider)) {
    return NextResponse.json({ error: "Missing or invalid provider" }, { status: 400 });
  }

  try {
    await triggerInitialSync(provider, uid);
  } catch (error) {
    console.error(`POST /api/integrations/sync threw for ${uid}/${provider}`, error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Sync failed" }, { status: 500 });
  }

  const snap = await adminDb.collection("users").doc(uid).collection("integrations").doc(provider).get();
  const data = (snap.data() ?? {}) as { status?: string; lastError?: string; lastSyncAt?: string };
  if (data.status === "error") {
    return NextResponse.json({ error: data.lastError ?? "Sync failed" }, { status: 502 });
  }
  return NextResponse.json({ ok: true, lastSyncAt: data.lastSyncAt ?? null });
}
