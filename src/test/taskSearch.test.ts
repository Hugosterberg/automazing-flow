import { describe, expect, it } from "vitest";
import { taskMatchesQuery } from "../features/tasks/taskFilters";
import type { TaskRow } from "../features/tasks/tasksService";

function makeTask(overrides: Partial<TaskRow>): TaskRow {
  return {
    id: "t1",
    business_profile_id: "bp1",
    title: "Order signage",
    description: null,
    priority: "medium",
    status: "open",
    due_at: null,
    completed_at: null,
    created_at: "2026-07-01T10:00:00.000Z",
    updated_at: "2026-07-01T10:00:00.000Z",
    created_by: null,
    assigned_to: null,
    module: null,
    related_id: null,
    related_type: null,
    metadata: {},
    ...overrides,
  } as TaskRow;
}

describe("taskMatchesQuery", () => {
  it("matches everything for empty/whitespace queries", () => {
    const task = makeTask({});
    expect(taskMatchesQuery(task, "")).toBe(true);
    expect(taskMatchesQuery(task, "   ")).toBe(true);
  });

  it("matches title case-insensitively", () => {
    const task = makeTask({ title: "Book Photographer" });
    expect(taskMatchesQuery(task, "photo")).toBe(true);
    expect(taskMatchesQuery(task, "PHOTOGRAPHER")).toBe(true);
    expect(taskMatchesQuery(task, "printer")).toBe(false);
  });

  it("matches description and checklist items", () => {
    const task = makeTask({
      description: "Need shots before the spring launch",
      metadata: {
        checklist: [{ id: "c1", text: "Request quotes from Studio Nord", done: false }],
      },
    });
    expect(taskMatchesQuery(task, "spring launch")).toBe(true);
    expect(taskMatchesQuery(task, "studio nord")).toBe(true);
    expect(taskMatchesQuery(task, "winter")).toBe(false);
  });
});
