import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/server/admin";
import { requireUid } from "@/lib/server/requireAuth";

export async function POST(req: NextRequest) {
  const uid = await requireUid(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { drillId?: string };
  const drillId = typeof body.drillId === "string" ? body.drillId : undefined;
  if (!drillId) return NextResponse.json({ error: "Missing drillId" }, { status: 400 });

  await adminDb.collection("users").doc(uid).collection("codeDrills").doc(drillId).delete();
  return NextResponse.json({ ok: true });
}
