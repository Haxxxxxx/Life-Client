import * as fb from "../vices";
import * as sb from "../supabase/vices";
import type { ViceLog } from "../types";
import { getDataBackend } from "./backend";

export { VICE_PRESETS, vicePresetById, computeVicePenalty } from "../vices";

export function subscribeViceLogs(
  uid: string,
  onChange: (logs: ViceLog[]) => void,
  onError?: (error: Error) => void,
): () => void {
  const b = getDataBackend();
  return b.provider === "firebase"
    ? fb.subscribeViceLogs(b.firestore, uid, onChange, onError)
    : sb.subscribeViceLogsSb(b.client, uid, onChange, onError);
}

export function logVice(uid: string, vicePresetId: string): Promise<void> {
  const b = getDataBackend();
  return b.provider === "firebase"
    ? fb.logVice(b.firestore, uid, vicePresetId)
    : sb.logViceSb(b.client, uid, vicePresetId);
}

export function setViceLogCompensated(uid: string, viceLogId: string, compensated: boolean): Promise<void> {
  const b = getDataBackend();
  return b.provider === "firebase"
    ? fb.setViceLogCompensated(b.firestore, uid, viceLogId, compensated)
    : sb.setViceLogCompensatedSb(b.client, uid, viceLogId, compensated);
}

export function deleteViceLog(uid: string, viceLogId: string): Promise<void> {
  const b = getDataBackend();
  return b.provider === "firebase"
    ? fb.deleteViceLog(b.firestore, uid, viceLogId)
    : sb.deleteViceLogSb(b.client, uid, viceLogId);
}
