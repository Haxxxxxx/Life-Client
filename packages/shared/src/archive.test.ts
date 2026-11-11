import { describe, expect, it } from "vitest";
import { archivedGoals, visibleGoals } from "./goals";
import { archivedTasks, visibleTasks } from "./tasks";
import type { Goal, Task } from "./types";

function goal(id: string, status: Goal["status"]): Goal {
  return { id, title: id, status, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" } as Goal;
}

function task(id: string, archived?: boolean): Task {
  return {
    id,
    title: id,
    status: "done",
    priority: "medium",
    // Required on Task. Its absence made the `as Task` cast unsound, which
    // nothing noticed because packages/shared was never type-checked.
    difficulty: "medium",
    category: "code",
    source: "manual",
    tags: [],
    ...(archived === undefined ? {} : { archived }),
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  } as Task;
}

// The invariant that matters: the cron archives unattended, so anything the
// visible list hides and the archive list does not surface is unreachable by
// the user. These must partition the input exactly — no gaps, no overlap.
describe("visible/archived partition goals", () => {
  const all = [goal("a", "active"), goal("b", "completed"), goal("c", "archived"), goal("d", "archived")];

  it("covers every goal exactly once", () => {
    const ids = [...visibleGoals(all), ...archivedGoals(all)].map((g) => g.id).sort();
    expect(ids).toEqual(["a", "b", "c", "d"]);
  });

  it("does not put any goal in both lists", () => {
    const visible = new Set(visibleGoals(all).map((g) => g.id));
    expect(archivedGoals(all).every((g) => !visible.has(g.id))).toBe(true);
  });

  it("surfaces exactly the archived ones", () => {
    expect(archivedGoals(all).map((g) => g.id)).toEqual(["c", "d"]);
  });

  it("handles an empty list", () => {
    expect(visibleGoals([])).toEqual([]);
    expect(archivedGoals([])).toEqual([]);
  });
});

describe("visible/archived partition tasks", () => {
  // `undefined` matters: the archive flag is absent on every task written
  // before the feature existed, and both sides must agree that means "not
  // archived" — otherwise those tasks fall through the gap.
  const all = [task("a", false), task("b", true), task("c"), task("d", true)];

  it("covers every task exactly once", () => {
    const ids = [...visibleTasks(all), ...archivedTasks(all)].map((t) => t.id).sort();
    expect(ids).toEqual(["a", "b", "c", "d"]);
  });

  it("does not put any task in both lists", () => {
    const visible = new Set(visibleTasks(all).map((t) => t.id));
    expect(archivedTasks(all).every((t) => !visible.has(t.id))).toBe(true);
  });

  it("treats a missing archived flag as not archived", () => {
    expect(visibleTasks([task("c")]).map((t) => t.id)).toEqual(["c"]);
    expect(archivedTasks([task("c")])).toEqual([]);
  });

  it("surfaces exactly the archived ones", () => {
    expect(archivedTasks(all).map((t) => t.id)).toEqual(["b", "d"]);
  });

  it("handles an empty list", () => {
    expect(visibleTasks([])).toEqual([]);
    expect(archivedTasks([])).toEqual([]);
  });
});
