import { describe, expect, it } from "vitest";
import { summarizeRoleWorkload } from "./ScopeAssigneeCharts";
import type { ScopeBoardMetrics } from "../api/cmsClient";

describe("summarizeRoleWorkload", () => {
  it("keeps total scope SP separate from selected role SP", () => {
    const metrics = {
      plan_sp: 30,
      unplan_sp: 30,
      plan_count: 13,
      unplan_count: 27,
      plan_by_role: {
        front: [
          { developer: "A", story_points: 10, count: 4, issues: [] },
          { developer: "B", story_points: 9, count: 3, issues: [] },
        ],
      },
      unplan_by_role: {
        front: [
          { developer: "A", story_points: 4, count: 2, issues: [] },
          { developer: "Не атрибутировано", story_points: 2, count: 2, issues: [] },
        ],
      },
      plan_role_coverage: { front: { total: 7, attributed: 7, confirmed: 7, estimated: 0, unattributed: 0 } },
      unplan_role_coverage: { front: { total: 4, attributed: 3, confirmed: 3, estimated: 0, unattributed: 1 } },
    } as ScopeBoardMetrics;

    expect(summarizeRoleWorkload(metrics, "front")).toEqual({
      scopeSp: 60,
      scopeCount: 40,
      roleSp: 25,
      roleCount: 11,
      unattributedCount: 1,
    });
  });
});
