import {
  type Firestore,
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import type { SportActivity } from "./types";

export type NewManualSportActivity = Omit<SportActivity, "id" | "provider" | "externalId" | "externalUrl">;

export async function createManualSportActivity(
  db: Firestore,
  uid: string,
  activity: NewManualSportActivity,
): Promise<string> {
  const ref = await addDoc(collection(db, "users", uid, "sportActivities"), {
    ...activity,
    provider: "manual",
  });
  return ref.id;
}

export async function deleteSportActivity(db: Firestore, uid: string, activityId: string): Promise<void> {
  await deleteDoc(doc(db, "users", uid, "sportActivities", activityId));
}

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
