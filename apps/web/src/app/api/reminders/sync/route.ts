import { NextRequest, NextResponse } from "next/server";
import { deleteReminderEverywhere, syncReminderToCalendar } from "@/lib/server/remindersCalendarSync";
import { requireUid } from "@/lib/server/requireAuth";

export async function POST(req: NextRequest) {
  const uid = await requireUid(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { reminderId } = (await req.json()) as { reminderId?: string };
  if (!reminderId) return NextResponse.json({ error: "Missing reminderId" }, { status: 400 });

  try {
    await syncReminderToCalendar(uid, reminderId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(`POST /api/reminders/sync failed for ${uid}/${reminderId}`, error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Sync failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const uid = await requireUid(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { reminderId } = (await req.json()) as { reminderId?: string };
  if (!reminderId) return NextResponse.json({ error: "Missing reminderId" }, { status: 400 });

  try {
    await deleteReminderEverywhere(uid, reminderId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(`DELETE /api/reminders/sync failed for ${uid}/${reminderId}`, error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Delete failed" }, { status: 500 });
  }
}
