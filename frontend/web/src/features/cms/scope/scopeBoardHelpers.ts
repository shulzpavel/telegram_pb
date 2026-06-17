import type {
  ScopeBoardIssue,
  ScopeBoardMetrics,
  ScopeBoardReport,
  ScopeBoardSnapshot,
  ScopeEpicReportSection,
  ScopeIntakeStatus,
  ScopeManualQuestion,
  ScopeReportSectionBlock,
  ScopeResolvedQuestion,
  ScopeSectionKind,
} from "../api/cmsClient";
import { resolveSnapshotSections } from "./scopeSectionHelpers";

type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger";

export type ScopeReportBucket = "in_work" | "in_test" | "done" | "open_questions" | "not_started";

export type ScopeOpenQuestion = (ScopeBoardIssue | ScopeManualQuestion) & {
  id: string;
  kind: "jira" | "manual";
  bucket?: string;
  section_id?: string;
  section_name?: string;
  section_kind?: ScopeSectionKind;
};

const DONE_STATUS_NAMES = new Set(["готово", "done", "closed", "resolved", "cancelled", "canceled", "won't do", "wont do"]);
const PAUSE_STATUS_KEYWORDS = ["пауз", "pause", "on hold", "blocked"];
const TEST_STATUS_NAMES = new Set(["тестирование", "к релизу"]);
const REPORT_IN_TEST_STATUS_NAMES = new Set(["тестирование", "к тестированию", "к релизу"]);
const NOT_STARTED_STATUS_NAMES = new Set(["backlog", "бэклог", "к выполнению", "to do", "todo", "open"]);

const JIRA_PRIORITY_RANK: Record<string, number> = {
  blocker: 0,
  highest: 0,
  critical: 1,
  high: 2,
  medium: 3,
  low: 4,
  lowest: 5,
  minor: 5,
  trivial: 6,
};

export function jiraPriorityRank(priority: string | undefined): number {
  const label = (priority || "").trim().toLowerCase();
  if (!label) return 99;
  if (label in JIRA_PRIORITY_RANK) return JIRA_PRIORITY_RANK[label]!;
  for (const [token, rank] of Object.entries(JIRA_PRIORITY_RANK)) {
    if (label.includes(token)) return rank;
  }
  return 50;
}

export function sortIssuesByJiraPriority(issues: ScopeBoardIssue[]): ScopeBoardIssue[] {
  return [...issues].sort((left, right) => {
    const byPriority = jiraPriorityRank(left.priority) - jiraPriorityRank(right.priority);
    if (byPriority !== 0) return byPriority;
    return left.key.localeCompare(right.key);
  });
}

