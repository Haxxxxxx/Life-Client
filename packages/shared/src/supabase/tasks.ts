import type { SupabaseClient } from "@supabase/supabase-js";
import { nextOccurrenceDate } from "../recurrence";
import type {
  NewTask,
  TaskPatch,
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
import { randomId } from "./id";

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
/**
 * Maps a patch onto its columns, writing ONLY the keys the patch actually has.
 *
 * This previously read `put("due_date", t.dueDate ?? null)`, where the `??` is
 * evaluated before `put`'s `!== undefined` guard — so an *absent* key became an
 * explicit `null` and was written. That made it a full-row overwrite rather
 * than a patch builder: `updateTask(uid, id, { status: "done" })` nulled
 * description, due_date, source_ref, source_url, goal_id, recurrence,
 * vice_log_id, pr_meta and pr_events. Ticking a task off destroyed its
 * deadline, goal link, recurrence rule and entire PR history.
 *
 * `put("tags", t.tags)` was the one field written without `?? null`, which is
 * what gives the copy-paste away.
 *
 * Presence is now tested with `in`, which also keeps the TaskPatch contract
 * intact: an explicit `null` means "clear" and must be written, while an
 * absent key must be left alone. `?? null` could not express that difference.
 */
function taskToRow(t: TaskPatch): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  const put = (key: string, field: keyof TaskPatch, value: unknown) => {
    if (field in t) row[key] = value ?? null;
  };
  put("title", "title", t.title);
  put("description", "description", t.description);
  put("status", "status", t.status);
  put("priority", "priority", t.priority);
  put("difficulty", "difficulty", t.difficulty);
  put("category", "category", t.category);
  put("due_date", "dueDate", t.dueDate);
  put("source", "source", t.source);
  put("source_ref", "sourceRef", t.sourceRef);
  put("source_url", "sourceUrl", t.sourceUrl);
  put("tags", "tags", t.tags);
  put("goal_id", "goalId", t.goalId);
  put("recurrence", "recurrence", t.recurrence);
  put("vice_log_id", "viceLogId", t.viceLogId);
  put("pr_meta", "prMeta", t.prMeta);
  put("pr_events", "prEvents", t.prEvents);
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
  const id = randomId();
  const { error } = await client.from("tasks").insert({ id, user_id: userId, ...taskToRow(task) });
  if (error) throw new Error(error.message);
  return id;
}

/** Exported for tests only — the presence-vs-absence contract above is the
 * thing that broke, so it is worth pinning directly rather than through a
 * mocked Supabase client. */
export const __taskToRowForTests = taskToRow;

export async function updateTaskSb(
  client: SupabaseClient,
  userId: string,
  taskId: string,
  patch: TaskPatch,
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
