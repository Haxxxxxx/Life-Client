import * as fb from "../tasks";
import * as sb from "../supabase/tasks";
import type { NewTask, Task, TaskStatus } from "../types";
import { getDataBackend } from "./backend";

export function subscribeTasks(
  uid: string,
  onChange: (tasks: Task[]) => void,
  onError?: (error: Error) => void,
): () => void {
  const b = getDataBackend();
  return b.provider === "firebase"
    ? fb.subscribeTasks(b.firestore, uid, onChange, onError)
    : sb.subscribeTasksSb(b.client, uid, onChange, onError);
}

export function subscribeTask(
  uid: string,
  taskId: string,
  onChange: (task: Task | null) => void,
  onError?: (error: Error) => void,
): () => void {
  const b = getDataBackend();
  return b.provider === "firebase"
    ? fb.subscribeTask(b.firestore, uid, taskId, onChange, onError)
    : sb.subscribeTaskSb(b.client, uid, taskId, onChange, onError);
}

export function createTask(uid: string, task: NewTask): Promise<string> {
  const b = getDataBackend();
  return b.provider === "firebase"
    ? fb.createTask(b.firestore, uid, task)
    : sb.createTaskSb(b.client, uid, task);
}

export function updateTask(uid: string, taskId: string, patch: Partial<NewTask>): Promise<void> {
  const b = getDataBackend();
  return b.provider === "firebase"
    ? fb.updateTask(b.firestore, uid, taskId, patch)
    : sb.updateTaskSb(b.client, uid, taskId, patch);
}

export function setTaskStatus(uid: string, taskId: string, status: TaskStatus): Promise<void> {
  const b = getDataBackend();
  return b.provider === "firebase"
    ? fb.setTaskStatus(b.firestore, uid, taskId, status)
    : sb.setTaskStatusSb(b.client, uid, taskId, status);
}

export function deleteTask(uid: string, taskId: string): Promise<void> {
  const b = getDataBackend();
  return b.provider === "firebase"
    ? fb.deleteTask(b.firestore, uid, taskId)
    : sb.deleteTaskSb(b.client, uid, taskId);
}

export function advanceTaskStatus(uid: string, task: Task, nextStatus: TaskStatus): Promise<void> {
  const b = getDataBackend();
  return b.provider === "firebase"
    ? fb.advanceTaskStatus(b.firestore, uid, task, nextStatus)
    : sb.advanceTaskStatusSb(b.client, uid, task, nextStatus);
}
