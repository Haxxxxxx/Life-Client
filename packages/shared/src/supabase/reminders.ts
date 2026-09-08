import type { SupabaseClient } from "@supabase/supabase-js";
import type { NewReminder, Recurrence, Reminder } from "../types";
import { subscribeCollection } from "./realtime";

interface ReminderRow {
  id: string;
  title: string;
  note: string | null;
  deadline: string;
  calendar_event_id: string | null;
  recurrence: Recurrence | null;
  created_at: string;
  updated_at: string;
}

function rowToReminder(r: ReminderRow): Reminder {
  return {
    id: r.id,
    title: r.title,
    note: r.note ?? undefined,
    deadline: r.deadline,
    calendarEventId: r.calendar_event_id ?? undefined,
    recurrence: r.recurrence ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function reminderToRow(r: Partial<NewReminder>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (r.title !== undefined) row.title = r.title;
  if (r.note !== undefined) row.note = r.note ?? null;
  if (r.deadline !== undefined) row.deadline = r.deadline;
  if (r.recurrence !== undefined) row.recurrence = r.recurrence ?? null;
  return row;
}

export function subscribeRemindersSb(
  client: SupabaseClient,
  userId: string,
  onChange: (reminders: Reminder[]) => void,
  onError?: (error: Error) => void,
): () => void {
  return subscribeCollection<ReminderRow, Reminder>({
    client,
    table: "reminders",
    filterColumn: "user_id",
    filterValue: userId,
    rowId: (r) => r.id,
    map: rowToReminder,
    order: { column: "deadline", ascending: true },
    sort: (a, b) => (a.deadline < b.deadline ? -1 : a.deadline > b.deadline ? 1 : 0),
    onChange,
    onError,
  });
}

export async function createReminderSb(
  client: SupabaseClient,
  userId: string,
  reminder: NewReminder,
): Promise<string> {
  const id = globalThis.crypto.randomUUID();
  const { error } = await client
    .from("reminders")
    .insert({ id, user_id: userId, ...reminderToRow(reminder) });
  if (error) throw new Error(error.message);
  return id;
}

export async function updateReminderSb(
  client: SupabaseClient,
  userId: string,
  reminderId: string,
  patch: Partial<NewReminder>,
): Promise<void> {
  const { error } = await client
    .from("reminders")
    .update(reminderToRow(patch))
    .eq("id", reminderId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function deleteReminderSb(
  client: SupabaseClient,
  userId: string,
  reminderId: string,
): Promise<void> {
  const { error } = await client.from("reminders").delete().eq("id", reminderId).eq("user_id", userId);
  if (error) throw new Error(error.message);
}
