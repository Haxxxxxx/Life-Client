import { type Firestore, doc, onSnapshot } from "firebase/firestore";
import type { DevActivitySummary } from "./types";

export function subscribeDevActivity(
  db: Firestore,
  uid: string,
  provider: "github" | "gitlab",
  onChange: (summary: DevActivitySummary | null) => void,
  onError?: (error: Error) => void,
): () => void {
  return onSnapshot(
    doc(db, "users", uid, "devActivity", provider),
    (snapshot) => {
      onChange(snapshot.exists() ? (snapshot.data() as DevActivitySummary) : null);
    },
    (error) => onError?.(error),
  );
}
