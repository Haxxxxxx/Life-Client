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
    ? fb.subscribeSpotifySummary(b.firestore, uid, onChange)
    : sb.subscribeSpotifySummarySb(b.client, uid, onChange, onError);
}
