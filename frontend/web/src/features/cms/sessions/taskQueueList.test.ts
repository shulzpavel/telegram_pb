import { describe, expect, it } from "vitest";
import type { TaskItem } from "../api/cmsTypes";
import { canUseFullReorder, reorderedTaskIds } from "./taskQueueList";

function task(id: string, index: number): TaskItem {
  return {
    id: index + 1,
    session_id: 1,
    task_uid: id,
    bucket: "tasks_queue",
    bucket_index: index,
    jira_key: null,
    summary: `Task ${id}`,
    url: null,
    story_points: null,
    source: "manual",
    votes_count: 0,
    numeric_avg: null,
    numeric_max: null,
    completed_at: null,
    updated_at: "2026-01-01T00:00:00Z",
  };
}

describe("task queue list helpers", () => {
  it("allows full reorder only when the complete unfiltered queue is loaded", () => {
    const tasks = [task("a", 0), task("b", 1)];

    expect(canUseFullReorder({ bucket: "tasks_queue", hasMore: false, search: "", tasks, queueCount: 2 })).toBe(true);
    expect(canUseFullReorder({ bucket: "tasks_queue", hasMore: true, search: "", tasks, queueCount: 2 })).toBe(false);
    expect(canUseFullReorder({ bucket: "tasks_queue", hasMore: false, search: "a", tasks, queueCount: 2 })).toBe(false);
    expect(canUseFullReorder({ bucket: "history", hasMore: false, search: "", tasks, queueCount: 2 })).toBe(false);
  });

  it("returns task ids after drag reorder", () => {
    expect(reorderedTaskIds([task("a", 0), task("b", 1), task("c", 2)], "c", "a")).toEqual(["c", "a", "b"]);
  });
});
