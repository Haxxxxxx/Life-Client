import * as fb from "../calendar";
import * as sb from "../supabase/calendar";
import type { CalendarEvent } from "../types";
import { getDataBackend } from "./backend";

export function subscribeCalendarEvents(
  uid: string,
  onChange: (events: CalendarEvent[]) => void,
  onError?: (error: Error) => void,
  max = 20,
): () => void {
  const b = getDataBackend();
  return b.provider === "firebase"
    ? fb.subscribeCalendarEvents(b.firestore, uid, onChange, onError, max)
    : sb.subscribeCalendarEventsSb(b.client, uid, onChange, onError, max);
}
