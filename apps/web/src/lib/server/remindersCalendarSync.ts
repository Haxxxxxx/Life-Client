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
  const accessToken = await getGoogleCalendarAccessToken(uid);
  if (!accessToken) return;

  const ref = reminderRef(uid, reminderId);
  const snap = await ref.get();
  if (!snap.exists) return;
  const reminder = snap.data() as ReminderDoc;

  const start = new Date(reminder.deadline);
  const end = new Date(start.getTime() + REMINDER_EVENT_MINUTES * 60 * 1000);
  const input = {
    summary: reminder.title,
    description: reminder.note,
    start: start.toISOString(),
    end: end.toISOString(),
  };

  if (!reminder.calendarEventId) {
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
