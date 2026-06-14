import { describe, expect, it } from "vitest";
import {
  defaultScopeSections,
  normalizeScopeSections,
  reorderScopeSections,
  validateScopeSections,
} from "./scopeSectionHelpers";

describe("normalizeScopeSections", () => {
  it("returns defaults when no sections or legacy jql", () => {
    const sections = normalizeScopeSections(null);
    expect(sections).toHaveLength(2);
    expect(sections[0]?.id).toBe("plan");
    expect(sections[1]?.kind).toBe("unplanned");
  });

  it("falls back to legacy plan/unplan jql", () => {
    const sections = normalizeScopeSections(null, {
      plan_jql: "project = P",
      unplan_jql: "labels = adhoc",
    });
    expect(sections.map((section) => section.id)).toEqual(["plan", "unplan"]);
    expect(sections[0]?.jql).toBe("project = P");
  });

  it("sorts custom sections by order", () => {
    const sections = normalizeScopeSections([
      { id: "b", name: "Mobile", jql: "labels = mobile", kind: "planned", order: 1 },
      { id: "a", name: "Core", jql: "labels = core", kind: "planned", order: 0 },
    ]);
    expect(sections.map((section) => section.id)).toEqual(["a", "b"]);
  });
});

describe("validateScopeSections", () => {
  it("requires at least one section with name and jql", () => {
    expect(validateScopeSections([])).toContain("хотя бы одну");
    expect(validateScopeSections(defaultScopeSections())).toContain("JQL");
  });

  it("accepts valid sections", () => {
    expect(
      validateScopeSections([
        { id: "core", name: "Core", jql: "project = P", kind: "planned", order: 0 },
      ])
    ).toBeNull();
  });
});

describe("reorderScopeSections", () => {
  it("moves section down and reindexes order", () => {
    const sections = defaultScopeSections();
    const reordered = reorderScopeSections(sections, 0, 1);
    expect(reordered.map((section) => section.id)).toEqual(["unplan", "plan"]);
    expect(reordered[0]?.order).toBe(0);
    expect(reordered[1]?.order).toBe(1);
  });
});
