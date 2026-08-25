import { type Firestore, collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import type { CalendarEvent } from "./types";

export function subscribeCalendarEvents(
  db: Firestore,
  uid: string,
  onChange: (events: CalendarEvent[]) => void,
  onError?: (error: Error) => void,
  max = 20,
): () => void {
  const q = query(
    collection(db, "users", uid, "calendarEvents"),
    orderBy("start", "asc"),
    limit(max),
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const events = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as CalendarEvent);
      onChange(events);
    },
    (error) => onError?.(error),
  );
}
