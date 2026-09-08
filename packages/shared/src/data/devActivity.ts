import * as fb from "../devActivity";
import * as sb from "../supabase/devActivity";
import type { DevActivitySummary } from "../types";
import { getDataBackend } from "./backend";

export function subscribeDevActivity(
  uid: string,
  provider: "github" | "gitlab",
  onChange: (summary: DevActivitySummary | null) => void,
  onError?: (error: Error) => void,
): () => void {
  const b = getDataBackend();
  return b.provider === "firebase"
    ? fb.subscribeDevActivity(b.firestore, uid, provider, onChange, onError)
    : sb.subscribeDevActivitySb(b.client, uid, provider, onChange, onError);
}
