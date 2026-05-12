import { describe, expect, it } from "vitest";
import { normalizeOptionalNumber, normalizeOptionalText, parseBulkTasks } from "./taskInput";

describe("parseBulkTasks", () => {
  it("creates one manual task per non-empty line", () => {
    expect(parseBulkTasks("First task\n\nSecond task")).toEqual([
      { summary: "First task", jira_key: null, url: null, story_points: null },
      { summary: "Second task", jira_key: null, url: null, story_points: null },
    ]);
  });

  it("extracts Jira keys without losing summary text", () => {
    expect(parseBulkTasks("PROJ-12 - Build queue editor")).toEqual([
      { summary: "Build queue editor", jira_key: "PROJ-12", url: null, story_points: null },
    ]);
  });

  it("caps large pastes", () => {
    const input = Array.from({ length: 4 }, (_, index) => `Task ${index}`).join("\n");
    expect(parseBulkTasks(input, 2)).toHaveLength(2);
  });
});

describe("task input normalizers", () => {
  it("normalizes optional text fields", () => {
    expect(normalizeOptionalText("  x ")).toBe("x");
    expect(normalizeOptionalText("  ")).toBeNull();
  });

  it("normalizes optional non-negative numbers", () => {
    expect(normalizeOptionalNumber("13")).toBe(13);
    expect(normalizeOptionalNumber("-1")).toBeNull();
    expect(normalizeOptionalNumber("abc")).toBeNull();
  });
});
