import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/server/admin";
import {
  createGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  getGoogleCalendarAccessToken,
  updateGoogleCalendarEvent,
} from "@/lib/server/googleCalendarClient";
import { requireUid } from "@/lib/server/requireAuth";

interface EventInput {
  title: string;
  start: string; // ISO datetime
  end: string; // ISO datetime
  location?: string;
}

function calendarEventsCollection(uid: string) {
  return adminDb.collection("users").doc(uid).collection("calendarEvents");
}

async function mirrorToFirestore(
  uid: string,
  eventId: string,
  input: EventInput,
  htmlLink?: string,
): Promise<void> {
  await calendarEventsCollection(uid).doc(eventId).set(
    {
      title: input.title,
      start: input.start,
      end: input.end,
      location: input.location,
      url: htmlLink,
    },
    { merge: true },
  );
}

export async function POST(req: NextRequest) {
  const uid = await requireUid(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const input = (await req.json()) as Partial<EventInput>;
  if (!input.title || !input.start || !input.end) {
    return NextResponse.json({ error: "Missing title/start/end" }, { status: 400 });
  }

  const accessToken = await getGoogleCalendarAccessToken(uid);
  if (!accessToken) {
    return NextResponse.json({ error: "Google Calendar isn't connected" }, { status: 400 });
  }

  try {
    const created = await createGoogleCalendarEvent(accessToken, {
      summary: input.title,
      location: input.location,
      start: input.start,
      end: input.end,
    });
    await mirrorToFirestore(uid, created.id, input as EventInput, created.htmlLink);
    return NextResponse.json({ id: created.id });
  } catch (error) {
    console.error(`POST /api/calendar/events failed for ${uid}`, error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Create failed" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const uid = await requireUid(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as Partial<EventInput> & { eventId?: string };
  if (!body.eventId || !body.title || !body.start || !body.end) {
    return NextResponse.json({ error: "Missing eventId/title/start/end" }, { status: 400 });
  }

  const accessToken = await getGoogleCalendarAccessToken(uid);
  if (!accessToken) {
    return NextResponse.json({ error: "Google Calendar isn't connected" }, { status: 400 });
  }

  try {
    const updated = await updateGoogleCalendarEvent(accessToken, body.eventId, {
      summary: body.title,
      location: body.location,
      start: body.start,
      end: body.end,
    });
    if (updated.id !== body.eventId) {
      await calendarEventsCollection(uid).doc(body.eventId).delete();
    }
    await mirrorToFirestore(uid, updated.id, body as EventInput, updated.htmlLink);
    return NextResponse.json({ id: updated.id });
  } catch (error) {
    console.error(`PATCH /api/calendar/events failed for ${uid}/${body.eventId}`, error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Update failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const uid = await requireUid(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { eventId } = (await req.json()) as { eventId?: string };
  if (!eventId) return NextResponse.json({ error: "Missing eventId" }, { status: 400 });

  const accessToken = await getGoogleCalendarAccessToken(uid);
  if (!accessToken) {
    return NextResponse.json({ error: "Google Calendar isn't connected" }, { status: 400 });
  }

  try {
    await deleteGoogleCalendarEvent(accessToken, eventId);
    await calendarEventsCollection(uid).doc(eventId).delete();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(`DELETE /api/calendar/events failed for ${uid}/${eventId}`, error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Delete failed" }, { status: 500 });
  }
}
