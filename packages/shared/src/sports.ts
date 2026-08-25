import { type Firestore, collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import type { SportActivity } from "./types";

export function subscribeSportActivities(
  db: Firestore,
  uid: string,
  onChange: (activities: SportActivity[]) => void,
  onError?: (error: Error) => void,
  max = 50,
): () => void {
  const q = query(
    collection(db, "users", uid, "sportActivities"),
    orderBy("startDate", "desc"),
    limit(max),
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const activities = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as SportActivity);
      onChange(activities);
    },
    (error) => onError?.(error),
  );
}
