import type { SupabaseClient } from "@supabase/supabase-js";
import type { Challenge, NewChallenge } from "../types";
import { subscribeCollection } from "./realtime";
import { randomId } from "./id";

interface ChallengeRow {
  id: string;
  title: string;
  exercise_type: string;
  metric: Challenge["metric"];
  daily_target: number;
  duration_days: number;
  start_date: string;
  archived: boolean;
  created_at: string;
}

function rowToChallenge(r: ChallengeRow): Challenge {
  return {
    id: r.id,
    title: r.title,
    exerciseType: r.exercise_type,
    metric: r.metric,
    dailyTarget: r.daily_target,
    durationDays: r.duration_days,
    startDate: r.start_date,
    createdAt: r.created_at,
    archived: r.archived,
  };
}

export function subscribeChallengesSb(
  client: SupabaseClient,
  userId: string,
  onChange: (challenges: Challenge[]) => void,
  onError?: (error: Error) => void,
): () => void {
  return subscribeCollection<ChallengeRow, Challenge>({
    client,
    table: "challenges",
    filterColumn: "user_id",
    filterValue: userId,
    rowId: (r) => r.id,
    map: rowToChallenge,
    order: { column: "created_at", ascending: false },
    sort: (a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0),
    onChange,
    onError,
  });
}

export async function createChallengeSb(
  client: SupabaseClient,
  userId: string,
  c: NewChallenge,
): Promise<string> {
  const id = randomId();
  const { error } = await client.from("challenges").insert({
    id,
    user_id: userId,
    title: c.title,
    exercise_type: c.exerciseType,
    metric: c.metric,
    daily_target: c.dailyTarget,
    duration_days: c.durationDays,
    start_date: c.startDate,
  });
  if (error) throw new Error(error.message);
  return id;
}

export async function updateChallengeSb(
  client: SupabaseClient,
  userId: string,
  challengeId: string,
  patch: Partial<Pick<Challenge, "title" | "dailyTarget" | "durationDays">>,
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.dailyTarget !== undefined) row.daily_target = patch.dailyTarget;
  if (patch.durationDays !== undefined) row.duration_days = patch.durationDays;
  const { error } = await client
    .from("challenges")
    .update(row)
    .eq("id", challengeId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function archiveChallengeSb(
  client: SupabaseClient,
  userId: string,
  challengeId: string,
): Promise<void> {
  const { error } = await client
    .from("challenges")
    .update({ archived: true })
    .eq("id", challengeId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function deleteChallengeSb(
  client: SupabaseClient,
  userId: string,
  challengeId: string,
): Promise<void> {
  const { error } = await client
    .from("challenges")
    .delete()
    .eq("id", challengeId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}
