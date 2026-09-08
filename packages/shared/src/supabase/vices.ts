import type { SupabaseClient } from "@supabase/supabase-js";
import type { ViceLog } from "../types";
import { vicePresetById } from "../vices";
import { subscribeCollection } from "./realtime";

interface ViceLogRow {
  id: string;
  vice_id: string;
  penalty_stat: ViceLog["penaltyStat"];
  penalty_xp: number;
  compensating_task_id: string | null;
  compensated: boolean;
  created_at: string;
}

function rowToViceLog(r: ViceLogRow): ViceLog {
  return {
    id: r.id,
    viceId: r.vice_id,
    penaltyStat: r.penalty_stat,
    penaltyXp: r.penalty_xp,
    compensatingTaskId: r.compensating_task_id ?? undefined,
    compensated: r.compensated,
    createdAt: r.created_at,
  };
}

export function subscribeViceLogsSb(
  client: SupabaseClient,
  userId: string,
  onChange: (logs: ViceLog[]) => void,
  onError?: (error: Error) => void,
): () => void {
  return subscribeCollection<ViceLogRow, ViceLog>({
    client,
    table: "vice_logs",
    filterColumn: "user_id",
    filterValue: userId,
    rowId: (r) => r.id,
    map: rowToViceLog,
    order: { column: "created_at", ascending: false },
    sort: (a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0),
    onChange,
    onError,
  });
}

/** Atomic via the log_vice() Postgres function — records the slip + creates the
 * cross-linked compensating task in one transaction (RLS-scoped to the caller). */
export async function logViceSb(client: SupabaseClient, _userId: string, vicePresetId: string): Promise<void> {
  const preset = vicePresetById(vicePresetId);
  if (!preset) throw new Error(`Unknown vice preset: ${vicePresetId}`);
  const { error } = await client.rpc("log_vice", {
    p_vice_id: preset.id,
    p_penalty_stat: preset.penaltyStat,
    p_penalty_xp: preset.penaltyXp,
    p_task_title: preset.compensatingTaskTitle,
  });
  if (error) throw new Error(error.message);
}

export async function setViceLogCompensatedSb(
  client: SupabaseClient,
  userId: string,
  viceLogId: string,
  compensated: boolean,
): Promise<void> {
  const { error } = await client
    .from("vice_logs")
    .update({ compensated })
    .eq("id", viceLogId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function deleteViceLogSb(
  client: SupabaseClient,
  userId: string,
  viceLogId: string,
): Promise<void> {
  const { error } = await client.from("vice_logs").delete().eq("id", viceLogId).eq("user_id", userId);
  if (error) throw new Error(error.message);
}
