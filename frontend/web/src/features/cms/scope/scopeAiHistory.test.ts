import { describe, expect, it } from "vitest";
import { normalizeAiHistory } from "./scopeAiHistory";
import type { ScopeAiSummary } from "./scopeAiTypes";

const sampleSummary: ScopeAiSummary = {
  health: "yellow",
  summary: "Test summary",
  capacity_assessment: "ok",
  buffer_status: "tight",
  delivery_snapshot: "delivery",
  blockers: [],
  scope_risks: [],
  queue_insights: { todo: "todo", test: "test" },
  recommendations: [],
  focus_now: [],
  watch_list: [],
  generated_at: "2026-06-13T12:00:00+00:00",
  source: "anthropic",
};

describe("normalizeAiHistory", () => {
  it("builds a single entry from legacy ai_summary only", () => {
    const entries = normalizeAiHistory(sampleSummary, []);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.analysis.summary).toBe("Test summary");
  });

  it("fills missing ids so entries stay selectable", () => {
    const entries = normalizeAiHistory(sampleSummary, [
      {
        id: "",
        generated_at: "2026-06-12T12:00:00+00:00",
        health: "green",
        summary: "Older",
        analysis: { ...sampleSummary, summary: "Older", generated_at: "2026-06-12T12:00:00+00:00" },
      },
    ]);
    expect(entries[0]?.id).toBeTruthy();
  });
});
