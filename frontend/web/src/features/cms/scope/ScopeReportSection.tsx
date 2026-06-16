import { useMemo, useState } from "react";
import { Badge, Button, Spinner, TextareaField } from "../../../design-system";
import type { ScopeBoardIssue, ScopeBoardSnapshot, ScopeEpicReportSection, ScopeReportSectionBlock, ScopeResolvedQuestion } from "../api/cmsClient";
import {
  computeScopeReport,
  formatCommentMeta,
  formatScopeSp,
  normalizeScopeReport,
  priorityBadgeTone,
  resolveOpenQuestions,
  resolvedQuestions,
  sortDoneIssuesByRecentStatus,
  type ScopeOpenQuestion,
  snapshotOpenQuestionStats,
} from "./scopeBoardHelpers";
import { useIncrementalList } from "./scopeListPaging";
import { ScopeIncrementalFooter } from "./ScopeIncrementalFooter";
import { formatQueueTimelineDate } from "./scopePriorityQueueTimeline";
import { PlanFieldBadges } from "./scopePlanInsights";
import { RoleContributorsBadges } from "./scopeRoleContributors";

const REPORT_COLUMNS = [
  { key: "in_work" as const, title: "В работе", tone: "info" as const },
  { key: "in_test" as const, title: "В тесте", tone: "warning" as const },
  { key: "done" as const, title: "Готово", tone: "success" as const },
];

export function ScopeReportSection({
  snapshot,
  canManage,
  showTechnicalFields = false,
  onAddQuestion,
  onResolveQuestion,
}: {
  snapshot: ScopeBoardSnapshot;
  canManage: boolean;
  showTechnicalFields?: boolean;
  onAddQuestion: (text: string) => Promise<void>;
  onResolveQuestion: (questionId: string, comment: string) => Promise<void>;
}) {
  const report = snapshot.report ? normalizeScopeReport(snapshot.report) : computeScopeReport(snapshot);
  const openQuestions = resolveOpenQuestions(snapshot);
  const closedQuestions = resolvedQuestions(snapshot);

  return (
    <details className="scope-collapsible-card group overflow-hidden rounded-lg bg-surface">
      <summary className="scope-section-header flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 marker:content-none sm:px-5">
        <div>
          <h2 className="text-base font-semibold text-ink">Отчёт</h2>
          <p className="scope-section-header-subtitle mt-1 text-sm">
            Каждая JQL-секция отдельно · внутри блока сортировка по приоритету Jira
          </p>
        </div>
        <span className="scope-section-header-icon inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-transform group-open:rotate-180">
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
            <path d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06z" />
          </svg>
        </span>
      </summary>

      <div className="space-y-5 p-4 sm:p-6 lg:p-7">
        <div className="space-y-5">
          {(report.sections ?? []).map((section) => (
            <EpicReportBlock
              key={section.id}
              title={section.name}
              subtitle={section.kind === "planned" ? "Плановый scope" : "Внеплановый scope"}
              accent={section.kind === "planned" ? "blue" : "amber"}
              section={section}
              showTechnicalFields={showTechnicalFields}
            />
          ))}
        </div>

        <OpenQuestionsBlock
          snapshot={snapshot}
          count={openQuestions.length}
          canManage={canManage}
          issues={openQuestions}
          resolved={closedQuestions}
          onAddQuestion={onAddQuestion}
          onResolveQuestion={onResolveQuestion}
        />
      </div>
    </details>
  );
}

