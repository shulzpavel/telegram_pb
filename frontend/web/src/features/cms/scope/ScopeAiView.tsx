import { AiIntelligenceSurface, Badge, cn } from "../../../design-system";
import type { ScopeBoardMetrics, ScopeWorkloadMode } from "../api/cmsClient";
import { formatScopeSp, intakeStatusMeta } from "./scopeBoardHelpers";
import { DEFAULT_SCOPE_WORKLOAD_MODE } from "./WorkloadModePicker";
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
  green: "Месяц идёт по плану — критичных сигналов нет.",
  yellow: "Есть зоны риска — нужны решения в ближайшие дни.",
  red: "Требуется срочное внимание руководства и PO.",
};

const BUFFER_LABELS: Record<ScopeAiSummary["buffer_status"], string> = {
  ok: "Запас есть",
  tight: "Запас почти исчерпан",
  critical: "На грани",
  overfilled: "Перегруз",
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

export function ScopeAiView({
  summary,
  generatedLabel,
  snapshotLabel,
  isHistorical = false,
  metrics,
  workloadMode = DEFAULT_SCOPE_WORKLOAD_MODE,
  openQuestionsCount = 0,
}: {
  summary: ScopeAiSummary;
  generatedLabel?: string | null;
  snapshotLabel?: string | null;
  isHistorical?: boolean;
  metrics?: ScopeBoardMetrics | null;
  workloadMode?: ScopeWorkloadMode;
  openQuestionsCount?: number;
}) {
  const splitMode = workloadMode === "sp_dev_test";
  const whatsGood = summary.whats_good ?? [];
  const whatsBad = summary.whats_bad ?? [];
  const whatsCritical = summary.whats_critical ?? [];
  const intake = metrics ? intakeStatusMeta(metrics.intake_status, metrics, splitMode) : null;
  const attentionItems = [
    ...whatsCritical.map((item) => ({ kind: "critical" as const, text: item })),
    ...(summary.blockers ?? []).map((blocker) => ({
      kind: "blocker" as const,
      text: blocker.title,
      detail: blocker.detail,
      severity: blocker.severity,
      keys: blocker.issue_keys,
    })),
  ];

  return (
    <AiIntelligenceSurface className="space-y-5 p-5 sm:p-6" sparkleLabel="AI-сводка для бизнеса">
      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-bold text-ink">Сводка для PO и руководства</h3>
              {isHistorical ? <Badge tone="neutral">из истории</Badge> : null}
              <Badge tone={HEALTH_TONE[summary.health]}>{HEALTH_LABELS[summary.health]}</Badge>
            </div>
            <p className="max-w-3xl text-sm text-ink2">{HEALTH_HINT[summary.health]}</p>
            {generatedLabel || snapshotLabel ? (
              <p className="text-xs text-ink3">
                {generatedLabel ? <>Сводка: {generatedLabel}</> : null}
                {generatedLabel && snapshotLabel ? " · " : null}
                {snapshotLabel ? <>Данные Jira: {snapshotLabel}</> : null}
              </p>
            ) : null}
          </div>
        </div>

        {metrics ? <BusinessKpiRow metrics={metrics} splitMode={splitMode} intake={intake} bufferStatus={summary.buffer_status} openQuestionsCount={openQuestionsCount} /> : null}
      </header>

      <section className="rounded-xl border border-line bg-surface px-4 py-4 sm:px-5">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-ink3">Главный вывод</h4>
        <p className="mt-2 text-base leading-relaxed text-ink">{summary.summary}</p>
      </section>

      {summary.recommendations.length > 0 ? (
        <section className="space-y-3">
          <div>
            <h4 className="text-sm font-semibold text-ink">Что сделать на этой неделе</h4>
            <p className="mt-1 text-xs text-ink3">Конкретные шаги — в порядке приоритета.</p>
          </div>
          <ol className="space-y-2">
            {summary.recommendations.map((rec, index) => (
              <li key={index} className="flex gap-3 rounded-lg border border-line bg-surface px-3 py-3 sm:px-4">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue/10 text-xs font-bold text-blue">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="text-sm leading-relaxed text-ink">{rec.text}</p>
                  <Badge tone={SEVERITY_TONE[rec.impact]}>Приоритет: {SEVERITY_LABEL[rec.impact]}</Badge>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {summary.focus_now.length > 0 ? (
        <section className="rounded-lg border border-blue/20 bg-blue/[0.05] px-4 py-4">
          <h4 className="text-sm font-semibold text-ink">Обсудить на ближайшей встрече</h4>
          <ol className="mt-3 space-y-2">
            {summary.focus_now.map((item, index) => (
              <li key={index} className="flex gap-3 text-sm text-ink2">
                <span className="font-semibold text-blue">{index + 1}.</span>
                <span className="min-w-0 break-words">{item}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {attentionItems.length > 0 ? (
        <section className="rounded-xl border border-red/20 bg-red/[0.04] px-4 py-4">
          <h4 className="text-sm font-semibold text-ink">Требует внимания</h4>
          <ul className="mt-3 space-y-2">
            {attentionItems.map((item, index) => (
              <li key={index} className="rounded-lg border border-line bg-surface px-3 py-3 text-sm text-ink2">
                {"detail" in item ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink">{item.text}</span>
                      <Badge tone={SEVERITY_TONE[item.severity]}>{SEVERITY_LABEL[item.severity]}</Badge>
                      {item.keys.length > 0 ? <span className="text-xs text-ink3">{item.keys.join(", ")}</span> : null}
                    </div>
                    {item.detail ? <p className="mt-1 text-ink3">{item.detail}</p> : null}
                  </>
                ) : (
                  <span>{item.text}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {(whatsBad.length > 0 || summary.capacity_assessment) ? (
        <section className="rounded-xl border border-amber/20 bg-amber/[0.04] px-4 py-4">
          <h4 className="text-sm font-semibold text-ink">На что обратить внимание</h4>
          {summary.capacity_assessment ? (
            <p className="mt-2 text-sm leading-relaxed text-ink2">{summary.capacity_assessment}</p>
          ) : null}
          {whatsBad.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {whatsBad.map((item, index) => (
                <li key={index} className="text-sm text-ink2">
                  {item}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <details className="rounded-lg border border-line bg-bg">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-ink marker:content-none">
          Дополнительный контекст
        </summary>
        <div className="space-y-4 border-t border-line px-4 py-4">
          {whatsGood.length > 0 ? (
            <DetailBlock title="Что идёт хорошо">
              <BulletList items={whatsGood} />
            </DetailBlock>
          ) : null}

          {summary.report_assessment ? (
            <DetailBlock title="Состояние задач">
              <p className="text-sm leading-relaxed text-ink2">{summary.report_assessment}</p>
            </DetailBlock>
          ) : null}

          {summary.open_questions_assessment ? (
            <DetailBlock title="Открытые вопросы">
              <p className="text-sm leading-relaxed text-ink2">{summary.open_questions_assessment}</p>
            </DetailBlock>
          ) : null}

          {summary.delivery_snapshot ? (
            <DetailBlock title="Поток delivery">
              <p className="text-sm leading-relaxed text-ink2">{summary.delivery_snapshot}</p>
            </DetailBlock>
          ) : null}

          {summary.role_workload_assessment ? (
            <DetailBlock title="Нагрузка по ролям">
              <p className="text-sm leading-relaxed text-ink2">{summary.role_workload_assessment}</p>
              {(summary.role_risks?.length ?? 0) > 0 ? (
                <div className="mt-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink3">Риски по ролям</p>
                  <BulletList items={summary.role_risks ?? []} />
                </div>
              ) : null}
            </DetailBlock>
          ) : null}

          {(summary.queue_insights.todo || summary.queue_insights.test) ? (
            <div className="grid gap-4 md:grid-cols-2">
              <DetailBlock title="Очередь разработки">
                <p className="text-sm leading-relaxed text-ink2">{summary.queue_insights.todo}</p>
              </DetailBlock>
              <DetailBlock title="Очередь тестирования">
                <p className="text-sm leading-relaxed text-ink2">{summary.queue_insights.test}</p>
              </DetailBlock>
            </div>
          ) : null}

          {summary.scope_risks.length > 0 ? (
            <DetailBlock title="Риски scope">
              <BulletList items={summary.scope_risks} />
            </DetailBlock>
          ) : null}

          {summary.watch_list.length > 0 ? (
            <DetailBlock title="Следить дальше">
              <BulletList items={summary.watch_list} />
            </DetailBlock>
          ) : null}
        </div>
      </details>
    </AiIntelligenceSurface>
  );
}

function BusinessKpiRow({
  metrics,
  splitMode,
  intake,
  bufferStatus,
  openQuestionsCount,
}: {
  metrics: ScopeBoardMetrics;
  splitMode: boolean;
  intake: ReturnType<typeof intakeStatusMeta> | null;
  bufferStatus: ScopeAiSummary["buffer_status"];
  openQuestionsCount: number;
}) {
  if (splitMode) {
    const devCapacity = metrics.capacity_sp_dev ?? metrics.capacity_sp;
    const testCapacity = metrics.capacity_sp_test ?? metrics.capacity_sp;
    const devBuffer = metrics.buffer_dev_sp ?? metrics.buffer_sp;
    const testBuffer = metrics.buffer_test_sp ?? metrics.buffer_sp;
    return (
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Запас разработки"
          value={`${formatScopeSp(devBuffer)} SP`}
          meta={`Лимит ${formatScopeSp(devCapacity)} SP`}
          tone={devBuffer <= 0 ? "danger" : devBuffer <= devCapacity * 0.2 ? "warning" : "success"}
        />
        <KpiCard
          label="Запас тестирования"
          value={`${formatScopeSp(testBuffer)} SP`}
          meta={`Лимит ${formatScopeSp(testCapacity)} SP`}
          tone={testBuffer <= 0 ? "danger" : testBuffer <= testCapacity * 0.2 ? "warning" : "success"}
        />
        <KpiCard
          label="Открытые вопросы"
          value={String(openQuestionsCount)}
          meta={openQuestionsCount > 0 ? "Нужно обсудить" : "Без блокеров"}
          tone={openQuestionsCount > 0 ? "warning" : "success"}
        />
        <KpiCard
          label="Новые задачи"
          value={intake?.label ?? "—"}
          meta={BUFFER_LABELS[bufferStatus]}
          tone={intake?.tone ?? "neutral"}
        />
      </div>
    );
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        label="Запас на новые задачи"
        value={`${formatScopeSp(metrics.buffer_sp)} SP`}
        meta={`Лимит месяца ${formatScopeSp(metrics.capacity_sp)} SP`}
        tone={metrics.buffer_sp <= 0 ? "danger" : metrics.intake_status === "warning" ? "warning" : "success"}
      />
      <KpiCard
        label="Загрузка месяца"
        value={`${formatScopeSp(metrics.plan_sp + metrics.unplan_sp)} SP`}
        meta={`План ${formatScopeSp(metrics.plan_sp)} · внеплан ${formatScopeSp(metrics.unplan_sp)}`}
        tone="info"
      />
      <KpiCard
        label="Открытые вопросы"
        value={String(openQuestionsCount)}
        meta={openQuestionsCount > 0 ? "Нужно обсудить" : "Без блокеров"}
        tone={openQuestionsCount > 0 ? "warning" : "success"}
      />
      <KpiCard
        label="Новые задачи"
        value={intake?.label ?? "—"}
        meta={BUFFER_LABELS[bufferStatus]}
        tone={intake?.tone ?? "neutral"}
      />
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

function DetailBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h5 className="text-xs font-semibold uppercase tracking-wide text-ink3">{title}</h5>
      {children}
    </div>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1">
      {items.map((item, index) => (
        <li key={index} className="text-sm text-ink2">
          {item}
        </li>
      ))}
    </ul>
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
