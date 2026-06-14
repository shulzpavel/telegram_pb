import { Badge, Surface } from "../../../design-system";
import type { ScopeBoardMetrics } from "../api/cmsClient";
import { formatScopeSp, intakeStatusMeta } from "./scopeBoardHelpers";
import { buildCapacityVisual, donutArcs } from "./scopeBoardVisuals";

export interface ScopeReportSummary {
  inWorkSp: number;
  doneSp: number;
}

export interface ScopeDataQualityIssue {
  key: string;
  summary: string;
  url?: string;
  status?: string;
  section?: string;
  storyPoints?: number | null;
  reasons?: string[];
}

export interface ScopeDataQualityDetails {
  unestimated: ScopeDataQualityIssue[];
  roleIssues: ScopeDataQualityIssue[];
}

export function ScopeVisualDashboard({
  metrics,
  reportSummary,
  dataQualityDetails,
}: {
  metrics: ScopeBoardMetrics;
  reportSummary?: ScopeReportSummary;
  dataQualityDetails?: ScopeDataQualityDetails;
}) {
  const intake = intakeStatusMeta(metrics.intake_status, metrics);
  const visual = buildCapacityVisual(metrics);
  const arcs = donutArcs(visual.segments);
  const roleIssueCount = dataQualityDetails?.roleIssues.length ?? 0;

  return (
    <Surface className="overflow-hidden p-0">
      <div className="grid gap-0 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="flex flex-col items-center gap-4 border-b border-line p-5 sm:p-6 lg:border-b-0 lg:border-r">
          <div className="relative h-44 w-44 sm:h-52 sm:w-52">
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
              <p className="text-2xl font-bold text-ink sm:text-3xl">{visual.centerValue}</p>
              <p className="text-xs uppercase tracking-wide text-ink3">{visual.centerLabel}</p>
            </div>
          </div>
          <p className="text-center text-xs text-ink3">{visual.subtitle}</p>
          <div className="flex flex-wrap justify-center gap-2">
            {visual.segments.map((segment) => (
              <span key={segment.key} className="inline-flex items-center gap-1.5 rounded-full bg-line2 px-2.5 py-1 text-xs text-ink2">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: segment.color }} />
                {segment.label} · {visual.mode === "sp" ? `${formatScopeSp(segment.value)} SP` : segment.value}
              </span>
            ))}
          </div>
        </div>

        <div className="flex flex-col justify-center gap-5 p-5 sm:p-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-ink">Нагрузка на capacity</p>
              <Badge tone={intake.tone}>{intake.label}</Badge>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-line2">
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
            <div className="flex items-center justify-between text-xs text-ink3">
              <span>{visual.committedLabel}</span>
              <span>{visual.mode === "sp" ? visual.loadLabel : `${visual.loadLabel} задач`}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-center xl:grid-cols-4">
            <MetricChip label="План" value={formatScopeSp(metrics.plan_sp)} meta={`${metrics.plan_count} задач`} tone="info" />
            <MetricChip
              label="Выполнено"
              value={formatScopeSp(reportSummary?.doneSp ?? 0)}
              meta="полный SP задач в «Готово»"
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
              meta={`${metrics.unestimated_count} без оценки`}
              tone={metrics.buffer_sp < 0 || metrics.unestimated_count > 0 ? "warning" : "neutral"}
            />
          </div>

          <div className="grid gap-2 text-xs sm:grid-cols-2">
            <DataQualityCard
              label="Не оценено"
              value={`${metrics.unestimated_count} задач`}
              description="Нет SP — capacity и буфер считаются неполно."
              tone={metrics.unestimated_count > 0 ? "warning" : "neutral"}
            />
            <DataQualityCard
              label="Не назначена роль"
              value={`${roleIssueCount} задач`}
              description="Front/Back/QA не всегда можно разложить по людям."
              tone={roleIssueCount > 0 ? "warning" : "neutral"}
            />
          </div>

          {dataQualityDetails ? <DataQualityDetailsBlock details={dataQualityDetails} /> : null}

          {intake.bannerTitle ? (
            <p className={`rounded-lg px-3 py-2 text-xs leading-snug ${intake.bannerTone === "danger" ? "bg-red/10 text-red" : "bg-amber/10 text-amber"}`}>
              {intake.bannerTitle}
            </p>
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

function DataQualityDetailsBlock({ details }: { details: ScopeDataQualityDetails }) {
  const hasUnestimated = details.unestimated.length > 0;
  const hasRoleIssues = details.roleIssues.length > 0;
  if (!hasUnestimated && !hasRoleIssues) return null;
  const attentionCount = new Set([...details.unestimated, ...details.roleIssues].map((issue) => issue.key)).size;

  return (
    <details className="rounded-lg border border-line bg-bg">
      <summary className="cursor-pointer list-none px-3 py-2 text-xs font-semibold text-ink marker:content-none">
        Какие задачи требуют внимания:
        <span className="ml-2 font-normal text-ink3">
          {attentionCount} задач
        </span>
      </summary>
      <div className="grid gap-3 border-t border-line px-3 py-3 text-xs lg:grid-cols-2">
        <QualityIssueList
          title="Без SP"
          emptyText="Все задачи оценены."
          issues={details.unestimated}
          showStoryPoints={false}
        />
        <QualityIssueList
          title="Без роли"
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
  const visible = issues.slice(0, 12);
  const hiddenCount = Math.max(0, issues.length - visible.length);
  return (
    <div>
      <p className="mb-2 font-semibold text-ink">{title}</p>
      {issues.length === 0 ? (
        <p className="rounded-md border border-line bg-surface px-2 py-2 text-ink3">{emptyText}</p>
      ) : (
        <ul className="space-y-1.5">
          {visible.map((issue) => (
            <li key={`${title}-${issue.key}`} className="rounded-md border border-line bg-surface px-2 py-2">
              <div className="flex flex-wrap items-center gap-1.5">
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
          {hiddenCount > 0 ? <li className="text-ink3">Ещё {hiddenCount} задач скрыто.</li> : null}
        </ul>
      )}
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
    <div className="rounded-lg bg-line2/60 px-2 py-2">
      <p className="text-[10px] uppercase tracking-wide text-ink3">{label}</p>
      <p className="text-base font-bold text-ink">{value}</p>
      <p className={`text-[10px] ${toneClass}`}>{meta}</p>
    </div>
  );
}

function DataQualityCard({
  label,
  value,
  description,
  tone,
}: {
  label: string;
  value: string;
  description: string;
  tone: "neutral" | "warning";
}) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${tone === "warning" ? "border-amber/30 bg-amber/[0.06]" : "border-line bg-line2/40"}`}>
      <p className="font-semibold text-ink">{label}: {value}</p>
      <p className="mt-0.5 text-ink3">{description}</p>
    </div>
  );
}
