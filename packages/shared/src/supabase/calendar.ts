import type { SupabaseClient } from "@supabase/supabase-js";
import type { CalendarEvent } from "../types";
import { subscribeCollection } from "./realtime";

interface CalendarEventRow {
  id: string;
  title: string;
  start_ts: string;
  end_ts: string;
  location: string | null;
  url: string | null;
}

function rowToEvent(r: CalendarEventRow): CalendarEvent {
  return {
    id: r.id,
    title: r.title,
    start: r.start_ts,
    end: r.end_ts,
    location: r.location ?? undefined,
    url: r.url ?? undefined,
  };
}

export function subscribeCalendarEventsSb(
  client: SupabaseClient,
  userId: string,
  onChange: (events: CalendarEvent[]) => void,
  onError?: (error: Error) => void,
  max = 20,
): () => void {
  return subscribeCollection<CalendarEventRow, CalendarEvent>({
    client,
    table: "calendar_events",
    filterColumn: "user_id",
    filterValue: userId,
    rowId: (r) => r.id,
    map: rowToEvent,
    order: { column: "start_ts", ascending: true },
    sort: (a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0),
    onChange: (rows) => onChange(rows.slice(0, max)),
    onError,
  });
}
