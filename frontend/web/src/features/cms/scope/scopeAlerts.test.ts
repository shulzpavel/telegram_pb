import { describe, expect, it } from "vitest";
import type { ScopeBoardMetrics } from "../api/cmsClient";
import { buildScopeAlerts, groupScopeAlerts, scopeAlertCountLabel, scopeAlertsSummary } from "./scopeAlerts";

function baseMetrics(overrides: Partial<ScopeBoardMetrics> = {}): ScopeBoardMetrics {
  return {
    capacity_sp: 80,
    plan_sp: 40,
    unplan_sp: 10,
    buffer_sp: 30,
    overfill_sp: 0,
    intake_status: "ok",
    plan_count: 2,
    unplan_count: 1,
    unestimated_count: 0,
    scope_creep_count: 0,
    ...overrides,
  } as ScopeBoardMetrics;
}

describe("buildScopeAlerts", () => {
  it("marks buffer exhaustion as critical", () => {
    const alerts = buildScopeAlerts({ metrics: baseMetrics({ buffer_sp: -5, overfill_sp: 5, intake_status: "stop" }) });
    expect(alerts.some((alert) => alert.id === "buffer_exhausted" && alert.level === "critical")).toBe(true);
  });

  it("marks low buffer as warning", () => {
    const alerts = buildScopeAlerts({ metrics: baseMetrics({ buffer_sp: 10, intake_status: "warning" }) });
    expect(alerts.some((alert) => alert.id === "buffer_low" && alert.level === "warning")).toBe(true);
  });

  it("marks missing SP as warning, not critical", () => {
    const alerts = buildScopeAlerts({
      metrics: baseMetrics({ unestimated_count: 2, intake_status: "warning" }),
      workloadMode: "sp",
    });
    const missing = alerts.find((alert) => alert.id === "missing_sp");
    expect(missing?.level).toBe("warning");
  });

  it("marks only-general-SP tasks as warning in split mode", () => {
    const alerts = buildScopeAlerts({
      metrics: baseMetrics({ unestimated_count: 1, intake_status: "warning" }),
      workloadMode: "sp_dev_test",
      dataQualityDetails: {
        unestimated: [
          {
            key: "FLEX-1853",
            summary: "Example",
            reasons: ["указан только общий SP"],
          },
        ],
        roleIssues: [],
      },
    });
    const missing = alerts.find((alert) => alert.id === "missing_track_sp");
    expect(missing?.level).toBe("warning");
    expect(missing?.description).toContain("только общий SP");
  });

  it("classifies role gaps and scope creep as recommendations", () => {
    const alerts = buildScopeAlerts({
      metrics: baseMetrics({ scope_creep_count: 3 }),
      dataQualityDetails: {
        unestimated: [],
        roleIssues: [{ key: "P-1", summary: "No role" }],
      },
      jiraFetchTruncated: 2,
    });
    const grouped = groupScopeAlerts(alerts);
    expect(grouped.recommendation.map((alert) => alert.id).sort()).toEqual(
      ["jira_truncated", "role_attribution", "scope_creep"].sort(),
    );
  });

  it("uses full Russian count labels", () => {
    expect(scopeAlertCountLabel("warning", 1)).toBe("1 предупреждение");
    expect(scopeAlertCountLabel("warning", 2)).toBe("2 предупреждения");
    expect(scopeAlertCountLabel("recommendation", 5)).toBe("5 рекомендаций");
  });

  it("summarizes alert counts by severity", () => {
    const alerts = buildScopeAlerts({
      metrics: baseMetrics({ buffer_sp: -1, overfill_sp: 1, unestimated_count: 1, intake_status: "stop" }),
    });
    const summary = scopeAlertsSummary(alerts);
    expect(summary.tone).toBe("danger");
    expect(summary.critical).toBeGreaterThan(0);
    expect(summary.warning).toBeGreaterThan(0);
  });
});
