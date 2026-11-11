import { describe, expect, it } from "vitest";
import { __taskToRowForTests as taskToRow } from "./tasks";

/**
 * The invariant: a patch must only ever write the columns it names.
 *
 * The original mapper wrote `t.dueDate ?? null` for every optional field, and
 * because `??` is evaluated before the "is it defined" guard, an *absent* key
 * became an explicit null and was written. A one-field status update therefore
 * nulled nine columns. These tests pin presence-vs-absence specifically,
 * because that is the distinction that broke.
 */
describe("taskToRow writes only the keys the patch has", () => {
  it("does not touch any other column for a status-only update", () => {
    // The exact call setTaskStatusSb makes — the one that destroyed data.
    const row = taskToRow({ status: "done" });

    expect(row).toEqual({ status: "done" });
    for (const col of [
      "description",
      "due_date",
      "source_ref",
      "source_url",
      "goal_id",
      "recurrence",
      "vice_log_id",
      "pr_meta",
      "pr_events",
    ]) {
      expect(row).not.toHaveProperty(col);
    }
  });

  it("writes null when a field is explicitly cleared", () => {
    // TaskPatch's contract: null means clear, and must reach the column.
    const row = taskToRow({ dueDate: null, goalId: null, recurrence: null });
    expect(row).toEqual({ due_date: null, goal_id: null, recurrence: null });
  });

  it("tells an explicit null apart from an absent key", () => {
    expect(taskToRow({ dueDate: null })).toHaveProperty("due_date", null);
    expect(taskToRow({})).not.toHaveProperty("due_date");
  });

  it("writes a value through unchanged", () => {
    const row = taskToRow({ title: "Ship it", dueDate: "2026-12-01" });
    expect(row).toEqual({ title: "Ship it", due_date: "2026-12-01" });
  });

  it("writes nothing at all for an empty patch", () => {
    expect(taskToRow({})).toEqual({});
  });

  it("maps every camelCase field to its snake_case column", () => {
    const row = taskToRow({
      sourceRef: "owner/repo#1",
      sourceUrl: "https://example.com",
      viceLogId: "v1",
      goalId: "g1",
      dueDate: "2026-01-01",
    });
    expect(Object.keys(row).sort()).toEqual(
      ["due_date", "goal_id", "source_ref", "source_url", "vice_log_id"].sort(),
    );
  });
});
