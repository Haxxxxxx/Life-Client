import type { SupabaseClient } from "@supabase/supabase-js";
import type { NewManualSportActivity } from "../sports";
import type { SportActivity } from "../types";
import { subscribeCollection } from "./realtime";

interface SportRow {
  id: string;
  provider: SportActivity["provider"];
  kind: SportActivity["kind"];
  external_id: string | null;
  type: string;
  name: string;
  start_date: string;
  distance_meters: number | null;
  moving_time_sec: number | null;
  elevation_gain_meters: number | null;
  avg_heart_rate: number | null;
  avg_pace_sec_per_km: number | null;
  reps: number | null;
  sets: number | null;
  weight_kg: number | null;
  external_url: string | null;
}

function rowToActivity(r: SportRow): SportActivity {
  return {
    id: r.id,
    provider: r.provider,
    kind: r.kind,
    externalId: r.external_id ?? undefined,
    type: r.type,
    name: r.name,
    startDate: r.start_date,
    distanceMeters: r.distance_meters ?? undefined,
    movingTimeSec: r.moving_time_sec ?? undefined,
    elevationGainMeters: r.elevation_gain_meters ?? undefined,
    avgHeartRate: r.avg_heart_rate ?? undefined,
    avgPaceSecPerKm: r.avg_pace_sec_per_km ?? undefined,
    reps: r.reps ?? undefined,
    sets: r.sets ?? undefined,
    weightKg: r.weight_kg ?? undefined,
    externalUrl: r.external_url ?? undefined,
  };
}

export async function createManualSportActivitySb(
  client: SupabaseClient,
  userId: string,
  a: NewManualSportActivity,
): Promise<string> {
  const id = globalThis.crypto.randomUUID();
  const { error } = await client.from("sport_activities").insert({
    id,
    user_id: userId,
    provider: "manual",
    kind: a.kind,
    type: a.type,
    name: a.name,
    start_date: a.startDate,
    distance_meters: a.distanceMeters ?? null,
    moving_time_sec: a.movingTimeSec ?? null,
    elevation_gain_meters: a.elevationGainMeters ?? null,
    avg_heart_rate: a.avgHeartRate ?? null,
    avg_pace_sec_per_km: a.avgPaceSecPerKm ?? null,
    reps: a.reps ?? null,
    sets: a.sets ?? null,
    weight_kg: a.weightKg ?? null,
  });
  if (error) throw new Error(error.message);
  return id;
}

export async function deleteSportActivitySb(
  client: SupabaseClient,
  userId: string,
  activityId: string,
): Promise<void> {
  const { error } = await client
    .from("sport_activities")
    .delete()
    .eq("id", activityId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export function subscribeSportActivitiesSb(
  client: SupabaseClient,
  userId: string,
  onChange: (activities: SportActivity[]) => void,
  onError?: (error: Error) => void,
  max = 50,
): () => void {
  return subscribeCollection<SportRow, SportActivity>({
    client,
    table: "sport_activities",
    filterColumn: "user_id",
    filterValue: userId,
    rowId: (r) => r.id,
    map: rowToActivity,
    order: { column: "start_date", ascending: false },
    sort: (a, b) => (a.startDate < b.startDate ? 1 : a.startDate > b.startDate ? -1 : 0),
    onChange: (rows) => onChange(rows.slice(0, max)),
    onError,
  });
}
