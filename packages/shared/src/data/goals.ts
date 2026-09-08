import * as fb from "../goals";
import * as sb from "../supabase/goals";
import type { Goal, GoalStatus, NewGoal } from "../types";
import { getDataBackend } from "./backend";

export function subscribeGoals(
  uid: string,
  onChange: (goals: Goal[]) => void,
  onError?: (error: Error) => void,
): () => void {
  const b = getDataBackend();
  return b.provider === "firebase"
    ? fb.subscribeGoals(b.firestore, uid, onChange, onError)
    : sb.subscribeGoalsSb(b.client, uid, onChange, onError);
}

export function createGoal(uid: string, goal: NewGoal): Promise<string> {
  const b = getDataBackend();
  return b.provider === "firebase"
    ? fb.createGoal(b.firestore, uid, goal)
    : sb.createGoalSb(b.client, uid, goal);
}

export function updateGoal(uid: string, goalId: string, patch: Partial<NewGoal>): Promise<void> {
  const b = getDataBackend();
  return b.provider === "firebase"
    ? fb.updateGoal(b.firestore, uid, goalId, patch)
    : sb.updateGoalSb(b.client, uid, goalId, patch);
}

export function setGoalStatus(uid: string, goalId: string, status: GoalStatus): Promise<void> {
  const b = getDataBackend();
  return b.provider === "firebase"
    ? fb.setGoalStatus(b.firestore, uid, goalId, status)
    : sb.setGoalStatusSb(b.client, uid, goalId, status);
}

export function deleteGoal(uid: string, goalId: string): Promise<void> {
  const b = getDataBackend();
  return b.provider === "firebase"
    ? fb.deleteGoal(b.firestore, uid, goalId)
    : sb.deleteGoalSb(b.client, uid, goalId);
}

// pure, backend-agnostic
export { computeGoalProgress } from "../goals";
