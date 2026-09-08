import * as fb from "../reminders";
import * as sb from "../supabase/reminders";
import type { NewReminder, Reminder } from "../types";
import { getDataBackend } from "./backend";

export { daysUntil, reminderUrgency, isDueSoon } from "../reminders";
export type { ReminderUrgency } from "../reminders";

export function subscribeReminders(
  uid: string,
  onChange: (reminders: Reminder[]) => void,
  onError?: (error: Error) => void,
): () => void {
  const b = getDataBackend();
  return b.provider === "firebase"
    ? fb.subscribeReminders(b.firestore, uid, onChange, onError)
    : sb.subscribeRemindersSb(b.client, uid, onChange, onError);
}

export function createReminder(uid: string, reminder: NewReminder): Promise<string> {
  const b = getDataBackend();
  return b.provider === "firebase"
    ? fb.createReminder(b.firestore, uid, reminder)
    : sb.createReminderSb(b.client, uid, reminder);
}

export function updateReminder(uid: string, reminderId: string, patch: Partial<NewReminder>): Promise<void> {
  const b = getDataBackend();
  return b.provider === "firebase"
    ? fb.updateReminder(b.firestore, uid, reminderId, patch)
    : sb.updateReminderSb(b.client, uid, reminderId, patch);
}

export function deleteReminder(uid: string, reminderId: string): Promise<void> {
  const b = getDataBackend();
  return b.provider === "firebase"
    ? fb.deleteReminder(b.firestore, uid, reminderId)
    : sb.deleteReminderSb(b.client, uid, reminderId);
}
