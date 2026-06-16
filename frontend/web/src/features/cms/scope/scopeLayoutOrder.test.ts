import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCOPE_LAYOUT_ORDER,
  mergeScopeLayoutOrder,
  reorderScopeLayoutOrder,
} from "./scopeLayoutOrder";

describe("scopeLayoutOrder", () => {
  it("merges saved order with defaults and filters unknown keys", () => {
    expect(mergeScopeLayoutOrder(["report", "unknown", "topItems"])).toEqual([
      "report",
      "topItems",
      ...DEFAULT_SCOPE_LAYOUT_ORDER.filter((key) => key !== "report" && key !== "topItems"),
    ]);
  });

  it("reorders visible blocks while keeping hidden keys in place", () => {
    const full = [...DEFAULT_SCOPE_LAYOUT_ORDER];
    const visible = ["topItems", "capacity", "report"] as const;
    const next = reorderScopeLayoutOrder(full, [...visible], "report", "topItems");
    const visibleNext = next.filter((key) => visible.includes(key as (typeof visible)[number]));
    expect(visibleNext).toEqual(["report", "topItems", "capacity"]);
  });
});
