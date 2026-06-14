import { describe, expect, it } from "vitest";
import type { ScopeBoardMetrics } from "../api/cmsClient";
import { buildCapacityVisual } from "./scopeBoardVisuals";

function metrics(overrides: Partial<ScopeBoardMetrics>): ScopeBoardMetrics {
  return {
    capacity_sp: 80,
    plan_sp: 30,
    unplan_sp: 10,
    buffer_sp: 40,
    overfill_sp: 0,
    intake_status: "ok",
    plan_count: 5,
    unplan_count: 2,
    unestimated_count: 0,
    unestimated_tasks: [],
    scope_creep_count: 0,
    plan_by_status: {},
    unplan_by_status: {},
    month: "2026-06",
    month_start: "2026-06-01T00:00:00+00:00",
    ...overrides,
  };
}

describe("buildCapacityVisual", () => {
  it("builds SP donut segments", () => {
    const visual = buildCapacityVisual(metrics({}));
    expect(visual.mode).toBe("sp");
    expect(visual.segments.map((s) => s.key)).toEqual(["plan", "unplan", "buffer"]);
    expect(visual.loadPercent).toBe(50);
  });

  it("falls back to task counts when SP is zero", () => {
    const visual = buildCapacityVisual(
      metrics({ plan_sp: 0, unplan_sp: 0, buffer_sp: 80, plan_count: 12, unplan_count: 3 })
    );
    expect(visual.mode).toBe("tasks");
    expect(visual.centerValue).toBe("15");
  });
});

describe("buildAssigneeDonutSegments", () => {
  it("builds SP segments sorted by assignee rows", async () => {
    const { buildAssigneeDonutSegments, assigneeDonutCenter } = await import("./scopeBoardVisuals");
    const rows = [
      { assignee: "Alice", story_points: 8, count: 2 },
      { assignee: "Bob", story_points: 3, count: 1 },
    ];
    const segments = buildAssigneeDonutSegments(rows, "sp");
    expect(segments.map((segment) => segment.key)).toEqual(["Alice", "Bob"]);
    expect(assigneeDonutCenter(rows, "sp").value).toBe("11");
  });

  it("builds task segments when SP mode has no values", async () => {
    const { buildAssigneeDonutSegments } = await import("./scopeBoardVisuals");
    const segments = buildAssigneeDonutSegments([{ assignee: "Alice", story_points: 0, count: 4 }], "sp");
    expect(segments[0]?.key).toBe("empty");
    const taskSegments = buildAssigneeDonutSegments([{ assignee: "Alice", story_points: 0, count: 4 }], "tasks");
    expect(taskSegments[0]?.value).toBe(4);
  });

  it("builds developer donut segments", async () => {
    const { buildDeveloperDonutSegments, developerDonutCenter } = await import("./scopeBoardVisuals");
    const rows = [{ developer: "Alice", story_points: 8, count: 2 }];
    expect(buildDeveloperDonutSegments(rows, "sp")[0]?.key).toBe("Alice");
    expect(developerDonutCenter(rows, "tasks").value).toBe("2");
  });
});
