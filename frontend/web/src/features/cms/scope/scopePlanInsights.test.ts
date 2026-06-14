import { describe, expect, it } from "vitest";
import { planChangeReasonLabel, sortedCountEntries } from "./scopePlanInsights";

describe("scopePlanInsights", () => {
  it("prefers plan_change_reasons array over legacy string", () => {
    expect(
      planChangeReasonLabel({
        key: "A-1",
        summary: "x",
        url: "",
        story_points: 1,
        estimated: true,
        status: "Open",
        status_category: "new",
        issue_type: "Story",
        labels: [],
        plan_change_reason: "Old",
        plan_change_reasons: ["Scope creep", "Priority shift"],
      })
    ).toBe("Scope creep, Priority shift");
  });

  it("sorts count entries by value desc", () => {
    expect(sortedCountEntries({ B: 2, A: 5, C: 1 })).toEqual([
      ["A", 5],
      ["B", 2],
      ["C", 1],
    ]);
  });
});
