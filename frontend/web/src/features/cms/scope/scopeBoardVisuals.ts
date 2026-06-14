import type { ScopeBoardMetrics } from "../api/cmsClient";
import { formatScopeSp } from "./scopeBoardHelpers";

export interface DonutSegment {
  key: string;
  label: string;
  value: number;
  color: string;
}

export interface CapacityVisualModel {
  mode: "sp" | "tasks";
  segments: DonutSegment[];
  centerValue: string;
  centerLabel: string;
  subtitle: string;
  loadPercent: number;
  loadLabel: string;
  committedLabel: string;
}

const SEGMENT_COLORS = {
  plan: "var(--color-blue, #3b82f6)",
  unplan: "var(--color-amber, #f59e0b)",
  buffer: "var(--color-emerald, #10b981)",
  overfill: "var(--color-red, #ef4444)",
} as const;

export function buildCapacityVisual(metrics: ScopeBoardMetrics): CapacityVisualModel {
  const capacity = Math.max(0, metrics.capacity_sp);
  const planSp = Math.max(0, metrics.plan_sp);
  const unplanSp = Math.max(0, metrics.unplan_sp);
  const overfill = Math.max(0, metrics.overfill_sp);
  const committedSp = planSp + unplanSp;
  const bufferSp = metrics.buffer_sp;
  const hasSp = committedSp > 0 || overfill > 0;

  if (hasSp) {
    const free = Math.max(0, bufferSp);
    const segments: DonutSegment[] = [];
    if (planSp > 0) segments.push({ key: "plan", label: "Плановый scope", value: planSp, color: SEGMENT_COLORS.plan });
    if (unplanSp > 0) segments.push({ key: "unplan", label: "Внеплановый scope", value: unplanSp, color: SEGMENT_COLORS.unplan });
    if (free > 0) segments.push({ key: "buffer", label: "Буфер", value: free, color: SEGMENT_COLORS.buffer });
    if (overfill > 0) segments.push({ key: "overfill", label: "Перегруз", value: overfill, color: SEGMENT_COLORS.overfill });

    const loadPercent = capacity > 0 ? Math.min(150, (committedSp / capacity) * 100) : 0;

    return {
      mode: "sp",
      segments: segments.length ? segments : [{ key: "empty", label: "Пусто", value: 1, color: "#94a3b8" }],
      centerValue: formatScopeSp(bufferSp),
      centerLabel: "Буфер",
      subtitle: `Capacity ${formatScopeSp(capacity)} SP`,
      loadPercent,
      loadLabel: `${Math.round(loadPercent)}%`,
      committedLabel: `${formatScopeSp(committedSp)} / ${formatScopeSp(capacity)} SP`,
    };
  }

  const planCount = metrics.plan_count;
  const unplanCount = metrics.unplan_count;
  const totalTasks = planCount + unplanCount;
  const segments: DonutSegment[] = [];
  if (planCount > 0) segments.push({ key: "plan", label: "Плановый scope", value: planCount, color: SEGMENT_COLORS.plan });
  if (unplanCount > 0) segments.push({ key: "unplan", label: "Внеплановый scope", value: unplanCount, color: SEGMENT_COLORS.unplan });

  return {
    mode: "tasks",
    segments: segments.length ? segments : [{ key: "empty", label: "Нет задач", value: 1, color: "#94a3b8" }],
    centerValue: String(totalTasks),
    centerLabel: "Задач",
    subtitle: "Story Points не заполнены в Jira",
    loadPercent: capacity > 0 ? 0 : Math.min(100, totalTasks),
    loadLabel: totalTasks > 0 ? `${planCount}+${unplanCount}` : "0",
    committedLabel: `${planCount} плановых · ${unplanCount} внеплановых`,
  };
}

export function donutArcs(
  segments: DonutSegment[],
  radius = 38
): Array<DonutSegment & { dasharray: string; dashoffset: number }> {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0) || 1;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return segments.map((segment) => {
    const length = (segment.value / total) * circumference;
    const entry = {
      ...segment,
      dasharray: `${length} ${circumference - length}`,
      dashoffset: -offset,
    };
    offset += length;
    return entry;
  });
}

export interface AssigneeBreakdownRow {
  assignee: string;
  story_points: number;
  count: number;
}

const ASSIGNEE_COLORS = [
  "#3b82f6",
  "#f59e0b",
  "#10b981",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#f97316",
  "#ec4899",
  "#64748b",
  "#84cc16",
] as const;

export function buildAssigneeDonutSegments(
  rows: AssigneeBreakdownRow[] | undefined,
  mode: "sp" | "tasks"
): DonutSegment[] {
  if (!rows?.length) {
    return [{ key: "empty", label: "Нет данных", value: 1, color: "#94a3b8" }];
  }

  const segments = rows
    .map((row, index) => {
      const value = mode === "sp" ? Math.max(0, row.story_points) : Math.max(0, row.count);
      return {
        key: row.assignee,
        label: row.assignee,
        value,
        color: ASSIGNEE_COLORS[index % ASSIGNEE_COLORS.length],
        row,
      };
    })
    .filter((segment) => segment.value > 0);

  if (segments.length === 0) {
    return [{ key: "empty", label: mode === "sp" ? "SP не указаны" : "Нет задач", value: 1, color: "#94a3b8" }];
  }

  return segments;
}

export function assigneeDonutCenter(
  rows: AssigneeBreakdownRow[] | undefined,
  mode: "sp" | "tasks"
): { value: string; label: string } {
  if (!rows?.length) {
    return { value: "0", label: mode === "sp" ? "SP" : "Задач" };
  }
  if (mode === "sp") {
    const total = rows.reduce((sum, row) => sum + Math.max(0, row.story_points), 0);
    return { value: formatScopeSp(total), label: "SP" };
  }
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  return { value: String(total), label: "Задач" };
}

export interface DeveloperBreakdownRow {
  developer: string;
  story_points: number;
  count: number;
}

export function buildDeveloperDonutSegments(
  rows: DeveloperBreakdownRow[] | undefined,
  mode: "sp" | "tasks"
): DonutSegment[] {
  return buildAssigneeDonutSegments(
    rows?.map((row) => ({
      assignee: row.developer,
      story_points: row.story_points,
      count: row.count,
    })),
    mode
  );
}

export function developerDonutCenter(
  rows: DeveloperBreakdownRow[] | undefined,
  mode: "sp" | "tasks"
): { value: string; label: string } {
  return assigneeDonutCenter(
    rows?.map((row) => ({
      assignee: row.developer,
      story_points: row.story_points,
      count: row.count,
    })),
    mode
  );
}
