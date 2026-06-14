import { AiIntelligenceSurface, Badge, cn } from "../../../design-system";
import type { ScopeBoardMetrics } from "../api/cmsClient";
import { formatScopeSp, intakeStatusMeta } from "./scopeBoardHelpers";
import type { ScopeAiSummary, ScopeAiSeverity } from "./scopeAiTypes";

const HEALTH_LABELS: Record<ScopeAiSummary["health"], string> = {
  green: "Под контролем",
  yellow: "Есть риски",
  red: "Критично",
};

const HEALTH_TONE: Record<ScopeAiSummary["health"], "success" | "warning" | "danger"> = {
  green: "success",
  yellow: "warning",
  red: "danger",
};

const HEALTH_HINT: Record<ScopeAiSummary["health"], string> = {
  green: "Месяц идёт по плану, критичных сигналов нет.",
  yellow: "Есть зоны риска — нужны решения в ближайшие дни.",
  red: "Требуется срочное внимание руководства и PO.",
};

const BUFFER_LABELS: Record<ScopeAiSummary["buffer_status"], string> = {
  ok: "Запас есть",
  tight: "Мало запаса",
  critical: "На грани",
  overfilled: "Переполнение",
  unknown: "Нет данных",
};

const SEVERITY_TONE: Record<ScopeAiSeverity, "neutral" | "warning" | "danger"> = {
  low: "neutral",
  medium: "warning",
  high: "danger",
};

const SEVERITY_LABEL: Record<ScopeAiSeverity, string> = {
  low: "низкий",
  medium: "средний",
  high: "высокий",
};

const IMPACT_ACTION_LABEL: Record<ScopeAiSeverity, string> = {
  low: "Можно отложить",
  medium: "Сделать на этой неделе",
  high: "Сделать в первую очередь",
};

