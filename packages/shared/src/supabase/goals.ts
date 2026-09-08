import type { SupabaseClient } from "@supabase/supabase-js";
import type { Goal, GoalStatus, NewGoal } from "../types";
import { subscribeCollection } from "./realtime";
import { randomId } from "./id";

interface GoalRow {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  target_date: string | null;
  status: GoalStatus;
  created_at: string;
  updated_at: string;
}

function rowToGoal(r: GoalRow): Goal {
  return {
    id: r.id,
    title: r.title,
    description: r.description ?? undefined,
    targetDate: r.target_date ?? undefined,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function goalToRow(g: Partial<NewGoal>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (g.title !== undefined) row.title = g.title;
  if (g.description !== undefined) row.description = g.description ?? null;
  if (g.targetDate !== undefined) row.target_date = g.targetDate ?? null;
  return row;
}

export function subscribeGoalsSb(
  client: SupabaseClient,
  userId: string,
  onChange: (goals: Goal[]) => void,
  onError?: (error: Error) => void,
): () => void {
  return subscribeCollection<GoalRow, Goal>({
    client,
    table: "goals",
    filterColumn: "user_id",
    filterValue: userId,
    rowId: (r) => r.id,
    map: rowToGoal,
    order: { column: "created_at", ascending: false },
    sort: (a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0),
    onChange,
    onError,
  });
}

export async function createGoalSb(client: SupabaseClient, userId: string, goal: NewGoal): Promise<string> {
  const id = randomId();
  const { error } = await client
    .from("goals")
    .insert({ id, user_id: userId, status: "active" satisfies GoalStatus, ...goalToRow(goal) });
  if (error) throw new Error(error.message);
  return id;
}

export async function updateGoalSb(
  client: SupabaseClient,
  userId: string,
  goalId: string,
  patch: Partial<NewGoal>,
): Promise<void> {
  const { error } = await client
    .from("goals")
    .update(goalToRow(patch))
    .eq("id", goalId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function setGoalStatusSb(
  client: SupabaseClient,
  userId: string,
  goalId: string,
  status: GoalStatus,
): Promise<void> {
  const { error } = await client
    .from("goals")
    .update({ status })
    .eq("id", goalId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function deleteGoalSb(client: SupabaseClient, userId: string, goalId: string): Promise<void> {
  const { error } = await client.from("goals").delete().eq("id", goalId).eq("user_id", userId);
  if (error) throw new Error(error.message);
}
