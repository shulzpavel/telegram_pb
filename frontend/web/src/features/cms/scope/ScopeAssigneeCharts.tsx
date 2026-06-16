import { useMemo, useState } from "react";
import { Badge, Button, Surface } from "../../../design-system";
import type {
  ScopeBoardMetrics,
  ScopeDeveloperBreakdown,
  ScopeRoleBreakdownMap,
  ScopeRoleCoverageMap,
} from "../api/cmsClient";
import { formatScopeSp } from "./scopeBoardHelpers";
import { RoleContributorsLines } from "./scopeRoleContributors";
import {
  buildDeveloperDonutSegments,
  developerDonutCenter,
  donutArcs,
  type DonutSegment,
} from "./scopeBoardVisuals";

type ChartMode = "sp" | "tasks";
type RoleKey = "front" | "back" | "qa";

const ROLE_META: Record<
  RoleKey,
  { label: string; accent: "info" | "warning" | "neutral"; description: string }
> = {
  front: {
    label: "Front",
    accent: "neutral",
    description: "Front по GitLab API (MR/commit), затем Jira-комментарии igaming; оценка — developer из changelog.",
  },
  back: {
    label: "Back",
    accent: "info",
    description: "Back по GitLab API (MR/commit), затем Jira-комментарии igaming; оценка — developer из changelog.",
  },
  qa: {
    label: "QA",
    accent: "warning",
    description: "Assignee при переходе в test-статус; при отсутствии — комментарии с признаками тестирования.",
  },
};

