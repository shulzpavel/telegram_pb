import { describe, expect, it } from "vitest";
import {
  bufferBarSegments,
  classifyScopeReportBucket,
  computeScopeReport,
  formatScopeDisplayMonth,
  intakeStatusMeta,
  jiraPriorityRank,
  resolveOpenQuestions,
  needsWorkloadTrackAttention,
  roleAttentionReasons,
  workloadAttentionReasons,
  sortDoneIssuesByRecentStatus,
  sortInTestReportIssues,
  sortIssuesByJiraPriority,
} from "./scopeBoardHelpers";

describe("formatScopeDisplayMonth", () => {
  it("maps YYYY-MM month number to Russian month name", () => {
    expect(formatScopeDisplayMonth("2026-01")).toBe("Январь");
    expect(formatScopeDisplayMonth("2026-02")).toBe("Февраль");
    expect(formatScopeDisplayMonth("2026-06")).toBe("Июнь");
    expect(formatScopeDisplayMonth("2026-12")).toBe("Декабрь");
  });

  it("keeps unknown values readable", () => {
    expect(formatScopeDisplayMonth("bad-value")).toBe("bad-value");
    expect(formatScopeDisplayMonth(null)).toBe("—");
  });
});

describe("intakeStatusMeta", () => {
  it("maps ok to success badge without banner", () => {
    const meta = intakeStatusMeta("ok");
    expect(meta.tone).toBe("success");
    expect(meta.bannerTitle).toBeNull();
  });

  it("maps warning to caution banner", () => {
    const meta = intakeStatusMeta("warning");
    expect(meta.tone).toBe("warning");
    expect(meta.bannerTitle).toContain("20%");
  });

  it("maps stop to danger banner", () => {
    const meta = intakeStatusMeta("stop");
    expect(meta.tone).toBe("danger");
    expect(meta.bannerTitle).toContain("Буфер");
  });

  it("explains unestimated tasks as warning when buffer is still available", () => {
    const meta = intakeStatusMeta("warning", { buffer_sp: 29, unestimated_count: 3 });
    expect(meta.tone).toBe("warning");
    expect(meta.bannerTitle).toContain("без SP");
    expect(meta.bannerTitle).not.toContain("Буфер исчерпан");
  });
});

describe("bufferBarSegments", () => {
  it("includes free buffer when under capacity", () => {
    const segments = bufferBarSegments(80, 30, 5, 0);
    expect(segments.map((s) => s.key)).toEqual(["plan", "unplan", "free"]);
    expect(segments.find((s) => s.key === "free")?.value).toBe(45);
  });

  it("includes overfill when committed exceeds capacity", () => {
    const segments = bufferBarSegments(80, 50, 40, 10);
    expect(segments.some((s) => s.key === "overfill")).toBe(true);
  });
});

describe("computeScopeReport", () => {
  it("groups issues by report bucket", () => {
    const report = computeScopeReport({
      plan_issues: [
        {
          key: "P-1",
          summary: "Active",
          url: "",
          story_points: 3,
          estimated: true,
          status: "В работе",
          status_category: "indeterminate",
          issue_type: "Story",
          labels: [],
        },
      ],
      unplan_issues: [
        {
          key: "U-1",
          summary: "Paused",
          url: "",
          story_points: 1,
          estimated: true,
          status: "Пауза",
          status_category: "indeterminate",
          issue_type: "Bug",
          labels: [],
          last_comment: "Ждём ответ",
        },
      ],
      metrics: {} as never,
      refreshed_at: "2026-06-10T10:00:00Z",
    });

    expect(report.counts.in_work).toBe(1);
    expect(report.counts.open_questions).toBe(1);
    expect(report.plan.counts.in_work).toBe(1);
    expect(report.unplan.counts.total).toBe(0);
    expect(report.sections).toHaveLength(2);
    expect(report.sections?.[0]?.name).toBe("Plan");
    expect(report.open_questions[0]?.last_comment).toBe("Ждём ответ");
  });
});

