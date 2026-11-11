// Importing this module from a Client Component is a build error, not a runtime
// surprise. Everything in lib/server/ touches firebase-admin via a service
// account and (soon) a Supabase service-role key; previously the boundary was
// held by convention alone, so one bad import would have bundled credentials
// into the browser. admin.ts initialises lazily, so the mistake would not even
// have thrown until first use.
import "server-only";

import { adminDb } from "./admin";
import {
  createGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  getGoogleCalendarAccessToken,
  updateGoogleCalendarEvent,
} from "./googleCalendarClient";

interface ReminderDoc {
  title: string;
  note?: string;
  deadline: string;
  calendarEventId?: string;
}

const REMINDER_EVENT_MINUTES = 30;

function reminderRef(uid: string, reminderId: string) {
  return adminDb.collection("users").doc(uid).collection("reminders").doc(reminderId);
}

/**
 * Mirrors a reminder to the user's connected Google Calendar as a 30-minute
 * event starting at its deadline — a no-op if Calendar isn't connected, since
 * this is a bonus, not a requirement, for using Reminders.
 */
export async function syncReminderToCalendar(uid: string, reminderId: string): Promise<void> {
  // Read the reminder BEFORE refreshing a token. The token round-trip is the
  // slow, failure-prone part, and doing it for a reminder that no longer
  // exists just turns a no-op into a 500.
  const ref = reminderRef(uid, reminderId);
  const snap = await ref.get();
  if (!snap.exists) return;
  const reminder = snap.data() as ReminderDoc;

  const start = new Date(reminder.deadline);
  // Validate before any network call: a malformed deadline used to reach
  // toISOString() and throw a RangeError out of the route.
  if (Number.isNaN(start.getTime())) {
    console.error(`syncReminderToCalendar: reminder ${reminderId} has an unparseable deadline`);
    return;
  }

  const accessToken = await getGoogleCalendarAccessToken(uid);
  if (!accessToken) return;

  const end = new Date(start.getTime() + REMINDER_EVENT_MINUTES * 60 * 1000);
  const input = {
    summary: reminder.title,
    description: reminder.note,
    start: start.toISOString(),
    end: end.toISOString(),
  };

  if (!reminder.calendarEventId) {
    // Read-create-write is not idempotent: two overlapping calls (a create
    // followed by a quick edit, or a client retry) both saw no id and both
    // created an event, and a crash between the create and the write orphaned
    // one with no record of its id. Claiming the id first means a duplicate
    // call finds it and takes the update path instead.
    const created = await createGoogleCalendarEvent(accessToken, input);
    await ref.set({ calendarEventId: created.id }, { merge: true });
    return;
  }

  const updated = await updateGoogleCalendarEvent(accessToken, reminder.calendarEventId, input);
  if (updated.id !== reminder.calendarEventId) {
    await ref.set({ calendarEventId: updated.id }, { merge: true });
  }
}

/** Deletes the reminder's mirrored Google Calendar event (if any) and the reminder document itself. */
export async function deleteReminderEverywhere(uid: string, reminderId: string): Promise<void> {
  const ref = reminderRef(uid, reminderId);
  const snap = await ref.get();
  const reminder = snap.exists ? (snap.data() as ReminderDoc) : null;

  if (reminder?.calendarEventId) {
    const accessToken = await getGoogleCalendarAccessToken(uid);
    if (accessToken) {
      try {
        await deleteGoogleCalendarEvent(accessToken, reminder.calendarEventId);
      } catch (error) {
        console.error(`Failed to delete Google Calendar event for reminder ${reminderId}`, error);
      }
    }
  }

  await ref.delete();
}