export function ScopeAssigneeCharts({ metrics }: { metrics: ScopeBoardMetrics }) {
  const [role, setRole] = useState<RoleKey>("front");
  const planByRole = metrics.plan_by_role;
  const unplanByRole = metrics.unplan_by_role;
  const hasData = hasRoleBreakdown(planByRole) || hasRoleBreakdown(unplanByRole);

  if (!hasData) {
    return null;
  }

  const roleMeta = ROLE_META[role];
  const roleSummary = summarizeRoleWorkload(metrics, role);

  return (
    <Surface className="scope-collapsible-card overflow-hidden border-0 bg-surface/80 p-0">
      <details className="group">
        <summary className="scope-section-header flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 marker:content-none sm:px-5">
          <div>
            <h2 className="text-base font-semibold text-ink">Нагрузка по ролям</h2>
            <p className="scope-section-header-subtitle mt-1 text-sm">Ролевой срез plan/unplan по Front, Back и QA</p>
          </div>
          <span className="scope-section-header-icon inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-transform group-open:rotate-180">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
              <path d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06z" />
            </svg>
          </span>
        </summary>

        <div className="space-y-5 p-4 sm:p-6 lg:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className="text-sm leading-relaxed text-ink3">
            Это ролевой срез, а не сумма capacity: одна Jira-задача может одновременно попасть во Front, Back и QA.
            SP роли = полный SP задачи, если роль участвовала; роли между собой не складываются.
            </p>
          </div>
          <div className="inline-flex rounded-xl bg-line2/60 p-1">
            {(Object.keys(ROLE_META) as RoleKey[]).map((key) => (
              <Button
                key={key}
                type="button"
                size="sm"
                variant={role === key ? "secondary" : "ghost"}
                className="min-h-8 px-3 text-xs"
                onClick={() => setRole(key)}
              >
                {ROLE_META[key].label}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid auto-rows-fr gap-3 sm:grid-cols-3">
          <SummaryChip label="Scope всего" value={`${formatScopeSp(roleSummary.scopeSp)} SP`} meta={taskCountLabel(roleSummary.scopeCount)} />
          <SummaryChip label={roleMeta.label} value={`${formatScopeSp(roleSummary.roleSp)} SP`} meta={taskCountLabel(roleSummary.roleCount)} tone="accent" />
          <SummaryChip label="Без роли" value={taskCountLabel(roleSummary.unattributedCount)} meta="требует атрибуции" tone={roleSummary.unattributedCount > 0 ? "warning" : "neutral"} />
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.55fr)]">
          <p className="rounded-2xl bg-amber/[0.07] px-4 py-3 text-sm leading-relaxed text-ink2">
            «Выполнено» наверху показывает полный SP всех задач в статусе «Готово». Здесь показан только выбранный
            ролевой срез, поэтому {roleMeta.label} {formatScopeSp(roleSummary.roleSp)} SP не обязан равняться scope{" "}
            {formatScopeSp(roleSummary.scopeSp)} SP.
          </p>
          <p className="rounded-2xl bg-line2/40 px-4 py-3 text-sm leading-relaxed text-ink3">{roleMeta.description}</p>
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <RoleDonutCard
            title={`Плановые задачи роли ${roleMeta.label}`}
            rows={planByRole?.[role] ?? []}
            coverage={metrics.plan_role_coverage?.[role]}
            accent={roleMeta.accent}
            role={role}
          />
          <RoleDonutCard
            title={`Внеплановые задачи роли ${roleMeta.label}`}
            rows={unplanByRole?.[role] ?? []}
            coverage={metrics.unplan_role_coverage?.[role]}
            accent={roleMeta.accent}
            role={role}
          />
        </div>
        </div>
      </details>
    </Surface>
  );
}

export function summarizeRoleWorkload(metrics: ScopeBoardMetrics, role: RoleKey) {
  const planRows = metrics.plan_by_role?.[role] ?? [];
  const unplanRows = metrics.unplan_by_role?.[role] ?? [];
  const planCoverage = metrics.plan_role_coverage?.[role];
  const unplanCoverage = metrics.unplan_role_coverage?.[role];
  return {
    scopeSp: Math.max(0, metrics.plan_sp) + Math.max(0, metrics.unplan_sp),
    scopeCount: metrics.plan_count + metrics.unplan_count,
    roleSp: sumRoleSp(planRows) + sumRoleSp(unplanRows),
    roleCount: sumRoleCount(planRows) + sumRoleCount(unplanRows),
    unattributedCount: (planCoverage?.unattributed ?? 0) + (unplanCoverage?.unattributed ?? 0),
  };
}

function sumRoleSp(rows: ScopeDeveloperBreakdown[]): number {
  return rows.reduce((sum, row) => sum + Math.max(0, row.story_points), 0);
}

function sumRoleCount(rows: ScopeDeveloperBreakdown[]): number {
  return rows.reduce((sum, row) => sum + Math.max(0, row.count), 0);
}

function SummaryChip({
  label,
  value,
  meta,
  tone = "neutral",
}: {
  label: string;
  value: string;
  meta: string;
  tone?: "neutral" | "accent" | "warning";
}) {
  const valueClass = tone === "accent" ? "text-blue" : tone === "warning" ? "text-amber" : "text-ink";
  return (
    <div className="flex min-h-28 flex-col justify-center rounded-2xl bg-bg/70 px-4 py-4">
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink3">{label}</p>
        {tone === "warning" ? <Badge tone="warning">важно</Badge> : null}
      </div>
      <p className={`text-2xl font-bold ${valueClass}`}>{value}</p>
      <p className="mt-1 text-sm text-ink3">{meta}</p>
    </div>
  );
}

function formatCoverageLabel(coverage?: ScopeRoleCoverageMap[RoleKey], role?: RoleKey): string | null {
  if (!coverage || coverage.total <= 0) return null;
  const parts = [`${coverage.attributed} из ${coverage.total} с атрибуцией`];
  const tiers: string[] = [];
  if (role && role !== "qa" && coverage.confirmed_gitlab != null && coverage.confirmed_gitlab > 0) {
    tiers.push(`${coverage.confirmed_gitlab} GitLab`);
  }
  if (role === "qa" && coverage.confirmed_jira_qa != null && coverage.confirmed_jira_qa > 0) {
    tiers.push(`${coverage.confirmed_jira_qa} Jira QA`);
  }
  if (coverage.confirmed != null && coverage.confirmed > 0 && role === "qa") {
    tiers.push(`${coverage.confirmed} подтв.`);
  }
  if (coverage.estimated != null && coverage.estimated > 0) {
    tiers.push(`${coverage.estimated} оценка`);
  }
  if (coverage.unresolved_no_gitlab_link != null && coverage.unresolved_no_gitlab_link > 0) {
    tiers.push(`${coverage.unresolved_no_gitlab_link} без GitLab`);
  }
  if (coverage.unresolved_ambiguous_role != null && coverage.unresolved_ambiguous_role > 0) {
    tiers.push(`${coverage.unresolved_ambiguous_role} конфликт ролей`);
  }
  if (coverage.unresolved_no_qa_transition != null && coverage.unresolved_no_qa_transition > 0) {
    tiers.push(`${coverage.unresolved_no_qa_transition} без QA`);
  }
  if (coverage.unattributed != null && coverage.unattributed > 0 && tiers.length === 0) {
    tiers.push(`${coverage.unattributed} без атрибуции`);
  }
  if (tiers.length > 0) {
    parts.push(`(${tiers.join(" · ")})`);
  }
  return parts.join(" ");
}

function formatRoleSp(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "— SP";
  }
  return `${formatScopeSp(value)} SP`;
}

function taskCountLabel(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} задача`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} задачи`;
  return `${count} задач`;
}

