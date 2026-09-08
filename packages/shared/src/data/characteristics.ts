import * as fb from "../characteristics";
import * as sb from "../supabase/characteristics";
import type { ManualEventInput } from "../characteristics";
import type { CharacteristicId, ManualProgress } from "../types";
import { getDataBackend } from "./backend";

export function subscribeManualProgress(
  uid: string,
  characteristicId: CharacteristicId,
  onChange: (progress: ManualProgress | null) => void,
  onError?: (error: Error) => void,
): () => void {
  const b = getDataBackend();
  return b.provider === "firebase"
    ? fb.subscribeManualProgress(b.firestore, uid, characteristicId, onChange)
    : sb.subscribeManualProgressSb(b.client, uid, characteristicId, onChange, onError);
}

export function logManualEvent(
  uid: string,
  characteristicId: CharacteristicId,
  input: ManualEventInput,
): Promise<void> {
  const b = getDataBackend();
  return b.provider === "firebase"
    ? fb.logManualEvent(b.firestore, uid, characteristicId, input)
    : sb.logManualEventSb(b.client, uid, characteristicId, input);
}
