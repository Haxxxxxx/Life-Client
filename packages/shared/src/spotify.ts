import { type Firestore, doc, onSnapshot } from "firebase/firestore";
import type { SpotifySummary } from "./types";

function spotifySummaryDoc(db: Firestore, uid: string) {
  return doc(db, "users", uid, "spotify", "summary");
}

export function subscribeSpotifySummary(
  db: Firestore,
  uid: string,
  onChange: (summary: SpotifySummary | null) => void,
): () => void {
  return onSnapshot(spotifySummaryDoc(db, uid), (snapshot) => {
    onChange(snapshot.exists() ? (snapshot.data() as SpotifySummary) : null);
  });
}