function RoleDonutCard({
  title,
  rows,
  coverage,
  accent,
  role,
}: {
  title: string;
  rows: ScopeDeveloperBreakdown[];
  coverage?: ScopeRoleCoverageMap[RoleKey];
  accent: "info" | "warning" | "neutral";
  role: RoleKey;
}) {
  const [mode, setMode] = useState<ChartMode>("sp");
  const segments = useMemo(() => buildDeveloperDonutSegments(rows, mode), [rows, mode]);
  const arcs = useMemo(() => donutArcs(segments), [segments]);
  const center = useMemo(() => developerDonutCenter(rows, mode), [rows, mode]);
  const accentClass = accent === "info" ? "text-blue" : accent === "warning" ? "text-amber" : "text-ink";
  const coverageLabel = formatCoverageLabel(coverage, role);

  return (
    <div className="rounded-2xl bg-bg/70 p-4 sm:p-5">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className={`text-base font-semibold ${accentClass}`}>{title}</h3>
          <p className="mt-1 text-sm text-ink3">{rows.length} исполнителей</p>
          {coverageLabel ? <p className="mt-1 max-w-xl text-sm leading-relaxed text-ink3">{coverageLabel}</p> : null}
        </div>
        <div className="inline-flex rounded-xl bg-line2/60 p-1">
          <ModeButton active={mode === "sp"} onClick={() => setMode("sp")}>
            SP
          </ModeButton>
          <ModeButton active={mode === "tasks"} onClick={() => setMode("tasks")}>
            Задачи
          </ModeButton>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-2xl bg-line2/40 px-3 py-8 text-center text-sm text-ink3">
          Нет задач с атрибуцией для этой роли.
        </p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,180px)_minmax(0,1fr)] lg:items-start">
          <div className="mx-auto flex flex-col items-center gap-2">
            <div className="relative h-44 w-44 lg:h-48 lg:w-48">
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
                <p className="text-3xl font-bold text-ink">{center.value}</p>
                <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-ink3">{center.label}</p>
              </div>
            </div>
          </div>
          <RoleLegend rows={rows} segments={segments} mode={mode} />
        </div>
      )}
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? "secondary" : "ghost"}
      className="min-h-8 px-3 text-xs"
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function RoleLegend({
  rows,
  segments,
  mode,
}: {
  rows: ScopeDeveloperBreakdown[];
  segments: DonutSegment[];
  mode: ChartMode;
}) {
  const total =
    mode === "sp"
      ? rows.reduce((sum, row) => sum + Math.max(0, row.story_points), 0)
      : rows.reduce((sum, row) => sum + row.count, 0);

  return (
    <ul className="space-y-3">
      {rows.map((row) => {
        const segment = segments.find((item) => item.key === row.developer);
        const sliceValue = mode === "sp" ? Math.max(0, row.story_points) : row.count;
        const percent = total > 0 ? Math.round((sliceValue / total) * 100) : 0;
        return (
          <li key={row.developer} className="rounded-2xl bg-surface/80">
            <details className="group overflow-hidden rounded-2xl">
              <summary className="flex cursor-pointer list-none items-start gap-3 px-3 py-3 marker:content-none">
                <span
                  className="mt-1 h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: segment?.color ?? "#94a3b8" }}
                />
                <div className="min-w-0 flex-1 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 break-words font-medium text-ink2 [overflow-wrap:anywhere]">{row.developer}</span>
                    <span className="shrink-0 rounded-full bg-line2/70 px-2 py-0.5 text-xs tabular-nums text-ink3">{percent}%</span>
                  </div>
                  <p className="mt-1 text-xs text-ink3">
                    {formatRoleSp(row.story_points)} · {taskCountLabel(row.count)}
                  </p>
                </div>
              </summary>
              <ul className="space-y-2 px-3 pb-3">
                {row.issues.map((task) => (
                  <li key={task.key} className="rounded-xl bg-bg/80 px-3 py-3 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      {task.url ? (
                        <a href={task.url} target="_blank" rel="noreferrer" className="font-medium text-accent hover:underline">
                          {task.key}
                        </a>
                      ) : (
                        <span className="font-medium text-ink">{task.key}</span>
                      )}
                      <span className="text-ink3">{formatRoleSp(task.story_points ?? null)}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-ink2">{task.summary}</p>
                    <div className="mt-1.5">
                      <RoleContributorsLines issue={task} />
                    </div>
                    {task.role_unresolved && Object.keys(task.role_unresolved).length > 0 ? (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-ink3">Почему нет атрибуции</summary>
                        <p className="mt-1 text-ink3">
                          {Object.entries(task.role_unresolved)
                            .map(([roleKey, reason]) => `${roleKey}: ${reason}`)
                            .join("; ")}
                        </p>
                      </details>
                    ) : null}
                    {task.assignee ? <p className="mt-1 text-ink3">Текущий assignee: {task.assignee}</p> : null}
                  </li>
                ))}
              </ul>
            </details>
          </li>
        );
      })}
    </ul>
  );
}

export function hasRoleBreakdown(map: ScopeRoleBreakdownMap | undefined): boolean {
  if (!map) return false;
  return (["front", "back", "qa"] as RoleKey[]).some((role) => (map[role]?.length ?? 0) > 0);
}
