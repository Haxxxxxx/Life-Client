"use client";

import {
  TASK_CATEGORIES,
  TASK_DIFFICULTIES,
  TASK_PRIORITIES,
  WEEKDAY_LABELS,
  type Goal,
  type Recurrence,
  type RecurrenceFreq,
  type Task,
  type TaskCategory,
  type TaskDifficulty,
  type TaskPriority,
} from "@life-client/shared";
import { useState } from "react";

export function RecurrencePicker({
  value,
  onChange,
}: {
  value: Recurrence | undefined;
  onChange: (next: Recurrence | undefined) => void;
}) {
  const freq = value?.freq;
  const interval = value?.interval ?? 1;
  const daysOfWeek = value?.daysOfWeek ?? [];

  function setFreq(next: RecurrenceFreq | undefined) {
    if (!next) {
      onChange(undefined);
      return;
    }
    onChange({ freq: next, interval, daysOfWeek: next === "weekly" ? daysOfWeek : undefined });
  }

  function toggleDay(day: number) {
    const next = daysOfWeek.includes(day) ? daysOfWeek.filter((d) => d !== day) : [...daysOfWeek, day];
    onChange({ freq: "weekly", interval, daysOfWeek: next });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {(["none", "daily", "weekly", "monthly"] as const).map((f) => (
        <button
          key={f}
          type="button"
          onClick={() => setFreq(f === "none" ? undefined : f)}
          className={`rounded-full border px-2.5 py-1 text-xs capitalize ${
            (f === "none" && !freq) || f === freq ? "border-border-strong bg-primary/15" : "border-border text-muted"
          }`}
        >
          {f === "none" ? "No repeat" : f}
        </button>
      ))}
      {freq && (
        <label className="flex items-center gap-1 text-xs text-muted">
          every
          <input
            type="number"
            min={1}
            value={interval}
            onChange={(e) => onChange({ freq, interval: Number(e.target.value) || 1, daysOfWeek: value?.daysOfWeek })}
            className="w-12 rounded-xl border border-border-strong bg-background px-1 py-0.5 text-xs"
          />
          {freq === "daily" ? "day(s)" : freq === "weekly" ? "week(s)" : "month(s)"}
        </label>
      )}
      {freq === "weekly" && (
        <div className="flex gap-1">
          {WEEKDAY_LABELS.map((label, i) => (
            <button
              key={i}
              type="button"
              onClick={() => toggleDay(i)}
              className={`rounded-full border px-1.5 py-1 text-[10px] font-bold ${
                daysOfWeek.includes(i) ? "border-border-strong bg-primary text-primary-foreground" : "border-border text-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function EditTaskForm({
  task,
  goals,
  onSave,
  onCancel,
}: {
  task: Task;
  goals: Goal[];
  onSave: (patch: Partial<Task>) => void;
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
              dueDate: dueDate || undefined,
              goalId: goalId || undefined,
              recurrence,
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