describe("sortIssuesByJiraPriority", () => {
  it("orders Highest before Medium and Low", () => {
    const ordered = sortIssuesByJiraPriority([
      {
        key: "P-1",
        summary: "Low",
        url: "",
        story_points: 1,
        estimated: true,
        status: "В работе",
        status_category: "indeterminate",
        issue_type: "Story",
        labels: [],
        priority: "Low",
      },
      {
        key: "P-2",
        summary: "Highest",
        url: "",
        story_points: 1,
        estimated: true,
        status: "В работе",
        status_category: "indeterminate",
        issue_type: "Story",
        labels: [],
        priority: "Highest",
      },
    ]);

    expect(ordered.map((issue) => issue.key)).toEqual(["P-2", "P-1"]);
    expect(jiraPriorityRank("Highest")).toBeLessThan(jiraPriorityRank("Medium"));
  });

  it("sorts done issues by recent status entry first", () => {
    const ordered = sortDoneIssuesByRecentStatus([
      {
        key: "P-1",
        summary: "Old done",
        url: "",
        story_points: 1,
        estimated: true,
        status: "Готово",
        status_category: "done",
        issue_type: "Story",
        labels: [],
        status_entered_at: "2026-06-01T10:00:00+00:00",
      },
      {
        key: "P-2",
        summary: "Fresh done",
        url: "",
        story_points: 1,
        estimated: true,
        status: "Готово",
        status_category: "done",
        issue_type: "Story",
        labels: [],
        status_entered_at: "2026-06-13T10:00:00+00:00",
      },
    ]);

    expect(ordered.map((issue) => issue.key)).toEqual(["P-2", "P-1"]);
  });
});

describe("classifyScopeReportBucket parity with backend", () => {
  it("matches Python bucket rules for FLEX statuses", () => {
    const issue = (status: string, category = "indeterminate") =>
      ({
        key: "X-1",
        summary: "x",
        url: "",
        story_points: 1,
        estimated: true,
        status,
        status_category: category,
        issue_type: "Story",
        labels: [],
      }) as const;

    expect(classifyScopeReportBucket(issue("В работе"))).toBe("in_work");
    expect(classifyScopeReportBucket(issue("К тестированию"))).toBe("in_test");
    expect(classifyScopeReportBucket(issue("Тестирование"))).toBe("in_test");
    expect(classifyScopeReportBucket(issue("Готово", "done"))).toBe("done");
    expect(classifyScopeReportBucket(issue("Пауза"))).toBe("open_questions");
    expect(classifyScopeReportBucket(issue("К релизу"))).toBe("in_test");
    expect(classifyScopeReportBucket(issue("Backlog", "new"))).toBe("not_started");
    expect(classifyScopeReportBucket(issue("К выполнению", "new"))).toBe("not_started");
  });

  it("sorts in-test column by subgroup then priority", () => {
    const issue = (key: string, status: string, priority = "Medium") =>
      ({
        key,
        summary: key,
        url: "",
        story_points: 1,
        estimated: true,
        status,
        status_category: "indeterminate",
        issue_type: "Story",
        labels: [],
        priority,
      }) as const;

    const sorted = sortInTestReportIssues([
      issue("R-1", "К релизу", "Low"),
      issue("T-1", "К тестированию", "High"),
      issue("Q-1", "Тестирование", "Medium"),
    ]);

    expect(sorted.map((item) => item.key)).toEqual(["Q-1", "T-1", "R-1"]);
  });
});

