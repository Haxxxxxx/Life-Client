import { adminDb } from "./admin";
import { clientIdFor, clientSecretFor, refreshAccessToken } from "./providers";
import { getTokens, storeTokens, type StoredTokens } from "./tokens";

interface ReminderDoc {
  title: string;
  note?: string;
  deadline: string;
  calendarEventId?: string;
}

async function ensureFreshGoogleToken(uid: string, tokens: StoredTokens): Promise<StoredTokens> {
  const isExpired = tokens.expiresAt !== undefined && tokens.expiresAt < Date.now() + 60_000;
  if (!isExpired || !tokens.refreshToken) return tokens;

  const refreshed = await refreshAccessToken("google_calendar", {
    clientId: clientIdFor("google_calendar"),
    clientSecret: clientSecretFor("google_calendar"),
    refreshToken: tokens.refreshToken,
  });
  const next: StoredTokens = {
    accessToken: refreshed.access_token as string,
    refreshToken: (refreshed.refresh_token as string | undefined) ?? tokens.refreshToken,
    expiresAt: Date.now() + (refreshed.expires_in as number) * 1000,
  };
  await storeTokens(uid, "google_calendar", next);
  return next;
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
  const tokens = await getTokens(uid, "google_calendar");
  if (!tokens?.refreshToken) return;

  const ref = reminderRef(uid, reminderId);
  const snap = await ref.get();
  if (!snap.exists) return;
  const reminder = snap.data() as ReminderDoc;

  const { accessToken } = await ensureFreshGoogleToken(uid, tokens);
  const start = new Date(reminder.deadline);
  const end = new Date(start.getTime() + REMINDER_EVENT_MINUTES * 60 * 1000);
  const body = {
    summary: reminder.title,
    description: reminder.note,
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
  };
  const headers = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
  const createUrl = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

  async function create(): Promise<void> {
    const res = await fetch(createUrl, { method: "POST", headers, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`Google Calendar event create failed: ${res.status} ${await res.text()}`);
    const created = (await res.json()) as { id: string };
    await ref.set({ calendarEventId: created.id }, { merge: true });
  }

  if (!reminder.calendarEventId) {
    await create();
    return;
  }

  const res = await fetch(`${createUrl}/${reminder.calendarEventId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });
  if (res.ok) return;
  // The linked event was deleted on the Google Calendar side — recreate it.
  if (res.status === 404) {
    await create();
    return;
  }
  throw new Error(`Google Calendar event update failed: ${res.status} ${await res.text()}`);
}

/** Deletes the reminder's mirrored Google Calendar event (if any) and the reminder document itself. */
export async function deleteReminderEverywhere(uid: string, reminderId: string): Promise<void> {
  const ref = reminderRef(uid, reminderId);
  const snap = await ref.get();
  const reminder = snap.exists ? (snap.data() as ReminderDoc) : null;

  if (reminder?.calendarEventId) {
    const tokens = await getTokens(uid, "google_calendar");
    if (tokens?.refreshToken) {
      try {
        const { accessToken } = await ensureFreshGoogleToken(uid, tokens);
        const res = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events/${reminder.calendarEventId}`,
          { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } },
        );
        if (!res.ok && res.status !== 404 && res.status !== 410) {
          console.error(`Failed to delete Google Calendar event for reminder ${reminderId}: ${res.status}`);
        }
      } catch (error) {
        console.error(`Failed to delete Google Calendar event for reminder ${reminderId}`, error);
      }
    }
  }

  await ref.delete();
}
