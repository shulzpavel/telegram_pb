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
  const hasCapacityError = metrics.intake_status === "stop" || metrics.buffer_sp < 0 || metrics.overfill_sp > 0;
  const hasWarnings = metrics.unestimated_count > 0 || roleIssueCount > 0 || metrics.intake_status === "warning";

  return (
    <Surface className="overflow-hidden border-transparent bg-surface/80 p-0 shadow-card">
      <div className="space-y-5 p-4 sm:p-6 lg:p-7">
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
                    <span
                      key={segment.key}
                      className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-line2/60 px-3 py-2 text-center text-sm font-medium text-ink2"
                    >
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: segment.color }} />
                      {segment.label} · {visual.mode === "sp" ? `${formatScopeSp(segment.value)} SP` : segment.value}
                    </span>
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
                meta={`${metrics.unestimated_count} без оценки`}
                tone={metrics.buffer_sp < 0 || metrics.unestimated_count > 0 ? "warning" : "neutral"}
              />
            </div>
          </div>
        </div>

        <div className="rounded-2xl p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-base font-semibold text-ink">Предупреждения и ошибки</p>
              <p className="mt-1 text-sm text-ink3">Что влияет на достоверность capacity и решение по новому intake.</p>
            </div>
            <Badge tone={hasCapacityError ? "danger" : hasWarnings ? "warning" : "success"}>
              {hasCapacityError ? "Есть ошибки" : hasWarnings ? "Есть предупреждения" : "Без замечаний"}
            </Badge>
          </div>

          {intake.bannerTitle ? (
            <QualityNoticeCard
              label={intake.bannerTone === "danger" ? "Ошибка" : "Предупреждение"}
              title={intake.bannerTitle}
              description={intake.bannerMessage ?? ""}
              tone={intake.bannerTone === "danger" ? "danger" : "warning"}
            />
          ) : null}

          <div className="mt-3 grid gap-3 md:grid-cols-2">
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
      <div className="grid gap-4 pt-4 text-sm lg:grid-cols-2">
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
        <p className="rounded-xl bg-amber/[0.08] px-3 py-3 text-ink3">{emptyText}</p>
      ) : (
        <ul className="space-y-3">
          {visible.map((issue) => (
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
    <div className="flex min-h-28 flex-col justify-center rounded-2xl border border-line/70 bg-bg/70 px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink3">{label}</p>
      <p className="mt-1 text-3xl font-bold text-ink">{value}</p>
      <p className={`mt-1 text-sm ${toneClass}`}>{meta}</p>
    </div>
  );
}

function QualityNoticeCard({
  label,
  title,
  description,
  tone,
}: {
  label: string;
  title: string;
  description: string;
  tone: "warning" | "danger";
}) {
  const toneClass =
    tone === "danger"
      ? "bg-red/[0.09] text-red"
      : "bg-amber/[0.09] text-amber";
  return (
    <div className={`rounded-2xl px-4 py-3 ${toneClass}`}>
      <p className="text-xs font-bold uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-base font-semibold">{title}</p>
      {description ? <p className="mt-1 text-sm leading-relaxed opacity-90">{description}</p> : null}
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
  const toneClass = tone === "warning" ? "bg-amber/[0.07]" : "bg-surface/80";
  return (
    <div className={`rounded-2xl px-4 py-4 ${toneClass}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-ink3">{tone === "warning" ? "Предупреждение" : "Проверка"}</p>
      <p className="mt-1 text-base font-semibold text-ink">{label}: {value}</p>
      <p className="mt-1 text-sm leading-relaxed text-ink3">{description}</p>
    </div>
  );
}
