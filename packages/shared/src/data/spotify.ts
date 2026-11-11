import * as fb from "../spotify";
import * as sb from "../supabase/spotify";
import type { SpotifySummary } from "../types";
import { getDataBackend } from "./backend";

export function subscribeSpotifySummary(
  uid: string,
  onChange: (summary: SpotifySummary | null) => void,
  onError?: (error: Error) => void,
): () => void {
  const b = getDataBackend();
  return b.provider === "firebase"
    ? // Forwards onError like the Supabase branch. Both doc-level
      // subscriptions in this package used to drop it, so a failed listener
      // was indistinguishable from an empty result.
      fb.subscribeSpotifySummary(b.firestore, uid, onChange, onError)
    : sb.subscribeSpotifySummarySb(b.client, uid, onChange, onError);
}
