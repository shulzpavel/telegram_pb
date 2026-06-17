import { Badge, Surface } from "../../../design-system";
import type { ScopeBoardMetrics, ScopeWorkloadMode } from "../api/cmsClient";
import { formatScopeSp, intakeStatusMeta } from "./scopeBoardHelpers";
import {
  buildScopeAlerts,
  SCOPE_ALERT_LEVEL_LABELS,
  scopeAlertCountLabel,
  scopeAlertsSummary,
  type ScopeDataQualityDetails,
  type ScopeDataQualityIssue,
} from "./scopeAlerts";
import { buildCapacityVisual, buildTrackCapacityVisual, donutArcs } from "./scopeBoardVisuals";
import { ScopeIncrementalFooter } from "./ScopeIncrementalFooter";
import { useIncrementalList } from "./scopeListPaging";
import { DEFAULT_SCOPE_WORKLOAD_MODE } from "./WorkloadModePicker";

export type { ScopeDataQualityDetails, ScopeDataQualityIssue };

export interface ScopeReportSummary {
  inWorkSp: number;
  doneSp: number;
}

export function ScopeVisualDashboard({
  metrics,
  workloadMode = DEFAULT_SCOPE_WORKLOAD_MODE,
  reportSummary,
  dataQualityDetails,
  jiraFetchTruncated = 0,
}: {
  metrics: ScopeBoardMetrics;
  workloadMode?: ScopeWorkloadMode;
  reportSummary?: ScopeReportSummary;
  dataQualityDetails?: ScopeDataQualityDetails;
  jiraFetchTruncated?: number;
}) {
  const splitMode = workloadMode === "sp_dev_test";
  const intake = intakeStatusMeta(metrics.intake_status, metrics, splitMode);
  const visual = buildCapacityVisual(metrics, { splitMode });
  const devVisual = splitMode ? buildTrackCapacityVisual(metrics, "dev") : null;
  const testVisual = splitMode ? buildTrackCapacityVisual(metrics, "test") : null;
  const arcs = donutArcs(visual.segments);
  const alerts = buildScopeAlerts({
    metrics,
    workloadMode,
    dataQualityDetails,
    jiraFetchTruncated,
  });
  const alertSummary = scopeAlertsSummary(alerts);
  const unestimatedCount = splitMode
    ? (dataQualityDetails?.unestimated.length ?? metrics.unestimated_count)
    : metrics.unestimated_count;

  return (
    <Surface className="overflow-hidden border-transparent bg-surface/80 p-0 shadow-card">
      <div className="space-y-5 p-4 sm:p-6 lg:p-7">
        {splitMode && devVisual && testVisual ? (
          <div className="grid gap-5 xl:grid-cols-2">
            <TrackCapacityPanel title="SP Dev" visual={devVisual} intake={intake} />
            <TrackCapacityPanel title="SP Test" visual={testVisual} intake={intake} />
          </div>
        ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.15fr)]">
          <div className="rounded-2xl bg-bg/70 p-5 sm:p-6">
            <div className="flex flex-col items-center gap-5">
              <div className="relative h-52 w-52 sm:h-60 sm:w-60 xl:h-64 xl:w-64">
                <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                  <circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" strokeWidth="10" className="text-line2" />
                  {arcs.map((arc) => (
                    <circle
                      key={arc.key}
                      cx="50"
                      cy="50"
                      r="38"
                      fill="none"
                      stroke={arc.color}
                      strokeWidth="10"
                      strokeDasharray={arc.dasharray}
                      strokeDashoffset={arc.dashoffset}
                      strokeLinecap="butt"
                    />
                  ))}
                </svg>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                  <p className="text-4xl font-bold text-ink sm:text-5xl">{visual.centerValue}</p>
                  <p className="mt-1 text-sm font-semibold uppercase tracking-wide text-ink3">{visual.centerLabel}</p>
                </div>
              </div>
              <div className="w-full space-y-3 text-center">
                <p className="text-sm font-medium text-ink3">{visual.subtitle}</p>
                <div className="grid auto-rows-fr gap-2 sm:grid-cols-3">
                  {visual.segments.map((segment) => (
                    <CapacitySegmentChip
                      key={segment.key}
                      color={segment.color}
                      label={segment.label}
                      value={visual.mode === "sp" ? `${formatScopeSp(segment.value)} SP` : String(segment.value)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="rounded-2xl bg-bg/70 p-5 sm:p-6">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-base font-semibold text-ink">Нагрузка на capacity</p>
                  <p className="mt-1 text-sm text-ink3">План, внеплановая работа и доступный буфер в одном срезе.</p>
                </div>
                <Badge tone={intake.tone}>{intake.label}</Badge>
              </div>
              <div className="space-y-3">
                <div className="h-4 overflow-hidden rounded-full bg-line2">
                  <div
                    className={`h-full rounded-full transition-all ${
                      metrics.intake_status === "stop"
                        ? "bg-red"
                        : metrics.intake_status === "warning"
                          ? "bg-amber"
                          : "bg-emerald-500"
                    }`}
                    style={{ width: `${Math.min(100, visual.loadPercent)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between gap-3 text-sm font-medium text-ink2">
                  <span>{visual.committedLabel}</span>
                  <span>{visual.mode === "sp" ? visual.loadLabel : `${visual.loadLabel} задач`}</span>
                </div>
              </div>
            </div>

            <div className="grid flex-1 grid-cols-2 gap-3 text-center">
              <MetricChip label="План" value={formatScopeSp(metrics.plan_sp)} meta={`${metrics.plan_count} задач`} tone="info" />
              <MetricChip
                label="Выполнено"
                value={formatScopeSp(reportSummary?.doneSp ?? 0)}
                meta="SP задач в «Готово»"
                tone="neutral"
              />
              <MetricChip
                label="В работе"
                value={formatScopeSp(reportSummary?.inWorkSp ?? 0)}
                meta="SP в work-колонке"
                tone="warning"
              />
              <MetricChip
                label="Буфер"
                value={formatScopeSp(metrics.buffer_sp)}
                meta={`${unestimatedCount} без оценки`}
                tone={metrics.buffer_sp < 0 || unestimatedCount > 0 ? "warning" : "neutral"}
              />
            </div>
          </div>
        </div>
        )}

        <div className="rounded-2xl p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-base font-semibold text-ink">Предупреждения и ошибки</p>
              <p className="mt-1 text-sm text-ink3">Критичные блокируют intake, предупреждения требуют согласования, рекомендации — улучшение данных.</p>
            </div>
            <ScopeAlertSummaryBadges summary={alertSummary} />
          </div>

          {alerts.length === 0 ? (
            <div className="rounded-2xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700">
              Замечаний нет — capacity и данные выглядят согласованными.
            </div>
          ) : (
            <div className="space-y-4">
              <ScopeAlertSection level="critical" alerts={alerts} />
              <ScopeAlertSection level="warning" alerts={alerts} />
              <ScopeAlertSection level="recommendation" alerts={alerts} />
            </div>
          )}

          {dataQualityDetails ? (
            <DataQualityDetailsBlock details={dataQualityDetails} splitMode={splitMode} />
          ) : null}
        </div>
      </div>
    </Surface>
  );
}

function issueLink(issue: ScopeDataQualityIssue) {
  if (!issue.url) {
    return <span className="font-semibold text-ink">{issue.key}</span>;
  }
  return (
    <a href={issue.url} target="_blank" rel="noreferrer" className="font-semibold text-accent hover:underline">
      {issue.key}
    </a>
  );
}

function DataQualityDetailsBlock({
  details,
  splitMode,
}: {
  details: ScopeDataQualityDetails;
  splitMode: boolean;
}) {
  const hasUnestimated = details.unestimated.length > 0;
  const hasRoleIssues = details.roleIssues.length > 0;
  if (!hasUnestimated && !hasRoleIssues) return null;
  const attentionCount = new Set([...details.unestimated, ...details.roleIssues].map((issue) => issue.key)).size;

  return (
    <details className="scope-collapsible-card group mt-4 overflow-hidden rounded-2xl">
      <summary className="scope-section-header-warning flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm font-semibold marker:content-none group-open:rounded-b-none">
        <span>
          Какие задачи требуют внимания:
          <span className="scope-section-header-subtitle ml-2 font-normal">
            {attentionCount} задач
          </span>
        </span>
        <span className="scope-section-header-icon inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-transform group-open:rotate-180">
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
            <path d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06z" />
          </svg>
        </span>
      </summary>
      <div className="grid gap-4 px-4 pb-4 pt-4 text-sm sm:px-5 sm:pb-5 lg:grid-cols-2">
        <QualityIssueList
          title={splitMode ? "Без SP Dev / Test" : "Без SP"}
          emptyText={splitMode ? "У всех задач заполнены SP Dev и SP Test." : "Все задачи оценены."}
          issues={details.unestimated}
          showStoryPoints={!splitMode}
        />
        <QualityIssueList
          title="Без роли (Front/Back; QA — в тесте)"
          emptyText="Разрывов атрибуции не найдено."
          issues={details.roleIssues}
          showStoryPoints
        />
      </div>
    </details>
  );
}

function QualityIssueList({
  title,
  emptyText,
  issues,
  showStoryPoints,
}: {
  title: string;
  emptyText: string;
  issues: ScopeDataQualityIssue[];
  showStoryPoints: boolean;
}) {
  const { visibleItems, hasMore, loadMore, loadedCount, total } = useIncrementalList(issues);

  return (
    <div>
      <p className="mb-2 font-semibold text-ink">{title}</p>
      {issues.length === 0 ? (
        <p className="rounded-xl bg-amber/[0.08] px-3 py-3 text-ink3">{emptyText}</p>
      ) : (
        <>
          <ul className="space-y-3">
            {visibleItems.map((issue) => (
              <li key={`${title}-${issue.key}`} className="rounded-xl bg-amber/[0.08] px-4 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  {issueLink(issue)}
                  {issue.status ? <Badge tone="neutral">{issue.status}</Badge> : null}
                  {issue.section ? <span className="text-ink3">{issue.section}</span> : null}
                  {showStoryPoints ? <span className="text-ink3">{formatScopeSp(issue.storyPoints ?? null)} SP</span> : null}
                </div>
                <p className="mt-1 line-clamp-2 text-ink2">{issue.summary}</p>
                {issue.reasons?.length ? (
                  <p className="mt-1 text-ink3">{issue.reasons.join(" · ")}</p>
                ) : null}
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

function TrackCapacityPanel({
  title,
  visual,
  intake,
}: {
  title: string;
  visual: ReturnType<typeof buildTrackCapacityVisual>;
  intake: ReturnType<typeof intakeStatusMeta>;
}) {
  const arcs = donutArcs(visual.segments);
  return (
    <div className="rounded-2xl bg-bg/70 p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-base font-semibold text-ink">{title}</p>
          <p className="mt-1 text-sm text-ink3">{visual.subtitle}</p>
        </div>
        <Badge tone={intake.tone}>{intake.label}</Badge>
      </div>
      <div className="flex flex-col items-center gap-5">
        <div className="relative h-44 w-44 sm:h-48 sm:w-48">
          <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
            <circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" strokeWidth="10" className="text-line2" />
            {arcs.map((arc) => (
              <circle
                key={arc.key}
                cx="50"
                cy="50"
                r="38"
                fill="none"
                stroke={arc.color}
                strokeWidth="10"
                strokeDasharray={arc.dasharray}
                strokeDashoffset={arc.dashoffset}
                strokeLinecap="butt"
              />
            ))}
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <p className="text-3xl font-bold text-ink sm:text-4xl">{visual.centerValue}</p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-ink3">{visual.centerLabel}</p>
          </div>
        </div>
        <div className="w-full space-y-3">
          <div className="h-3 overflow-hidden rounded-full bg-line2">
            <div
              className={`h-full rounded-full transition-all ${
                visual.loadPercent > 100 ? "bg-red" : visual.loadPercent > 80 ? "bg-amber" : "bg-emerald-500"
              }`}
              style={{ width: `${Math.min(100, visual.loadPercent)}%` }}
            />
          </div>
          <div className="flex items-center justify-between gap-3 text-sm font-medium text-ink2">
            <span>{visual.committedLabel}</span>
            <span>{visual.loadLabel}</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {visual.segments.map((segment) => (
              <CapacitySegmentChip
                key={segment.key}
                color={segment.color}
                label={segment.label}
                value={`${formatScopeSp(segment.value)} SP`}
                compact
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function CapacitySegmentChip({
  color,
  label,
  value,
  compact = false,
}: {
  color: string;
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <span
      className={`flex w-full flex-col items-center justify-center gap-1 rounded-xl bg-line2/60 px-2 py-2 text-center ${
        compact ? "min-h-12" : "min-h-14"
      }`}
    >
      <span className={`flex items-center justify-center gap-1.5 font-medium text-ink3 ${compact ? "text-xs" : "text-xs sm:text-sm"}`}>
        <span className={`shrink-0 rounded-full ${compact ? "h-2 w-2" : "h-2.5 w-2.5"}`} style={{ backgroundColor: color }} />
        <span className="leading-snug">{label}</span>
      </span>
      <span className={`font-semibold text-ink ${compact ? "text-xs" : "text-sm"}`}>{value}</span>
    </span>
  );
}

function ScopeAlertSummaryBadges({
  summary,
}: {
  summary: ReturnType<typeof scopeAlertsSummary>;
}) {
  const total = summary.critical + summary.warning + summary.recommendation;
  if (total === 0) {
    return <Badge tone="success" className="shrink-0 whitespace-nowrap">Без замечаний</Badge>;
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
      {summary.critical > 0 ? (
        <Badge tone="danger" className="shrink-0">
          {scopeAlertCountLabel("critical", summary.critical)}
        </Badge>
      ) : null}
      {summary.warning > 0 ? (
        <Badge tone="warning" className="shrink-0">
          {scopeAlertCountLabel("warning", summary.warning)}
        </Badge>
      ) : null}
      {summary.recommendation > 0 ? (
        <Badge tone="info" className="shrink-0">
          {scopeAlertCountLabel("recommendation", summary.recommendation)}
        </Badge>
      ) : null}
    </div>
  );
}

function ScopeAlertSection({
  level,
  alerts,
}: {
  level: "critical" | "warning" | "recommendation";
  alerts: ReturnType<typeof buildScopeAlerts>;
}) {
  const items = alerts.filter((alert) => alert.level === level);
  if (items.length === 0) return null;

  const toneClass =
    level === "critical"
      ? "border-red/20 bg-red/[0.06]"
      : level === "warning"
        ? "border-amber/20 bg-amber/[0.06]"
        : "border-blue/20 bg-blue/[0.06]";
  const titleClass =
    level === "critical" ? "text-red" : level === "warning" ? "text-amber" : "text-blue";

  return (
    <div className={`rounded-2xl border px-4 py-3 ${toneClass}`}>
      <p className={`text-xs font-bold uppercase tracking-wide ${titleClass}`}>
        {SCOPE_ALERT_LEVEL_LABELS[level]}
      </p>
      <ul className="mt-2 space-y-2">
        {items.map((alert) => (
          <li key={alert.id} className="rounded-xl bg-surface/70 px-3 py-3">
            <p className="text-sm font-semibold text-ink">
              {alert.title}
              {alert.count != null ? <span className="ml-2 font-normal text-ink3">· {alert.count}</span> : null}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-ink3">{alert.description}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MetricChip({
  label,
  value,
  meta,
  tone,
}: {
  label: string;
  value: string;
  meta: string;
  tone: "neutral" | "info" | "warning";
}) {
  const toneClass =
    tone === "info" ? "text-blue" : tone === "warning" ? "text-amber" : "text-ink3";
  return (
    <div className="flex min-h-28 flex-col justify-center rounded-2xl border border-line/70 bg-bg/70 px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink3">{label}</p>
      <p className="mt-1 text-3xl font-bold text-ink">{value}</p>
      <p className={`mt-1 text-sm ${toneClass}`}>{meta}</p>
    </div>
  );
}