function EpicReportBlock({
  title,
  subtitle,
  accent,
  section,
  showTechnicalFields,
}: {
  title: string;
  subtitle: string;
  accent: "blue" | "amber";
  section: ScopeEpicReportSection | ScopeReportSectionBlock;
  showTechnicalFields: boolean;
}) {
  const accentStyles =
    accent === "blue"
      ? {
          shell: "bg-blue/[0.04]",
          header: "bg-blue/[0.08]",
          title: "text-blue",
          chip: "info" as const,
        }
      : {
          shell: "bg-line2/30",
          header: "bg-line2/60",
          title: "text-ink",
          chip: "warning" as const,
        };

  return (
    <details className={`overflow-hidden rounded-2xl shadow-sm ${accentStyles.shell}`}>
      <summary
        className={`cursor-pointer list-none px-4 py-4 marker:content-none sm:px-5 ${accentStyles.header}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className={`text-base font-semibold ${accentStyles.title}`}>{title}</h3>
              <Badge tone={accentStyles.chip}>{section.counts.total} задач</Badge>
            </div>
            <p className="mt-1 text-sm text-ink3">
              {subtitle} · «Готово» — недавно закрытые сверху · остальное по priority
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-sm text-ink3">
            <span className="rounded-full bg-surface/70 px-2.5 py-1">В работе: {section.counts.in_work}</span>
            <span className="rounded-full bg-surface/70 px-2.5 py-1">В тесте: {section.counts.in_test}</span>
            <span className="rounded-full bg-surface/70 px-2.5 py-1">Готово: {section.counts.done}</span>
          </div>
        </div>
      </summary>

      <div className="grid gap-4 p-4 lg:grid-cols-3 lg:p-5">
        {REPORT_COLUMNS.map((column) => (
          <ReportColumn
            key={column.key}
            columnKey={column.key}
            title={column.title}
            tone={column.tone}
            count={section.counts[column.key]}
            issues={section[column.key]}
            showTechnicalFields={showTechnicalFields}
          />
        ))}
      </div>
    </details>
  );
}

function OpenQuestionsBlock({
  snapshot,
  count,
  canManage,
  issues,
  resolved,
  onAddQuestion,
  onResolveQuestion,
}: {
  snapshot: ScopeBoardSnapshot;
  count: number;
  canManage: boolean;
  issues: ScopeOpenQuestion[];
  resolved: ScopeResolvedQuestion[];
  onAddQuestion: (text: string) => Promise<void>;
  onResolveQuestion: (questionId: string, comment: string) => Promise<void>;
}) {
  const needsAttention = count > 0;
  const stats = snapshotOpenQuestionStats(snapshot);
  const refreshedLabel = snapshot.refreshed_at
    ? new Date(snapshot.refreshed_at).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })
    : null;
  const [manualDraft, setManualDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const {
    visibleItems: visibleOpenQuestions,
    hasMore: hasMoreOpenQuestions,
    loadMore: loadMoreOpenQuestions,
    loadedCount: loadedOpenQuestionsCount,
    total: openQuestionsTotal,
  } = useIncrementalList(issues);

  async function addManualQuestion() {
    const text = manualDraft.trim();
    if (!text || adding) return;
    setAdding(true);
    try {
      await onAddQuestion(text);
      setManualDraft("");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div
      className={
        needsAttention
          ? "border-t-4 border-t-amber bg-amber/[0.06] px-4 py-5 sm:px-5"
          : "border-t border-line bg-line2/20 px-4 py-4 sm:px-5"
      }
    >
      <div
        className={
          needsAttention
            ? "rounded-lg border border-line bg-surface p-4 shadow-sm sm:p-5"
            : "rounded-lg border border-line bg-surface/60 p-4 sm:p-5"
        }
      >
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              {needsAttention ? (
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-amber/15 text-base font-bold leading-none text-amber">
                  !
                </span>
              ) : null}
              <h3 className={`font-semibold text-ink ${needsAttention ? "text-base" : "text-sm"}`}>
                Открытые вопросы
              </h3>
              {needsAttention ? <Badge tone="warning">Требует внимания</Badge> : null}
            </div>
            <p className="max-w-2xl text-sm text-ink2">
              {needsAttention
                ? "Обсудите вопрос и сразу зафиксируйте решение. Jira-вопросы сохранят ответ комментарием в Jira."
                : "Добавьте вопрос вручную или переведите Jira-задачу в «Пауза»."}
            </p>
          </div>
          <Badge tone={needsAttention ? "warning" : "neutral"}>{count}</Badge>
        </div>

        {canManage ? (
          <div className="mb-4 rounded-md border border-line bg-bg px-3 py-3">
            <TextareaField
              label="Добавить вопрос вручную"
              rows={2}
              value={manualDraft}
              disabled={adding}
              onChange={(event) => setManualDraft(event.target.value)}
            />
            <div className="mt-2 flex justify-end">
              <Button size="sm" variant="ghost" disabled={adding || manualDraft.trim().length === 0} onClick={() => void addManualQuestion()}>
                {adding ? <Spinner size="sm" /> : null}
                Добавить вопрос
              </Button>
            </div>
          </div>
        ) : null}

        {needsAttention ? (
          <>
            <ul className="space-y-2">
              {visibleOpenQuestions.map((issue) => (
                <OpenQuestionCard
                  key={issue.id}
                  issue={issue}
                  canManage={canManage}
                  onResolveQuestion={onResolveQuestion}
                />
              ))}
            </ul>
            <ScopeIncrementalFooter
              loadedCount={loadedOpenQuestionsCount}
              total={openQuestionsTotal}
              hasMore={hasMoreOpenQuestions}
              onMore={loadMoreOpenQuestions}
              itemNoun="вопросов"
            />
          </>
        ) : (
          <div className="space-y-2 text-sm text-ink3">
            <p>Нет задач в паузе — блокеров нет.</p>
            {refreshedLabel ? <p>Snapshot обновлён: {refreshedLabel}</p> : null}
            {stats.totalIssues === 0 ? (
              <p className="rounded-md border border-line bg-bg px-3 py-2 text-xs leading-relaxed">
                Jira не вернул задач по JQL-секциям. Проверьте JQL в настройках и нажмите «Обновить из Jira».
              </p>
            ) : stats.pausedIssues === 0 ? (
              <p className="rounded-md border border-line bg-bg px-3 py-2 text-xs leading-relaxed">
                В snapshot {stats.totalIssues} задач по секциям, но ни одна не в статусе «Пауза».
                Убедитесь, что задача входит в Epic из JQL и статус в Jira — «Пауза», затем нажмите «Обновить из Jira» (F5 не подтягивает Jira).
              </p>
            ) : null}
          </div>
        )}

        <ResolvedQuestionsList items={resolved} />
      </div>
    </div>
  );
}

function OpenQuestionCard({
  issue,
  canManage,
  onResolveQuestion,
}: {
  issue: ScopeOpenQuestion;
  canManage: boolean;
  onResolveQuestion: (questionId: string, comment: string) => Promise<void>;
}) {
  const isJira = issue.kind === "jira";
  const jiraIssue = isJira ? (issue as ScopeBoardIssue) : null;
  const commentMeta = jiraIssue ? formatCommentMeta(jiraIssue) : null;
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resolveQuestion() {
    const text = draft.trim();
    if (!text || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onResolveQuestion(issue.id, text);
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось закрыть вопрос.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="rounded-md border border-line border-l-4 border-l-amber bg-bg px-3 py-3 sm:px-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(280px,420px)]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {jiraIssue ? <ReportIssueLink issue={jiraIssue} /> : <span className="text-sm font-medium text-ink">Вручную</span>}
            <Badge tone="warning">{isJira ? jiraIssue?.status || "Пауза" : "Вопрос"}</Badge>
              {issue.bucket ? <Badge tone={issue.section_kind === "planned" ? "info" : "warning"}>{issue.section_name || issue.bucket}</Badge> : null}
            {jiraIssue?.priority ? <Badge tone={priorityBadgeTone(jiraIssue.priority)}>{jiraIssue.priority}</Badge> : null}
            {jiraIssue ? <span className="text-xs text-ink3">{formatScopeSp(jiraIssue.story_points)} SP</span> : null}
          </div>
          <p className="mt-1 text-sm text-ink2">{issue.summary}</p>
          {jiraIssue?.assignee ? <p className="mt-1 text-xs text-ink3">Owner: {jiraIssue.assignee}</p> : null}
          {jiraIssue?.last_comment ? (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs font-medium text-ink2">Контекст из Jira</summary>
              <p className="mt-1 whitespace-pre-wrap rounded border border-line bg-surface px-2 py-2 text-xs text-ink2">{jiraIssue.last_comment}</p>
              {commentMeta ? <p className="mt-1 text-xs text-ink3">{commentMeta}</p> : null}
            </details>
          ) : null}
        </div>

        {canManage ? (
          <div>
            <TextareaField
              label={isJira ? "Ответ и закрытие → Jira" : "Ответ и закрытие"}
              rows={2}
              value={draft}
              disabled={saving}
              onChange={(event) => setDraft(event.target.value)}
            />
            {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
            <div className="mt-2 flex justify-end">
              <Button size="sm" variant="secondary" disabled={saving || draft.trim().length === 0} onClick={() => void resolveQuestion()}>
                {saving ? <Spinner size="sm" /> : null}
                Закрыть вопрос
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </li>
  );
}

function ResolvedQuestionsList({ items }: { items: ScopeResolvedQuestion[] }) {
  const { visibleItems, hasMore, loadMore, loadedCount, total } = useIncrementalList(items);
  if (items.length === 0) return null;

  return (
    <details className="mt-4 rounded-md border border-line bg-bg px-3 py-3">
      <summary className="cursor-pointer text-sm font-semibold text-ink">
        Решённые вопросы · {items.length}
      </summary>
      <ul className="mt-3 space-y-2">
        {visibleItems.map((item) => (
          <li key={`${item.id}-${item.resolved_at}`} className="rounded border border-line bg-surface px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              {item.url && item.key ? (
                <a href={item.url} target="_blank" rel="noreferrer" className="font-medium text-accent hover:underline">
                  {item.key}
                </a>
              ) : (
                <span className="font-medium text-ink">Вручную</span>
              )}
              {item.bucket ? <Badge tone={item.section_kind === "planned" ? "info" : "warning"}>{item.section_name || item.bucket}</Badge> : null}
              <span className="text-xs text-ink3">{formatResolvedDate(item.resolved_at)}</span>
            </div>
            <p className="mt-1 text-ink2">{item.summary}</p>
            <p className="mt-1 whitespace-pre-wrap text-xs text-ink3">{item.comment}</p>
          </li>
        ))}
      </ul>
      <ScopeIncrementalFooter
        loadedCount={loadedCount}
        total={total}
        hasMore={hasMore}
        onMore={loadMore}
        itemNoun="вопросов"
      />
    </details>
  );
}

function formatResolvedDate(value?: string): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
}

function ReportColumn({
  columnKey,
  title,
  tone,
  count,
  issues,
  showTechnicalFields,
}: {
  columnKey: "in_work" | "in_test" | "done";
  title: string;
  tone: "info" | "warning" | "success";
  count: number;
  issues: ScopeBoardIssue[];
  showTechnicalFields: boolean;
}) {
  const sortedIssues = useMemo(
    () => (columnKey === "done" ? sortDoneIssuesByRecentStatus(issues) : issues),
    [columnKey, issues]
  );
  const { visibleItems, hasMore, loadMore, loadedCount, total } = useIncrementalList(sortedIssues);

  return (
    <div className="rounded-2xl bg-bg/70 p-4">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-ink">{title}</h3>
        <Badge tone={tone}>{count}</Badge>
      </div>
      {sortedIssues.length === 0 ? (
        <p className="rounded-xl bg-line2/40 px-3 py-5 text-center text-sm text-ink3">Нет задач</p>
      ) : (
        <>
          <ul className="space-y-3 text-sm">
            {visibleItems.map((issue) => (
              <li key={issue.key} className="rounded-xl bg-surface/80 px-3 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <ReportIssueLink issue={issue} />
                  {issue.priority ? (
                    <Badge tone={priorityBadgeTone(issue.priority)}>{issue.priority}</Badge>
                  ) : (
                    <Badge tone="neutral">—</Badge>
                  )}
                  <span className="text-xs text-ink3">{formatScopeSp(issue.story_points)} SP</span>
                </div>
                <p className="mt-2 line-clamp-3 text-sm text-ink2">{issue.summary}</p>
                <div className="mt-2">
                  <RoleContributorsBadges issue={issue} showSource={showTechnicalFields} />
                  <PlanFieldBadges issue={issue} />
                </div>
                {columnKey === "done" && (issue.status_entered_at || issue.status_changed_at) ? (
                  <p className="mt-2 text-xs text-ink3">
                    В «{issue.status || "Готово"}» с{" "}
                    {formatQueueTimelineDate(issue.status_entered_at || issue.status_changed_at || "")}
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-ink3">
                    {[issue.status, issue.assignee].filter(Boolean).join(" · ") || "—"}
                  </p>
                )}
              </li>
            ))}
          </ul>
          <ScopeIncrementalFooter
            loadedCount={loadedCount}
            total={total}
            hasMore={hasMore}
            onMore={loadMore}
          />
        </>
      )}
    </div>
  );
}

function ReportIssueLink({ issue }: { issue: ScopeBoardIssue }) {
  if (issue.url) {
    return (
      <a href={issue.url} target="_blank" rel="noreferrer" className="text-sm font-medium text-accent hover:underline">
        {issue.key}
      </a>
    );
  }
  return <span className="text-sm font-medium text-ink">{issue.key}</span>;
}
