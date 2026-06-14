import { describe, expect, it } from "vitest";
import {
  formatQueueMilestoneLine,
  formatReorderLine,
  lastReorderForIssue,
  resolveQueueIssueMilestone,
} from "./scopePriorityQueueTimeline";

describe("resolveQueueIssueMilestone", () => {
  it("prefers live issue milestone over stale history", () => {
    const milestone = resolveQueueIssueMilestone(
      {
        key: "FLEX-1",
        status: "К выполнению",
        status_entered_at: "2026-06-18T10:00:00+00:00",
      },
      [
        {
          type: "appeared",
          at: "2026-06-20T10:00:00+00:00",
          by: "Jira",
          issue_key: "FLEX-1",
        },
      ]
    );

    expect(milestone.at).toBe("2026-06-18T10:00:00+00:00");
    expect(milestone.statusName).toBe("К выполнению");
  });

  it("falls back to history appeared when live milestone is missing", () => {
    const milestone = resolveQueueIssueMilestone(
      { key: "FLEX-2", status: "К выполнению" },
      [
        {
          type: "appeared",
          at: "2026-06-12T10:00:00+00:00",
          by: "Jira",
          issue_key: "FLEX-2",
          status_name: "К выполнению",
        },
      ]
    );

    expect(milestone.at).toBe("2026-06-12T10:00:00+00:00");
  });

  it("uses status_changed_at when status_entered_at is missing", () => {
    const milestone = resolveQueueIssueMilestone({
      key: "FLEX-3",
      status: "К выполнению",
      status_changed_at: "2026-06-11T10:00:00+00:00",
    });

    expect(milestone.at).toBe("2026-06-11T10:00:00+00:00");
  });
});

describe("formatQueueMilestoneLine", () => {
  it("formats known milestone date", () => {
    expect(
      formatQueueMilestoneLine({
        at: "2026-06-18T10:00:00+00:00",
        statusName: "К выполнению",
      })
    ).toContain("В «К выполнению» с");
  });

  it("formats missing milestone date", () => {
    expect(
      formatQueueMilestoneLine({
        at: "",
        statusName: "К выполнению",
      })
    ).toContain("дата перехода не найдена в Jira");
  });
});

describe("lastReorderForIssue", () => {
  it("returns the latest reorder for the issue", () => {
    const entry = lastReorderForIssue(
      [
        {
          type: "reorder",
          at: "2026-06-10T10:00:00+00:00",
          issue_key: "FLEX-1",
          from_index: 2,
          to_index: 0,
          by: "PO",
        },
        {
          type: "reorder",
          at: "2026-06-12T10:00:00+00:00",
          issue_key: "FLEX-1",
          from_index: 1,
          to_index: 3,
          by: "PO",
        },
      ],
      "FLEX-1"
    );

    expect(entry?.at).toBe("2026-06-12T10:00:00+00:00");
    expect(entry?.to_index).toBe(3);
  });
});

describe("formatReorderLine", () => {
  it("includes position change and author", () => {
    expect(
      formatReorderLine({
        type: "reorder",
        at: "2026-06-12T10:00:00+00:00",
        issue_key: "FLEX-1",
        from_index: 2,
        to_index: 0,
        by: "PO",
      })
    ).toBe("Порядок изменён · 12.06.26 · 3 → 1 · PO");
  });
});