export function ScopeAiView({
  summary,
  generatedLabel,
  snapshotLabel,
  isHistorical = false,
  metrics,
  openQuestionsCount = 0,
}: {
  summary: ScopeAiSummary;
  generatedLabel?: string | null;
  snapshotLabel?: string | null;
  isHistorical?: boolean;
  metrics?: ScopeBoardMetrics | null;
  openQuestionsCount?: number;
}) {
  const whatsGood = summary.whats_good ?? [];
  const whatsBad = summary.whats_bad ?? [];
  const whatsCritical = summary.whats_critical ?? [];
  const roleRisks = summary.role_risks ?? [];
  const roleFocus = summary.role_focus ?? [];
  const intake = metrics ? intakeStatusMeta(metrics.intake_status, metrics) : null;
  const dataRisks = metrics ? buildDataRisks(metrics) : [];

  return (
    <AiIntelligenceSurface className="space-y-5 p-5 sm:p-6" sparkleLabel="AI-сводка для бизнеса">
      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-bold text-ink">Сводка месяца для бизнеса</h3>
              {isHistorical ? <Badge tone="neutral">из истории</Badge> : null}
              <Badge tone={HEALTH_TONE[summary.health]}>{HEALTH_LABELS[summary.health]}</Badge>
            </div>
            <p className="max-w-3xl text-sm text-ink2">{HEALTH_HINT[summary.health]}</p>
            {generatedLabel || snapshotLabel ? (
              <p className="text-xs text-ink3">
                {generatedLabel ? <>AI-сводка: {generatedLabel}</> : null}
                {generatedLabel && snapshotLabel ? " · " : null}
                {snapshotLabel ? <>Данные Jira: {snapshotLabel}</> : null}
              </p>
            ) : null}
          </div>
        </div>

        {metrics ? (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Свободный буфер"
              value={`${formatScopeSp(metrics.buffer_sp)} SP`}
              meta={`Capacity ${formatScopeSp(metrics.capacity_sp)} SP`}
              tone={metrics.buffer_sp <= 0 ? "danger" : metrics.intake_status === "warning" ? "warning" : "success"}
            />
            <KpiCard
              label="План + внеплан"
              value={`${formatScopeSp(metrics.plan_sp + metrics.unplan_sp)} SP`}
              meta={`${metrics.plan_count + metrics.unplan_count} задач`}
              tone="info"
            />
            <KpiCard
              label="Открытые вопросы"
              value={String(openQuestionsCount)}
              meta={openQuestionsCount > 0 ? "Нужно обсудить" : "Без блокеров"}
              tone={openQuestionsCount > 0 ? "warning" : "success"}
            />
            <KpiCard
              label="Intake"
              value={intake?.label ?? "—"}
              meta={`Буфер: ${BUFFER_LABELS[summary.buffer_status]}`}
              tone={intake?.tone ?? "neutral"}
            />
          </div>
        ) : null}

        {metrics?.plan_role_coverage ? (
          <div className="grid gap-2 sm:grid-cols-3">
            <RoleCoverageKpi label="Front" coverage={metrics.plan_role_coverage.front} unplan={metrics.unplan_role_coverage?.front} />
            <RoleCoverageKpi label="Back" coverage={metrics.plan_role_coverage.back} unplan={metrics.unplan_role_coverage?.back} />
            <RoleCoverageKpi label="QA" coverage={metrics.plan_role_coverage.qa} unplan={metrics.unplan_role_coverage?.qa} />
          </div>
        ) : null}
      </header>

      {dataRisks.length > 0 ? (
        <section className="rounded-xl border border-amber/30 bg-amber/[0.06] px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-ink3">Риски данных для AI-сводки</h4>
            <Badge tone="warning">{dataRisks.length}</Badge>
          </div>
          <ul className="mt-3 grid gap-2 text-sm text-ink2 sm:grid-cols-2">
            {dataRisks.map((risk) => (
              <li key={risk} className="rounded-lg border border-line bg-surface px-3 py-2">
                {risk}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {summary.role_workload_assessment ? (
        <section className="rounded-xl border border-line bg-surface px-4 py-4 sm:px-5">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-ink3">Нагрузка по ролям</h4>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink2 [overflow-wrap:anywhere]">
            {summary.role_workload_assessment}
          </p>
          {roleRisks.length > 0 ? (
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink3">Риски по ролям</p>
              <NumberedList items={roleRisks} />
            </div>
          ) : null}
          {roleFocus.length > 0 ? (
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink3">Фокус по ролям</p>
              <NumberedList items={roleFocus} />
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="rounded-xl border border-line bg-surface px-4 py-4 sm:px-5">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-ink3">Главное одним абзацем</h4>
        <p className="mt-2 whitespace-pre-wrap break-words text-base leading-relaxed text-ink [overflow-wrap:anywhere]">
          {summary.summary}
        </p>
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        <SignalCard tone="good" title="Что идёт хорошо" items={whatsGood} emptyText="Явных успехов AI не выделил." />
        <SignalCard tone="bad" title="Что беспокоит" items={whatsBad} emptyText="Серьёзных проблем не отмечено." />
        <SignalCard tone="critical" title="Что критично" items={whatsCritical} emptyText="Критичных пунктов нет." />
      </section>

      {summary.recommendations.length > 0 ? (
        <section className="space-y-3">
          <div>
            <h4 className="text-sm font-semibold text-ink">Рекомендации по шагам</h4>
            <p className="mt-1 text-xs text-ink3">Конкретные действия для PO и руководства — в порядке приоритета.</p>
          </div>
          <ol className="space-y-2">
            {summary.recommendations.map((rec, index) => (
              <li key={index} className="flex gap-3 rounded-lg border border-line bg-surface px-3 py-3 sm:px-4">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue/10 text-xs font-bold text-blue">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="whitespace-pre-wrap break-words text-sm text-ink [overflow-wrap:anywhere]">{rec.text}</p>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone={SEVERITY_TONE[rec.impact]}>Приоритет: {SEVERITY_LABEL[rec.impact]}</Badge>
                    <Badge tone="neutral">{IMPACT_ACTION_LABEL[rec.impact]}</Badge>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {summary.focus_now.length > 0 ? (
        <section className="rounded-lg border border-blue/20 bg-blue/[0.05] px-4 py-4">
          <h4 className="text-sm font-semibold text-ink">Фокус на ближайшей встрече</h4>
          <ol className="mt-3 space-y-2">
            {summary.focus_now.map((item, index) => (
              <li key={index} className="flex gap-3 text-sm text-ink2">
                <span className="font-semibold text-blue">{index + 1}.</span>
                <span className="min-w-0 break-words [overflow-wrap:anywhere]">{item}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {summary.blockers.length > 0 ? (
        <section className="space-y-2">
          <h4 className="text-sm font-semibold text-ink">Блокеры</h4>
          <ul className="space-y-2">
            {summary.blockers.map((blocker, index) => (
              <li key={index} className="rounded-lg border border-line bg-surface px-3 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-ink3">#{index + 1}</span>
                  <span className="break-words text-sm font-semibold text-ink [overflow-wrap:anywhere]">{blocker.title}</span>
                  <Badge tone={SEVERITY_TONE[blocker.severity]}>{SEVERITY_LABEL[blocker.severity]}</Badge>
                  {blocker.issue_keys.length > 0 ? (
                    <span className="text-xs text-ink3">{blocker.issue_keys.join(", ")}</span>
                  ) : null}
                </div>
                {blocker.detail ? (
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink3 [overflow-wrap:anywhere]">{blocker.detail}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <details className="rounded-lg border border-line bg-bg">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-ink marker:content-none">
          Подробности для команды
        </summary>
        <div className="space-y-4 border-t border-line px-4 py-4">
          <DetailBlock title="Отчёт по задачам">
            <p className="whitespace-pre-wrap break-words text-sm text-ink2 [overflow-wrap:anywhere]">
              {summary.report_assessment || "Нет оценки отчёта."}
            </p>
          </DetailBlock>

          <DetailBlock title="Открытые вопросы">
            <p className="whitespace-pre-wrap break-words text-sm text-ink2 [overflow-wrap:anywhere]">
              {summary.open_questions_assessment || "Нет оценки открытых вопросов."}
            </p>
          </DetailBlock>

          <DetailBlock title="Нагрузка по ролям">
            <p className="whitespace-pre-wrap break-words text-sm text-ink2 [overflow-wrap:anywhere]">
              {summary.role_workload_assessment || "Нет оценки нагрузки по ролям."}
            </p>
          </DetailBlock>

          <DetailBlock title="Ёмкость и буфер">
            <p className="whitespace-pre-wrap break-words text-sm text-ink2 [overflow-wrap:anywhere]">{summary.capacity_assessment}</p>
          </DetailBlock>

          <DetailBlock title="Delivery сейчас">
            <p className="whitespace-pre-wrap break-words text-sm text-ink2 [overflow-wrap:anywhere]">{summary.delivery_snapshot}</p>
          </DetailBlock>

          <div className="grid gap-4 md:grid-cols-2">
            <DetailBlock title="Очередь разработки">
              <p className="whitespace-pre-wrap break-words text-sm text-ink2 [overflow-wrap:anywhere]">{summary.queue_insights.todo}</p>
            </DetailBlock>
            <DetailBlock title="Очередь тестирования">
              <p className="whitespace-pre-wrap break-words text-sm text-ink2 [overflow-wrap:anywhere]">{summary.queue_insights.test}</p>
            </DetailBlock>
          </div>

          {summary.scope_risks.length > 0 ? (
            <DetailBlock title="Риски scope">
              <NumberedList items={summary.scope_risks} />
            </DetailBlock>
          ) : null}

          {summary.watch_list.length > 0 ? (
            <DetailBlock title="На что смотреть">
              <NumberedList items={summary.watch_list} />
            </DetailBlock>
          ) : null}
        </div>
      </details>
    </AiIntelligenceSurface>
  );
}

function roleCoverageGap(metrics: ScopeBoardMetrics, field: "unattributed" | "unresolved_no_gitlab_link"): number {
  const maps = [metrics.plan_role_coverage, metrics.unplan_role_coverage];
  return maps.reduce((total, map) => {
    if (!map) return total;
    return total + (["front", "back", "qa"] as const).reduce(
      (sum, role) => sum + Math.max(0, map[role]?.[field] ?? 0),
      0
    );
  }, 0);
}

function buildDataRisks(metrics: ScopeBoardMetrics): string[] {
  const risks: string[] = [];
  const roleGaps = roleCoverageGap(metrics, "unattributed");
  const gitlabGaps = roleCoverageGap(metrics, "unresolved_no_gitlab_link");

  if (metrics.unestimated_count > 0) {
    risks.push(`${metrics.unestimated_count} задач без SP — capacity и буфер могут быть занижены.`);
  }
  if (roleGaps > 0) {
    risks.push(`${roleGaps} разрывов атрибуции ролей — нагрузка Front/Back/QA неполная.`);
  }
  if (metrics.scope_creep_count > 0) {
    risks.push(`${metrics.scope_creep_count} задач добавлены после плана.`);
  }
  if (gitlabGaps > 0) {
    risks.push(`GitLab evidence не найден для ${gitlabGaps} role-сигналов.`);
  }

  return risks;
}

function RoleCoverageKpi({
  label,
  coverage,
  unplan,
}: {
  label: string;
  coverage?: { attributed: number; total: number; unattributed?: number };
  unplan?: { attributed: number; total: number; unattributed?: number };
}) {
  if (!coverage) return null;
  const planLabel = coverage.total > 0 ? `${coverage.attributed}/${coverage.total}` : "—";
  const unplanLabel = unplan && unplan.total > 0 ? `${unplan.attributed}/${unplan.total}` : "—";
  const gap = (coverage.unattributed ?? 0) + (unplan?.unattributed ?? 0);
  return (
    <div className="rounded-lg border border-line bg-bg px-3 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-ink3">{label}</p>
      <p className="mt-1 text-sm font-semibold text-ink">
        Plan {planLabel} · Unplan {unplanLabel}
      </p>
      <p className="mt-1 text-xs text-ink3">{gap > 0 ? `${gap} без атрибуции` : "Атрибуция полная"}</p>
    </div>
  );
}

function KpiCard({
  label,
  value,
  meta,
  tone,
}: {
  label: string;
  value: string;
  meta: string;
  tone: "success" | "warning" | "danger" | "info" | "neutral";
}) {
  const toneClass =
    tone === "success"
      ? "border-green/25 bg-green/[0.06]"
      : tone === "warning"
        ? "border-amber/25 bg-amber/[0.06]"
        : tone === "danger"
          ? "border-red/25 bg-red/[0.06]"
          : tone === "info"
            ? "border-blue/25 bg-blue/[0.06]"
            : "border-line bg-surface";

  return (
    <div className={cn("rounded-lg border px-3 py-3", toneClass)}>
      <p className="text-xs font-medium uppercase tracking-wide text-ink3">{label}</p>
      <p className="mt-1 text-xl font-bold text-ink">{value}</p>
      <p className="mt-1 text-xs text-ink3">{meta}</p>
    </div>
  );
}

function SignalCard({
  tone,
  title,
  items,
  emptyText,
}: {
  tone: "good" | "bad" | "critical";
  title: string;
  items: string[];
  emptyText: string;
}) {
  const toneClass =
    tone === "good"
      ? "border-green/25 bg-green/[0.06]"
      : tone === "bad"
        ? "border-amber/25 bg-amber/[0.06]"
        : "border-red/25 bg-red/[0.06]";

  return (
    <div className={cn("rounded-lg border px-3 py-3", toneClass)}>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-ink3">{title}</h4>
      {items.length > 0 ? (
        <ol className="mt-2 space-y-2">
          {items.map((item, index) => (
            <li key={index} className="flex gap-2 text-sm text-ink2">
              <span className="font-semibold text-ink3">{index + 1}.</span>
              <span className="min-w-0 break-words [overflow-wrap:anywhere]">{item}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-2 text-sm text-ink3">{emptyText}</p>
      )}
    </div>
  );
}

function DetailBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h5 className="text-xs font-semibold uppercase tracking-wide text-ink3">{title}</h5>
      {children}
    </div>
  );
}

function NumberedList({ items }: { items: string[] }) {
  return (
    <ol className="space-y-1">
      {items.map((item, index) => (
        <li key={index} className="flex gap-2 text-sm text-ink2">
          <span className="font-semibold text-ink3">{index + 1}.</span>
          <span className="min-w-0 break-words [overflow-wrap:anywhere]">{item}</span>
        </li>
      ))}
    </ol>
  );
}

function formatAiTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export { formatAiTime, HEALTH_LABELS, HEALTH_TONE };
