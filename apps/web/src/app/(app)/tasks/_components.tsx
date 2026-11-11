"use client";

import {
  TASK_CATEGORIES,
  TASK_DIFFICULTIES,
  TASK_PRIORITIES,
  type Goal,
  type Recurrence,
  type Task,
  type TaskPatch,
  type TaskCategory,
  type TaskDifficulty,
  type TaskPriority,
} from "@life-client/shared";
import { useState } from "react";
import { RecurrencePicker } from "@/components/recurrence-picker";

export function EditTaskForm({
  task,
  goals,
  onSave,
  onCancel,
}: {
  task: Task;
  goals: Goal[];
  onSave: (patch: TaskPatch) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [category, setCategory] = useState<TaskCategory>(task.category);
  const [difficulty, setDifficulty] = useState<TaskDifficulty>(task.difficulty);
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [dueDate, setDueDate] = useState(task.dueDate ?? "");
  const [goalId, setGoalId] = useState(task.goalId ?? "");
  const [recurrence, setRecurrence] = useState<Recurrence | undefined>(task.recurrence);

  return (
    <div className="flex flex-1 flex-col gap-2">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="rounded-xl border border-border-strong bg-background px-2 py-1.5 text-sm"
      />
      <div className="flex flex-wrap gap-2">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as TaskCategory)}
          className="rounded-xl border border-border-strong bg-background px-2 py-1 text-xs"
        >
          {TASK_CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <select
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value as TaskDifficulty)}
          className="rounded-xl border border-border-strong bg-background px-2 py-1 text-xs"
        >
          {TASK_DIFFICULTIES.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as TaskPriority)}
          className="rounded-xl border border-border-strong bg-background px-2 py-1 text-xs"
        >
          {TASK_PRIORITIES.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label} priority
            </option>
          ))}
        </select>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="rounded-xl border border-border-strong bg-background px-2 py-1 text-xs"
        />
        <select
          value={goalId}
          onChange={(e) => setGoalId(e.target.value)}
          className="rounded-xl border border-border-strong bg-background px-2 py-1 text-xs"
        >
          <option value="">No goal</option>
          {goals.map((g) => (
            <option key={g.id} value={g.id}>
              {g.title}
            </option>
          ))}
        </select>
      </div>
      <RecurrencePicker value={recurrence} onChange={setRecurrence} />
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() =>
            onSave({
              title: title.trim() || task.title,
              category,
              difficulty,
              priority,
              // null, not undefined: undefined is dropped by
              // ignoreUndefinedProperties and leaves the stored value intact,
              // so clearing a field was a silent no-op. updateTask turns null
              // into deleteField().
              dueDate: dueDate || null,
              goalId: goalId || null,
              recurrence: recurrence ?? null,
            })
          }
          className="font-mono text-xs font-bold text-primary uppercase hover:underline"
        >
          Save
        </button>
        <button type="button" onClick={onCancel} className="font-mono text-xs font-bold text-muted uppercase hover:underline">
          Cancel
        </button>
      </div>
    </div>
  );
}

// Re-exported so existing importers of this module keep working.
export { RecurrencePicker };
