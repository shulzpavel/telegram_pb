import type {
  ScopeBoardIssue,
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

export type ScopeReportBucket = "in_work" | "in_test" | "done" | "open_questions";

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
const TEST_STATUS_KEYWORDS = ["тестир", "testing", " in test", "to test", "к тест"];

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
  return sortIssuesByJiraPriority(issues);
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
  if (TEST_STATUS_KEYWORDS.some((token) => status.includes(token))) {
    return "in_test";
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
    if (column === "open_questions") continue;
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

/** Normalize legacy flat and Plan/Unplan report payloads. */
export function normalizeScopeReport(report: ScopeBoardReport | Record<string, unknown>): ScopeBoardReport {
  const typed = report as ScopeBoardReport;
  if (Array.isArray(typed.sections) && typed.sections.every(isReportSectionBlock)) {
    return {
      ...typed,
      plan: typed.plan || aggregateReportSections(typed.sections, "planned"),
      unplan: typed.unplan || aggregateReportSections(typed.sections, "unplanned"),
    };
  }

  if (isEpicReportSection(typed.plan) && isEpicReportSection(typed.unplan)) {
    const sections: ScopeReportSectionBlock[] = [
      { id: "plan", name: "Plan", kind: "planned", order: 0, ...typed.plan },
      { id: "unplan", name: "Unplan", kind: "unplanned", order: 1, ...typed.unplan },
    ];
    return { ...typed, sections };
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

export function intakeStatusMeta(status: ScopeIntakeStatus): IntakeStatusMeta {
  switch (status) {
    case "stop":
      return {
        label: "Стоп intake",
        tone: "danger",
        bannerTitle: "Буфер исчерпан — новые задачи не берём",
        bannerMessage:
          "План и незапланированный burn превышают capacity, или есть активные задачи без оценки. Новый intake только после согласования.",
        bannerTone: "danger",
      };
    case "warning":
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
