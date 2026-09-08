import * as fb from "../sports";
import * as sb from "../supabase/sports";
import type { SportActivity } from "../types";
import { getDataBackend } from "./backend";

export type { NewManualSportActivity } from "../sports";

export function subscribeSportActivities(
  uid: string,
  onChange: (activities: SportActivity[]) => void,
  onError?: (error: Error) => void,
  max = 50,
): () => void {
  const b = getDataBackend();
  return b.provider === "firebase"
    ? fb.subscribeSportActivities(b.firestore, uid, onChange, onError, max)
    : sb.subscribeSportActivitiesSb(b.client, uid, onChange, onError, max);
}

export function createManualSportActivity(uid: string, activity: fb.NewManualSportActivity): Promise<string> {
  const b = getDataBackend();
  return b.provider === "firebase"
    ? fb.createManualSportActivity(b.firestore, uid, activity)
    : sb.createManualSportActivitySb(b.client, uid, activity);
}

export function deleteSportActivity(uid: string, activityId: string): Promise<void> {
  const b = getDataBackend();
  return b.provider === "firebase"
    ? fb.deleteSportActivity(b.firestore, uid, activityId)
    : sb.deleteSportActivitySb(b.client, uid, activityId);
}
