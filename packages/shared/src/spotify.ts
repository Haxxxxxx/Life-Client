import { type Firestore, doc, onSnapshot } from "firebase/firestore";
import type { SpotifySummary } from "./types";

function spotifySummaryDoc(db: Firestore, uid: string) {
  return doc(db, "users", uid, "spotify", "summary");
}

export function subscribeSpotifySummary(
  db: Firestore,
  uid: string,
  onChange: (summary: SpotifySummary | null) => void,
    // onError matches the other 16 subscriptions in this package. Without it,
  // onSnapshot swallows the failure: a permission denial or a dropped
  // connection leaves the caller holding whatever it last rendered, with no
  // error and no second callback — indistinguishable from "nothing here yet".
  onError?: (error: Error) => void,
): () => void {
  return onSnapshot(
    spotifySummaryDoc(db, uid),
    (snapshot) => {
      onChange(snapshot.exists() ? (snapshot.data() as SpotifySummary) : null);
    },
    (error) => onError?.(error),
  );
}