describe("resolveOpenQuestions", () => {
  it("returns pause tasks with comments from snapshot issues", () => {
    const items = resolveOpenQuestions({
      plan_issues: [],
      unplan_issues: [
        {
          key: "U-1",
          summary: "Blocked",
          url: "",
          story_points: 2,
          estimated: true,
          status: "Пауза",
          status_category: "indeterminate",
          issue_type: "Story",
          labels: [],
          last_comment: "Нужен ответ от legal",
          last_comment_author: "Anna",
        },
      ],
      metrics: {} as never,
      refreshed_at: "2026-06-10T10:00:00Z",
    });

    expect(items).toHaveLength(1);
    expect(items[0]?.last_comment).toBe("Нужен ответ от legal");
  });
});

describe("role attention", () => {
  const baseIssue = {
    key: "FLEX-1",
    summary: "Example",
    url: "https://example/browse/FLEX-1",
    story_points: 3,
    estimated: true,
    status_category: "indeterminate",
    issue_type: "Story",
    labels: [],
    jira_role_assignees: { front: "", back: "", qa: "" },
  } as const;

  const configured = { front: true, back: true, qa: true };

  it("flags QA gaps only in testing status", () => {
    const inWork = {
      ...baseIssue,
      status: "В работе",
    };
    expect(roleAttentionReasons(inWork, { jiraRoleFieldsConfigured: configured })).toEqual([
      "Не заполнено поле «Разработчик Front»",
      "Не заполнено поле «Разработчик Back»",
    ]);

    const inTest = {
      ...baseIssue,
      key: "FLEX-2",
      status: "Тестирование",
    };
    expect(roleAttentionReasons(inTest, { jiraRoleFieldsConfigured: configured })).toEqual([
      "Не заполнено поле «Разработчик Front»",
      "Не заполнено поле «Разработчик Back»",
      "Не заполнено поле «Тестировщик»",
    ]);
  });

  it("does not flag when jira role fields are filled", () => {
    const issue = {
      ...baseIssue,
      status: "В работе",
      jira_role_assignees: { front: "Front Dev", back: "Back Dev", qa: "" },
    };
    expect(roleAttentionReasons(issue, { jiraRoleFieldsConfigured: configured })).toEqual([]);
  });

  it("ignores gitlab attribution when jira fields are empty like FLEX-2673", () => {
    const issue = {
      ...baseIssue,
      key: "FLEX-2673",
      status: "В работе",
      labels: [],
      role_evidence: [],
      role_contributors: {
        back: { name: "Someone from GitLab", source: "gitlab_mr" },
      },
      jira_role_assignees: { front: "", back: "", qa: "" },
    };
    expect(roleAttentionReasons(issue, { jiraRoleFieldsConfigured: configured })).toEqual([
      "Не заполнено поле «Разработчик Front»",
      "Не заполнено поле «Разработчик Back»",
    ]);
  });

  it("flags only configured jira fields", () => {
    const issue = {
      ...baseIssue,
      status: "В работе",
      jira_role_assignees: { front: "", back: "", qa: "" },
    };
    expect(
      roleAttentionReasons(issue, { jiraRoleFieldsConfigured: { front: false, back: true, qa: false } }),
    ).toEqual(["Не заполнено поле «Разработчик Back»"]);
  });

  it("does not flag backlog tasks without roles", () => {
    const issue = {
      ...baseIssue,
      status: "Backlog",
      status_category: "new",
      labels: [],
      role_evidence: [],
    };
    expect(roleAttentionReasons(issue, { jiraRoleFieldsConfigured: configured })).toEqual([]);
  });
});

describe("workload attention", () => {
  it("flags issues with only general SP in split mode", () => {
    const issue = {
      key: "FLEX-1853",
      summary: "Example",
      url: "https://example/browse/FLEX-1853",
      story_points: 8,
      story_points_dev: null,
      story_points_test: null,
      estimated: true,
      status: "В работе",
      status_category: "indeterminate",
      issue_type: "Story",
      labels: [],
    };
    expect(needsWorkloadTrackAttention(issue)).toBe(true);
    expect(workloadAttentionReasons(issue)).toEqual(["нет SP Dev", "нет SP Test", "указан только общий SP"]);
  });
});
