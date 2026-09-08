import type { SupabaseClient } from "@supabase/supabase-js";
import { nextOccurrenceDate } from "../recurrence";
import type {
  NewTask,
  PrEvent,
  Recurrence,
  Task,
  TaskCategory,
  TaskDifficulty,
  TaskPriority,
  TaskPrMeta,
  TaskSource,
  TaskStatus,
} from "../types";
import { subscribeCollection } from "./realtime";

/** Raw `public.tasks` row shape (snake_case columns). */
interface TaskRow {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  difficulty: TaskDifficulty;
  category: TaskCategory;
  due_date: string | null;
  source: TaskSource;
  source_ref: string | null;
  source_url: string | null;
  tags: string[] | null;
  goal_id: string | null;
  recurrence: Recurrence | null;
  vice_log_id: string | null;
  pr_meta: TaskPrMeta | null;
  pr_events: PrEvent[] | null;
  created_at: string;
  updated_at: string;
}

function rowToTask(r: TaskRow): Task {
  return {
    id: r.id,
    title: r.title,
    description: r.description ?? undefined,
    status: r.status,
    priority: r.priority,
    difficulty: r.difficulty,
    category: r.category,
    dueDate: r.due_date ?? undefined,
    source: r.source,
    sourceRef: r.source_ref ?? undefined,
    sourceUrl: r.source_url ?? undefined,
    tags: r.tags ?? [],
    goalId: r.goal_id ?? undefined,
    recurrence: r.recurrence ?? undefined,
    viceLogId: r.vice_log_id ?? undefined,
    prMeta: r.pr_meta ?? undefined,
    prEvents: r.pr_events ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Domain patch → column patch. Only defined keys are written. */
function taskToRow(t: Partial<NewTask>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  const put = (key: string, value: unknown) => {
    if (value !== undefined) row[key] = value;
  };
  put("title", t.title);
  put("description", t.description ?? null);
  put("status", t.status);
  put("priority", t.priority);
  put("difficulty", t.difficulty);
  put("category", t.category);
  put("due_date", t.dueDate ?? null);
  put("source", t.source);
  put("source_ref", t.sourceRef ?? null);
  put("source_url", t.sourceUrl ?? null);
  put("tags", t.tags);
  put("goal_id", t.goalId ?? null);
  put("recurrence", t.recurrence ?? null);
  put("vice_log_id", t.viceLogId ?? null);
  put("pr_meta", t.prMeta ?? null);
  put("pr_events", t.prEvents ?? null);
  return row;
}

export function subscribeTasksSb(
  client: SupabaseClient,
  userId: string,
  onChange: (tasks: Task[]) => void,
  onError?: (error: Error) => void,
): () => void {
  return subscribeCollection<TaskRow, Task>({
    client,
    table: "tasks",
    filterColumn: "user_id",
    filterValue: userId,
    rowId: (r) => r.id,
    map: rowToTask,
    order: { column: "created_at", ascending: false },
    sort: (a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0),
    onChange,
    onError,
  });
}

export function subscribeTaskSb(
  client: SupabaseClient,
  _userId: string,
  taskId: string,
  onChange: (task: Task | null) => void,
  onError?: (error: Error) => void,
): () => void {
  return subscribeCollection<TaskRow, Task>({
    client,
    table: "tasks",
    filterColumn: "id",
    filterValue: taskId,
    rowId: (r) => r.id,
    map: rowToTask,
    onChange: (items) => onChange(items[0] ?? null),
    onError,
  });
}

export async function createTaskSb(client: SupabaseClient, userId: string, task: NewTask): Promise<string> {
  const id = globalThis.crypto.randomUUID();
  const { error } = await client.from("tasks").insert({ id, user_id: userId, ...taskToRow(task) });
  if (error) throw new Error(error.message);
  return id;
}

export async function updateTaskSb(
  client: SupabaseClient,
  userId: string,
  taskId: string,
  patch: Partial<NewTask>,
): Promise<void> {
  const { error } = await client
    .from("tasks")
    .update(taskToRow(patch))
    .eq("id", taskId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function setTaskStatusSb(
  client: SupabaseClient,
  userId: string,
  taskId: string,
  status: TaskStatus,
): Promise<void> {
  await updateTaskSb(client, userId, taskId, { status });
}

export async function deleteTaskSb(client: SupabaseClient, userId: string, taskId: string): Promise<void> {
  const { error } = await client.from("tasks").delete().eq("id", taskId).eq("user_id", userId);
  if (error) throw new Error(error.message);
}

/**
 * Mirrors `advanceTaskStatus` from the Firestore module: rolls a recurring task
 * forward on completion. The ViceLog side-effect is deferred until vices are
 * migrated (Phase 1).
 */
export async function advanceTaskStatusSb(
  client: SupabaseClient,
  userId: string,
  task: Task,
  nextStatus: TaskStatus,
): Promise<void> {
  if (nextStatus === "done" && task.recurrence && task.dueDate) {
    const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = task;
    await createTaskSb(client, userId, {
      ...rest,
      dueDate: nextOccurrenceDate(task.dueDate, task.recurrence),
      status: "todo",
    });
  }
  await setTaskStatusSb(client, userId, task.id, nextStatus);
}
