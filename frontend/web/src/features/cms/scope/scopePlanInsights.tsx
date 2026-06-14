import { Badge, Surface } from "../../../design-system";
import type { ScopeBoardIssue, ScopeBoardMetrics } from "../api/cmsClient";

export function planChangeReasonLabel(issue: ScopeBoardIssue): string {
  const reasons = issue.plan_change_reasons?.filter(Boolean) ?? [];
  if (reasons.length > 0) {
    return reasons.join(", ");
  }
  return issue.plan_change_reason?.trim() ?? "";
}

export function PlanFieldBadges({ issue }: { issue: ScopeBoardIssue }) {
  const planStatus = issue.plan_status?.trim();
  const changeReason = planChangeReasonLabel(issue);
  if (!planStatus && !changeReason) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {planStatus ? <Badge tone="info">Plan status: {planStatus}</Badge> : null}
      {changeReason ? <Badge tone="warning">Plan change: {changeReason}</Badge> : null}
    </div>
  );
}

export const PLAN_INSIGHT_COLORS = [
  "#3b82f6",
  "#f59e0b",
  "#10b981",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#f97316",
  "#64748b",
] as const;

export function sortedCountEntries(counts: Record<string, number> | undefined): Array<[string, number]> {
  if (!counts) return [];
  return Object.entries(counts).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "ru"));
}

export function CountBarChart({
  title,
  subtitle,
  counts,
  emptyLabel,
}: {
  title: string;
  subtitle?: string;
  counts: Record<string, number> | undefined;
  emptyLabel: string;
}) {
  const entries = sortedCountEntries(counts);
  const max = entries[0]?.[1] ?? 0;

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        {subtitle ? <p className="mt-0.5 text-xs text-ink3">{subtitle}</p> : null}
      </div>
      {entries.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line bg-bg px-3 py-4 text-sm text-ink3">{emptyLabel}</p>
      ) : (
        <ul className="space-y-2">
          {entries.map(([label, count], index) => {
            const width = max > 0 ? Math.max(8, Math.round((count / max) * 100)) : 0;
            const color = PLAN_INSIGHT_COLORS[index % PLAN_INSIGHT_COLORS.length];
            return (
              <li key={label} className="space-y-1">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="min-w-0 break-words font-medium text-ink2 [overflow-wrap:anywhere]">{label}</span>
                  <span className="shrink-0 tabular-nums text-ink3">{count}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-line2">
                  <div className="h-full rounded-full transition-all" style={{ width: `${width}%`, backgroundColor: color }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function ScopePlanInsights({ metrics }: { metrics: ScopeBoardMetrics }) {
  const reasonCounts = metrics.plan_change_reason_counts ?? {};
  const statusCounts = metrics.plan_status_counts ?? {};
  const hasReasons = Object.keys(reasonCounts).length > 0;
  const hasStatuses = Object.keys(statusCounts).length > 0;

  if (!hasReasons && !hasStatuses) {
    return null;
  }

  return (
    <Surface className="p-4 sm:p-5">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-ink">Plan status и Plan change reason</h2>
        <p className="mt-1 text-xs text-ink3">
          Сводка по Jira-полям scope: каких plan status и причин изменения плана больше в текущем snapshot.
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <CountBarChart
          title="Plan change reason"
          subtitle="Чем чаще меняли план — тем длиннее полоска"
          counts={reasonCounts}
          emptyLabel="Нет заполненных Plan change reason в задачах snapshot."
        />
        <CountBarChart
          title="Plan status"
          subtitle="Распределение plan status по всем задачам board"
          counts={statusCounts}
          emptyLabel="Нет заполненного Plan status в задачах snapshot."
        />
      </div>
    </Surface>
  );
}
