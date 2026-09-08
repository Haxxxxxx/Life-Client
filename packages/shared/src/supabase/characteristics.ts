import type { SupabaseClient } from "@supabase/supabase-js";
import { computeManualEventXp, type ManualEventInput } from "../characteristics";
import type { CharacteristicId, ManualEventType, ManualProgress } from "../types";
import { subscribeCollection } from "./realtime";

interface ManualProgressRow {
  characteristic_id: CharacteristicId;
  session_count: number;
  xp: number;
  last_event_type: ManualEventType | null;
  last_duration_minutes: number | null;
  last_people_count: number | null;
  last_note: string | null;
  updated_at: string;
}

function rowToProgress(r: ManualProgressRow): ManualProgress {
  return {
    characteristicId: r.characteristic_id,
    sessionCount: r.session_count,
    xp: r.xp,
    lastEventType: r.last_event_type ?? undefined,
    lastDurationMinutes: r.last_duration_minutes ?? undefined,
    lastPeopleCount: r.last_people_count ?? undefined,
    lastNote: r.last_note ?? undefined,
    updatedAt: r.updated_at,
  };
}

export function subscribeManualProgressSb(
  client: SupabaseClient,
  userId: string,
  characteristicId: CharacteristicId,
  onChange: (progress: ManualProgress | null) => void,
  onError?: (error: Error) => void,
): () => void {
  // one row per (user, characteristic); realtime filters on user_id, pick client-side
  return subscribeCollection<ManualProgressRow, ManualProgress>({
    client,
    table: "manual_progress",
    filterColumn: "user_id",
    filterValue: userId,
    rowId: (r) => r.characteristic_id,
    map: rowToProgress,
    onChange: (rows) => onChange(rows.find((p) => p.characteristicId === characteristicId) ?? null),
    onError,
  });
}

/**
 * Records a manual "+1 session". supabase-js has no atomic increment, so this
 * reads the current counters then upserts — safe here since a given
 * (user, characteristic) row is only ever written by that one user, rarely.
 */
export async function logManualEventSb(
  client: SupabaseClient,
  userId: string,
  characteristicId: CharacteristicId,
  input: ManualEventInput,
): Promise<void> {
  const xp = computeManualEventXp(input);
  const { data: existing, error: readErr } = await client
    .from("manual_progress")
    .select("session_count, xp")
    .eq("user_id", userId)
    .eq("characteristic_id", characteristicId)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message);

  const { error } = await client.from("manual_progress").upsert({
    user_id: userId,
    characteristic_id: characteristicId,
    session_count: ((existing?.session_count as number | undefined) ?? 0) + 1,
    xp: ((existing?.xp as number | undefined) ?? 0) + xp,
    last_event_type: input.eventType,
    last_duration_minutes: input.durationMinutes,
    last_people_count: input.peopleCount,
    last_note: input.note?.trim() ?? "",
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}
