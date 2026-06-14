import { Badge, Surface } from "../../../design-system";
import type { ScopeBoardMetrics } from "../api/cmsClient";
import { formatScopeSp, intakeStatusMeta } from "./scopeBoardHelpers";
import { buildCapacityVisual, donutArcs } from "./scopeBoardVisuals";

export function ScopeVisualDashboard({ metrics }: { metrics: ScopeBoardMetrics }) {
  const intake = intakeStatusMeta(metrics.intake_status, metrics);
  const visual = buildCapacityVisual(metrics);
  const arcs = donutArcs(visual.segments);

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

          <div className="grid grid-cols-3 gap-2 text-center">
            <MetricChip label="Плановый" value={formatScopeSp(metrics.plan_sp)} meta={`${metrics.plan_count}`} tone="info" />
            <MetricChip label="Внеплановый" value={formatScopeSp(metrics.unplan_sp)} meta={`${metrics.unplan_count}`} tone="warning" />
            <MetricChip
              label="Capacity"
              value={formatScopeSp(metrics.capacity_sp)}
              meta={metrics.unestimated_count > 0 ? `⚠ ${metrics.unestimated_count}` : "SP"}
              tone="neutral"
            />
          </div>

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