function statusEnteredTimestamp(issue: ScopeBoardIssue): number {
  for (const value of [issue.status_entered_at, issue.status_changed_at, issue.resolution_date, issue.updated]) {
    if (!value) continue;
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return 0;
}

/** Done column: most recently moved to current status first. */
export function sortDoneIssuesByRecentStatus(issues: ScopeBoardIssue[]): ScopeBoardIssue[] {
  return [...issues].sort((left, right) => {
    const byEntered = statusEnteredTimestamp(right) - statusEnteredTimestamp(left);
    if (byEntered !== 0) return byEntered;
    const byPriority = jiraPriorityRank(left.priority) - jiraPriorityRank(right.priority);
    if (byPriority !== 0) return byPriority;
    return left.key.localeCompare(right.key);
  });
}

function sortReportColumnIssues(column: ScopeReportBucket, issues: ScopeBoardIssue[]): ScopeBoardIssue[] {
  if (column === "done") return sortDoneIssuesByRecentStatus(issues);
  if (column === "in_test") return sortInTestReportIssues(issues);
  return sortIssuesByJiraPriority(issues);
}

export type InTestReportSubgroup = "testing" | "ready_for_test" | "ready_for_release";

const IN_TEST_REPORT_SUBGROUP_ORDER: Record<InTestReportSubgroup, number> = {
  testing: 0,
  ready_for_test: 1,
  ready_for_release: 2,
};

export const IN_TEST_REPORT_SUBGROUP_LABELS: Record<InTestReportSubgroup, string> = {
  testing: "Тестирование",
  ready_for_test: "К тестированию",
  ready_for_release: "К релизу",
};

export function inTestReportSubgroup(issue: ScopeBoardIssue): InTestReportSubgroup {
  const status = (issue.status || "").toLowerCase().trim();
  if (status === "к тестированию") return "ready_for_test";
  if (status === "к релизу") return "ready_for_release";
  return "testing";
}

export function sortInTestReportIssues(issues: ScopeBoardIssue[]): ScopeBoardIssue[] {
  return [...issues].sort((left, right) => {
    const bySubgroup =
      IN_TEST_REPORT_SUBGROUP_ORDER[inTestReportSubgroup(left)] -
      IN_TEST_REPORT_SUBGROUP_ORDER[inTestReportSubgroup(right)];
    if (bySubgroup !== 0) return bySubgroup;
    const byPriority = jiraPriorityRank(left.priority) - jiraPriorityRank(right.priority);
    if (byPriority !== 0) return byPriority;
    return left.key.localeCompare(right.key);
  });
}

export function classifyScopeReportBucket(issue: ScopeBoardIssue): ScopeReportBucket {
  const status = (issue.status || "").toLowerCase().trim();
  const category = (issue.status_category || "").toLowerCase();
  if (category === "done" || DONE_STATUS_NAMES.has(status)) {
    return "done";
  }
  if (status === "пауза" || PAUSE_STATUS_KEYWORDS.some((token) => status.includes(token))) {
    return "open_questions";
  }
  if (REPORT_IN_TEST_STATUS_NAMES.has(status)) {
    return "in_test";
  }
  if (category === "new" || NOT_STARTED_STATUS_NAMES.has(status)) {
    return "not_started";
  }
  return "in_work";
}

export function isOpenQuestionIssue(issue: ScopeBoardIssue): boolean {
  return classifyScopeReportBucket(issue) === "open_questions";
}

export function snapshotOpenQuestionStats(snapshot: ScopeBoardSnapshot): {
  totalIssues: number;
  pausedIssues: number;
  planPaused: number;
  unplanPaused: number;
} {
  const sections = resolveSnapshotSections(snapshot);
  let totalIssues = 0;
  let pausedIssues = 0;
  let planPaused = 0;
  let unplanPaused = 0;
  for (const section of sections) {
    totalIssues += section.issues.length;
    const paused = section.issues.filter(isOpenQuestionIssue);
    pausedIssues += paused.length;
    if (section.kind === "planned") planPaused += paused.length;
    if (section.kind === "unplanned") unplanPaused += paused.length;
  }
  return { totalIssues, pausedIssues, planPaused, unplanPaused };
}

function buildEpicReportSection(issues: ScopeBoardIssue[], bucket: string): ScopeEpicReportSection {
  const section: ScopeEpicReportSection = {
    in_work: [],
    in_test: [],
    done: [],
    counts: { in_work: 0, in_test: 0, done: 0, total: 0 },
  };

  for (const issue of issues) {
    const column = classifyScopeReportBucket(issue);
    if (column === "open_questions" || column === "not_started") continue;
    section[column].push({ ...issue, bucket });
  }

  section.in_work = sortReportColumnIssues("in_work", section.in_work);
  section.in_test = sortReportColumnIssues("in_test", section.in_test);
  section.done = sortReportColumnIssues("done", section.done);
  section.counts = {
    in_work: section.in_work.length,
    in_test: section.in_test.length,
    done: section.done.length,
    total: section.in_work.length + section.in_test.length + section.done.length,
  };
  return section;
}

function aggregateReportSections(sections: ScopeReportSectionBlock[], kind: ScopeSectionKind): ScopeEpicReportSection {
  const merged: ScopeEpicReportSection = {
    in_work: [],
    in_test: [],
    done: [],
    counts: { in_work: 0, in_test: 0, done: 0, total: 0 },
  };
  for (const section of sections) {
    if (section.kind !== kind) continue;
    merged.in_work.push(...section.in_work);
    merged.in_test.push(...section.in_test);
    merged.done.push(...section.done);
  }
  merged.in_work = sortReportColumnIssues("in_work", merged.in_work);
  merged.in_test = sortReportColumnIssues("in_test", merged.in_test);
  merged.done = sortReportColumnIssues("done", merged.done);
  merged.counts = {
    in_work: merged.in_work.length,
    in_test: merged.in_test.length,
    done: merged.done.length,
    total: merged.in_work.length + merged.in_test.length + merged.done.length,
  };
  return merged;
}

function buildReportSectionBlock(
  section: { id: string; name: string; kind: ScopeSectionKind; order: number; issues: ScopeBoardIssue[] }
): ScopeReportSectionBlock {
  const report = buildEpicReportSection(section.issues, section.id);
  return {
    id: section.id,
    name: section.name,
    kind: section.kind,
    order: section.order,
    ...report,
  };
}

/** Client-side fallback when snapshot was saved before report was added. */
export function computeScopeReport(snapshot: ScopeBoardSnapshot): ScopeBoardReport {
  const sections = resolveSnapshotSections(snapshot).map(buildReportSectionBlock);
  const plan = aggregateReportSections(sections, "planned");
  const unplan = aggregateReportSections(sections, "unplanned");
  const openQuestions = resolveOpenQuestions(snapshot).filter(
    (question): question is ScopeBoardIssue & { id: string; kind: "jira" } => question.kind === "jira"
  );

  return {
    sections,
    plan,
    unplan,
    open_questions: openQuestions,
    counts: {
      in_work: plan.counts.in_work + unplan.counts.in_work,
      in_test: plan.counts.in_test + unplan.counts.in_test,
      done: plan.counts.done + unplan.counts.done,
      open_questions: openQuestions.length,
    },
  };
}

function isEpicReportSection(value: unknown): value is ScopeEpicReportSection {
  if (!value || typeof value !== "object") return false;
  const section = value as ScopeEpicReportSection;
  return Array.isArray(section.in_work) && section.counts != null && typeof section.counts.total === "number";
}

function isReportSectionBlock(value: unknown): value is ScopeReportSectionBlock {
  if (!isEpicReportSection(value)) return false;
  const section = value as ScopeReportSectionBlock;
  return typeof section.id === "string" && typeof section.name === "string";
}

function scrubReportSection<T extends ScopeEpicReportSection>(section: T): T {
  const next = {
    ...section,
    in_work: sortReportColumnIssues(
      "in_work",
      section.in_work.filter((issue) => classifyScopeReportBucket(issue) === "in_work")
    ),
    in_test: sortReportColumnIssues(
      "in_test",
      section.in_test.filter((issue) => classifyScopeReportBucket(issue) === "in_test")
    ),
    done: sortReportColumnIssues(
      "done",
      section.done.filter((issue) => classifyScopeReportBucket(issue) === "done")
    ),
  };
  next.counts = {
    in_work: next.in_work.length,
    in_test: next.in_test.length,
    done: next.done.length,
    total: next.in_work.length + next.in_test.length + next.done.length,
  };
  return next;
}

/** Normalize legacy flat and Plan/Unplan report payloads. */
export function normalizeScopeReport(report: ScopeBoardReport | Record<string, unknown>): ScopeBoardReport {
  const typed = report as ScopeBoardReport;
  if (Array.isArray(typed.sections) && typed.sections.every(isReportSectionBlock)) {
    const sections = typed.sections.map(scrubReportSection);
    const plan = typed.plan ? scrubReportSection(typed.plan) : aggregateReportSections(sections, "planned");
    const unplan = typed.unplan ? scrubReportSection(typed.unplan) : aggregateReportSections(sections, "unplanned");
    return {
      ...typed,
      sections,
      plan,
      unplan,
      counts: {
        in_work: plan.counts.in_work + unplan.counts.in_work,
        in_test: plan.counts.in_test + unplan.counts.in_test,
        done: plan.counts.done + unplan.counts.done,
        open_questions: typed.open_questions?.length ?? typed.counts?.open_questions ?? 0,
      },
    };
  }

  if (isEpicReportSection(typed.plan) && isEpicReportSection(typed.unplan)) {
    const plan = scrubReportSection(typed.plan);
    const unplan = scrubReportSection(typed.unplan);
    const sections: ScopeReportSectionBlock[] = [
      { id: "plan", name: "Plan", kind: "planned", order: 0, ...plan },
      { id: "unplan", name: "Unplan", kind: "unplanned", order: 1, ...unplan },
    ];
    return { ...typed, plan, unplan, sections };
  }

  const legacy = report as {
    in_work?: ScopeBoardIssue[];
    in_test?: ScopeBoardIssue[];
    done?: ScopeBoardIssue[];
    open_questions?: ScopeBoardIssue[];
    counts?: Record<ScopeReportBucket, number>;
  };

  const allInWork = legacy.in_work || [];
  const allInTest = legacy.in_test || [];
  const allDone = legacy.done || [];

  const plan: ScopeEpicReportSection = {
    in_work: sortReportColumnIssues("in_work", allInWork.filter((issue) => issue.bucket === "plan")),
    in_test: sortReportColumnIssues("in_test", allInTest.filter((issue) => issue.bucket === "plan")),
    done: sortReportColumnIssues("done", allDone.filter((issue) => issue.bucket === "plan")),
    counts: { in_work: 0, in_test: 0, done: 0, total: 0 },
  };
  const unplan: ScopeEpicReportSection = {
    in_work: sortReportColumnIssues("in_work", allInWork.filter((issue) => issue.bucket === "unplan")),
    in_test: sortReportColumnIssues("in_test", allInTest.filter((issue) => issue.bucket === "unplan")),
    done: sortReportColumnIssues("done", allDone.filter((issue) => issue.bucket === "unplan")),
    counts: { in_work: 0, in_test: 0, done: 0, total: 0 },
  };

  for (const section of [plan, unplan]) {
    section.counts = {
      in_work: section.in_work.length,
      in_test: section.in_test.length,
      done: section.done.length,
      total: section.in_work.length + section.in_test.length + section.done.length,
    };
  }

  const openQuestions = sortIssuesByJiraPriority(legacy.open_questions || []);

  return {
    sections: [
      { id: "plan", name: "Plan", kind: "planned", order: 0, ...plan },
      { id: "unplan", name: "Unplan", kind: "unplanned", order: 1, ...unplan },
    ],
    plan,
    unplan,
    open_questions: openQuestions,
    counts: legacy.counts || {
      in_work: plan.counts.in_work + unplan.counts.in_work,
      in_test: plan.counts.in_test + unplan.counts.in_test,
      done: plan.counts.done + unplan.counts.done,
      open_questions: openQuestions.length,
    },
  };
}

/** Open questions always come from raw snapshot issues so Jira comments stay in sync. */
export function resolveOpenQuestions(snapshot: ScopeBoardSnapshot): ScopeOpenQuestion[] {
  const byKey = new Map<string, ScopeOpenQuestion>();
  const resolvedIds = new Set((snapshot.resolved_questions || []).map((question) => question.id));

  for (const section of resolveSnapshotSections(snapshot)) {
    for (const issue of section.issues) {
      if (!isOpenQuestionIssue(issue) || resolvedIds.has(issue.key)) {
        continue;
      }
      byKey.set(issue.key, {
        ...issue,
        id: issue.key,
        kind: "jira",
        bucket: section.id,
        section_id: section.id,
        section_name: section.name,
        section_kind: section.kind,
      });
    }
  }

  if (snapshot.report) {
    const report = normalizeScopeReport(snapshot.report);
    for (const issue of report.open_questions) {
      if (!issue.key || resolvedIds.has(issue.key)) continue;
      const existing = byKey.get(issue.key);
      byKey.set(issue.key, existing ? { ...existing, ...issue, id: issue.key, kind: "jira" } : { ...issue, id: issue.key, kind: "jira" });
    }
  }

  for (const question of snapshot.manual_questions || []) {
    if (resolvedIds.has(question.id)) continue;
    byKey.set(question.id, { ...question, id: question.id, kind: "manual" });
  }

  return [...byKey.values()].sort((left, right) => {
    const byKind = (left.section_kind === "planned" ? 0 : 1) - (right.section_kind === "planned" ? 0 : 1);
    if (byKind !== 0) return byKind;
    const byPriority = jiraPriorityRank("priority" in left ? left.priority : undefined) - jiraPriorityRank("priority" in right ? right.priority : undefined);
    if (byPriority !== 0) return byPriority;
    return left.id.localeCompare(right.id);
  });
}

export function resolvedQuestions(snapshot: ScopeBoardSnapshot): ScopeResolvedQuestion[] {
  return [...(snapshot.resolved_questions || [])].sort((left, right) =>
    String(right.resolved_at || "").localeCompare(String(left.resolved_at || ""))
  );
}

export function priorityBadgeTone(priority: string | undefined): BadgeTone {
  const rank = jiraPriorityRank(priority);
  if (rank <= 0) return "danger";
  if (rank <= 2) return "warning";
  if (rank <= 3) return "info";
  return "neutral";
}

export function formatCommentMeta(issue: ScopeBoardIssue): string | null {
  const parts: string[] = [];
  if (issue.last_comment_author) {
    parts.push(issue.last_comment_author);
  }
  if (issue.last_comment_at) {
    const parsed = new Date(issue.last_comment_at);
    if (!Number.isNaN(parsed.getTime())) {
      parts.push(parsed.toLocaleDateString("ru-RU"));
    }
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

export interface IntakeStatusMeta {
  label: string;
  tone: BadgeTone;
  bannerTitle: string | null;
  bannerMessage: string | null;
  bannerTone: "warning" | "danger" | null;
}

type IntakeStatusMetricContext = Pick<ScopeBoardMetrics, "buffer_sp" | "unestimated_count">;

export function intakeStatusMeta(
  status: ScopeIntakeStatus,
  metrics?: IntakeStatusMetricContext | null,
  splitMode = false,
): IntakeStatusMeta {
  const missingLabel = splitMode ? "SP Dev / Test" : "SP";
  const unestimatedCount = metrics?.unestimated_count ?? 0;

  switch (status) {
    case "stop":
      return {
        label: "Стоп intake",
        tone: "danger",
        bannerTitle: splitMode ? "Буфер Dev или Test исчерпан — новые задачи не берём" : "Буфер исчерпан — новые задачи не берём",
        bannerMessage: splitMode
          ? "План и внеплановый burn превышают capacity по Dev или Test."
          : "План и незапланированный burn превышают capacity. Новый intake только после согласования.",
        bannerTone: "danger",
      };
    case "warning":
      if (unestimatedCount > 0) {
        return {
          label: "Осторожно",
          tone: "warning",
          bannerTitle: `Есть задачи без ${missingLabel} — intake по согласованию`,
          bannerMessage: splitMode
            ? "Активные задачи без SP Dev или SP Test делают capacity по трекам недостоверной. Оцените задачи или согласуйте исключение."
            : "Активные задачи без SP делают capacity недостоверной. Оцените задачи или согласуйте исключение.",
          bannerTone: "warning",
        };
      }
      return {
        label: "Осторожно",
        tone: "warning",
        bannerTitle: "Буфер меньше 20% — intake только по согласованию",
        bannerMessage: "Остаток capacity почти исчерпан. Берите новые задачи только после явного решения команды.",
        bannerTone: "warning",
      };
    default:
      return {
        label: "OK",
        tone: "success",
        bannerTitle: null,
        bannerMessage: null,
        bannerTone: null,
      };
  }
}

export function formatScopeSp(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function positiveTrackSp(value: number | null | undefined): number | null {
  if (value == null || Number.isNaN(value) || value <= 0) return null;
  return value;
}

export function issueInTestPhase(issue: ScopeBoardIssue): boolean {
  const status = (issue.status || "").toLowerCase().trim();
  return TEST_STATUS_NAMES.has(status);
}

export type JiraScopeRole = "front" | "back" | "qa";

export type JiraRoleFieldsConfigured = Record<JiraScopeRole, boolean>;

const DEFAULT_JIRA_ROLE_FIELDS_CONFIGURED: JiraRoleFieldsConfigured = {
  front: true,
  back: true,
  qa: true,
};

const JIRA_ROLE_FIELD_LABELS: Record<JiraScopeRole, string> = {
  front: "Не заполнено поле «Разработчик Front»",
  back: "Не заполнено поле «Разработчик Back»",
  qa: "Не заполнено поле «Тестировщик»",
};

export function resolveJiraRoleFieldsConfigured(
  snapshot?: Pick<ScopeBoardSnapshot, "jira_role_fields_configured" | "sections" | "plan_issues" | "unplan_issues"> | null,
): JiraRoleFieldsConfigured {
  const configured = snapshot?.jira_role_fields_configured;
  if (!configured) return DEFAULT_JIRA_ROLE_FIELDS_CONFIGURED;
  const resolved: JiraRoleFieldsConfigured = {
    front: configured.front ?? false,
    back: configured.back ?? false,
    qa: configured.qa ?? false,
  };
  if (resolved.front || resolved.back || resolved.qa) return resolved;
  if (snapshot && snapshotHasJiraRoleFieldSignals(snapshot)) {
    return DEFAULT_JIRA_ROLE_FIELDS_CONFIGURED;
  }
  return resolved;
}

function snapshotHasJiraRoleFieldSignals(
  snapshot: Pick<ScopeBoardSnapshot, "sections" | "plan_issues" | "unplan_issues">,
): boolean {
  for (const section of resolveSnapshotSections(snapshot as ScopeBoardSnapshot)) {
    for (const issue of section.issues) {
      if (issue.jira_role_assignees) return true;
      for (const role of ["front", "back", "qa"] as const) {
        if (issue.role_contributors?.[role]?.source === "jira_field") return true;
      }
    }
  }
  return false;
}

export function jiraRoleAssigneeName(issue: ScopeBoardIssue, role: JiraScopeRole): string {
  const explicit = issue.jira_role_assignees?.[role];
  if (explicit !== undefined) return explicit.trim();
  const contributor = issue.role_contributors?.[role];
  if (contributor?.source === "jira_field") return contributor.name?.trim() ?? "";
  return "";
}

export function hasJiraRoleAssignee(issue: ScopeBoardIssue, role: JiraScopeRole): boolean {
  return Boolean(jiraRoleAssigneeName(issue, role));
}

export function roleAttentionReasons(
  issue: ScopeBoardIssue,
  options?: { jiraRoleFieldsConfigured?: JiraRoleFieldsConfigured },
): string[] {
  const bucket = classifyScopeReportBucket(issue);
  if (bucket === "done" || bucket === "open_questions" || bucket === "not_started") return [];

  const configured = options?.jiraRoleFieldsConfigured ?? DEFAULT_JIRA_ROLE_FIELDS_CONFIGURED;
  const reasons: string[] = [];

  if (bucket === "in_work" || bucket === "in_test") {
    for (const role of ["front", "back"] as const) {
      if (!configured[role]) continue;
      if (!hasJiraRoleAssignee(issue, role)) {
        reasons.push(JIRA_ROLE_FIELD_LABELS[role]);
      }
    }
  }

  if (issueInTestPhase(issue) && configured.qa && !hasJiraRoleAssignee(issue, "qa")) {
    reasons.push(JIRA_ROLE_FIELD_LABELS.qa);
  }

  return reasons;
}

export function needsRoleAttributionAttention(issue: ScopeBoardIssue): boolean {
  return roleAttentionReasons(issue).length > 0;
}

export function missingWorkloadTracks(issue: ScopeBoardIssue): Array<"dev" | "test"> {
  const missing: Array<"dev" | "test"> = [];
  if (positiveTrackSp(issue.story_points_dev) == null) missing.push("dev");
  if (positiveTrackSp(issue.story_points_test) == null) missing.push("test");
  return missing;
}

export function workloadAttentionReasons(issue: ScopeBoardIssue): string[] {
  const missing = missingWorkloadTracks(issue);
  if (missing.length === 0) return [];
  const reasons: string[] = missing.map((track) => (track === "dev" ? "нет SP Dev" : "нет SP Test"));
  if (positiveTrackSp(issue.story_points) != null) {
    reasons.push("указан только общий SP");
  }
  return reasons;
}

export function needsWorkloadTrackAttention(issue: ScopeBoardIssue): boolean {
  if (classifyScopeReportBucket(issue) === "done") return false;
  return missingWorkloadTracks(issue).length > 0;
}

export function buildWorkloadAttentionIssues(snapshot: ScopeBoardSnapshot): ScopeBoardIssue[] {
  const byKey = new Map<string, ScopeBoardIssue>();
  for (const section of resolveSnapshotSections(snapshot)) {
    for (const issue of section.issues) {
      if (!needsWorkloadTrackAttention(issue)) continue;
      byKey.set(issue.key, {
        ...issue,
        section_name: issue.section_name || section.name,
        bucket: issue.bucket || section.id,
      });
    }
  }
  return Array.from(byKey.values()).sort((left, right) => left.key.localeCompare(right.key));
}

export function currentMonthValue(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${month}`;
}

const RU_MONTH_NAMES = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
] as const;

export function formatScopeDisplayMonth(value: string | null | undefined): string {
  if (!value) return "—";
  const match = value.trim().match(/^(\d{4})-(\d{2})$/);
  if (!match) return value;

  const monthNumber = Number(match[2]);
  if (monthNumber < 1 || monthNumber > 12) return value;

  return RU_MONTH_NAMES[monthNumber - 1];
}

export interface BufferBarSegment {
  key: string;
  label: string;
  value: number;
  className: string;
}

/** Build stacked bar segments for plan / unplan / free / overfill visualization. */
export function bufferBarSegments(
  capacity: number,
  planSp: number,
  unplanSp: number,
  overfillSp: number
): BufferBarSegment[] {
  const cap = Math.max(0, capacity);
  const committed = planSp + unplanSp;
  const free = cap > 0 ? Math.max(0, cap - committed) : 0;
  const segments: BufferBarSegment[] = [];

  if (planSp > 0) {
    segments.push({ key: "plan", label: "Плановый scope", value: planSp, className: "bg-blue" });
  }
  if (unplanSp > 0) {
    segments.push({ key: "unplan", label: "Внеплановый scope", value: unplanSp, className: "bg-amber" });
  }
  if (free > 0) {
    segments.push({ key: "free", label: "Буфер", value: free, className: "bg-emerald-500/80" });
  }
  if (overfillSp > 0) {
    segments.push({ key: "overfill", label: "Перегруз", value: overfillSp, className: "bg-red" });
  }

  if (segments.length === 0 && cap === 0) {
    segments.push({ key: "empty", label: "Capacity не задан", value: 1, className: "bg-line2" });
  }

  return segments;
}
