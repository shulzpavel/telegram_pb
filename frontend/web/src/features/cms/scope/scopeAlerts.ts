import type { ScopeBoardMetrics, ScopeWorkloadMode } from "../api/cmsClient";

export type ScopeAlertLevel = "critical" | "warning" | "recommendation";

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

export interface ScopeAlert {
  id: string;
  level: ScopeAlertLevel;
  title: string;
  description: string;
  count?: number;
}

const LEVEL_ORDER: ScopeAlertLevel[] = ["critical", "warning", "recommendation"];

export const SCOPE_ALERT_LEVEL_LABELS: Record<ScopeAlertLevel, string> = {
  critical: "Критический",
  warning: "Предупреждение",
  recommendation: "Рекомендация",
};

function isLowBuffer(buffer: number, capacity: number): boolean {
  return capacity > 0 && buffer > 0 && buffer <= capacity * 0.2;
}

function isBufferExhausted(buffer: number, overfill: number): boolean {
  return buffer <= 0 || overfill > 0;
}

export function buildScopeAlerts({
  metrics,
  workloadMode = "sp",
  dataQualityDetails,
  jiraFetchTruncated = 0,
}: {
  metrics: ScopeBoardMetrics;
  workloadMode?: ScopeWorkloadMode;
  dataQualityDetails?: ScopeDataQualityDetails | null;
  jiraFetchTruncated?: number;
}): ScopeAlert[] {
  const splitMode = workloadMode === "sp_dev_test";
  const alerts: ScopeAlert[] = [];

  if (splitMode) {
    const capacityDev = metrics.capacity_sp_dev ?? metrics.capacity_sp;
    const capacityTest = metrics.capacity_sp_test ?? metrics.capacity_sp;
    const bufferDev = metrics.buffer_dev_sp ?? 0;
    const bufferTest = metrics.buffer_test_sp ?? 0;
    const overfillDev = metrics.overfill_dev_sp ?? 0;
    const overfillTest = metrics.overfill_test_sp ?? 0;

    if (isBufferExhausted(bufferDev, overfillDev)) {
      alerts.push({
        id: "track_buffer_dev_exhausted",
        level: "critical",
        title: "Буфер SP Dev исчерпан",
        description: "План и внеплановый burn превышают capacity по разработке. Новый intake закрыт до согласования.",
      });
    } else if (isLowBuffer(bufferDev, capacityDev)) {
      alerts.push({
        id: "track_buffer_dev_low",
        level: "warning",
        title: "Буфер SP Dev меньше 20%",
        description: "Остаток capacity по разработке почти исчерпан. Новые задачи — только по согласованию.",
      });
    }

    if (isBufferExhausted(bufferTest, overfillTest)) {
      alerts.push({
        id: "track_buffer_test_exhausted",
        level: "critical",
        title: "Буфер SP Test исчерпан",
        description: "План и внеплановый burn превышают capacity по тестированию. Новый intake закрыт до согласования.",
      });
    } else if (isLowBuffer(bufferTest, capacityTest)) {
      alerts.push({
        id: "track_buffer_test_low",
        level: "warning",
        title: "Буфер SP Test меньше 20%",
        description: "Остаток capacity по тестированию почти исчерпан. Новые задачи — только по согласованию.",
      });
    }
  } else if (isBufferExhausted(metrics.buffer_sp, metrics.overfill_sp)) {
    alerts.push({
      id: "buffer_exhausted",
      level: "critical",
      title: "Буфер исчерпан",
      description: "План и внеплановый burn превышают capacity. Новый intake закрыт до согласования.",
    });
  } else if (isLowBuffer(metrics.buffer_sp, metrics.capacity_sp)) {
    alerts.push({
      id: "buffer_low",
      level: "warning",
      title: "Буфер меньше 20% capacity",
      description: "Остаток capacity почти исчерпан. Новые задачи — только по согласованию команды.",
    });
  }

  const unestimatedCount = splitMode
    ? (dataQualityDetails?.unestimated.length ?? metrics.unestimated_count)
    : metrics.unestimated_count;
  if (unestimatedCount > 0) {
    const onlyGeneralSpCount =
      dataQualityDetails?.unestimated.filter((issue) =>
        issue.reasons?.includes("указан только общий SP")
      ).length ?? 0;
    alerts.push({
      id: splitMode ? "missing_track_sp" : "missing_sp",
      level: "warning",
      title: splitMode ? "Задачи без SP Dev / Test" : "Задачи без SP",
      description: splitMode
        ? onlyGeneralSpCount > 0
          ? `${unestimatedCount} задач без оценки по трекам. У ${onlyGeneralSpCount} указан только общий SP — capacity по Dev/Test недостоверна.`
          : `${unestimatedCount} задач без SP Dev или SP Test — буфер по трекам считается неполно.`
        : `${unestimatedCount} активных задач без SP — capacity и буфер могут быть занижены.`,
      count: unestimatedCount,
    });
  }

  const roleIssueCount = dataQualityDetails?.roleIssues.length ?? 0;
  if (roleIssueCount > 0) {
    alerts.push({
      id: "role_attribution",
      level: "recommendation",
      title: "Не назначена роль",
      description: "Front/Back без атрибуции; QA — только для задач в тестировании.",
      count: roleIssueCount,
    });
  }

  if (metrics.scope_creep_count > 0) {
    alerts.push({
      id: "scope_creep",
      level: "recommendation",
      title: "Scope creep",
      description: "Задачи созданы после начала отчётного месяца — проверьте, что они учтены в плане.",
      count: metrics.scope_creep_count,
    });
  }

  if (jiraFetchTruncated > 0) {
    alerts.push({
      id: "jira_truncated",
      level: "recommendation",
      title: "Jira вернул неполный snapshot",
      description: `${jiraFetchTruncated} JQL-запросов обрезаны по лимиту — часть задач могла не попасть в отчёт.`,
      count: jiraFetchTruncated,
    });
  }

  return alerts;
}

export function groupScopeAlerts(alerts: ScopeAlert[]): Record<ScopeAlertLevel, ScopeAlert[]> {
  const grouped: Record<ScopeAlertLevel, ScopeAlert[]> = {
    critical: [],
    warning: [],
    recommendation: [],
  };
  for (const alert of alerts) {
    grouped[alert.level].push(alert);
  }
  return grouped;
}

export function ruCountLabel(count: number, forms: [string, string, string]): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} ${forms[0]}`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${count} ${forms[1]}`;
  return `${count} ${forms[2]}`;
}

export function scopeAlertCountLabel(level: ScopeAlertLevel, count: number): string {
  switch (level) {
    case "critical":
      return ruCountLabel(count, ["критическое", "критических", "критических"]);
    case "warning":
      return ruCountLabel(count, ["предупреждение", "предупреждения", "предупреждений"]);
    case "recommendation":
      return ruCountLabel(count, ["рекомендация", "рекомендации", "рекомендаций"]);
  }
}

export function scopeAlertsSummary(alerts: ScopeAlert[]): {
  critical: number;
  warning: number;
  recommendation: number;
  tone: "danger" | "warning" | "info" | "success";
  label: string;
} {
  const grouped = groupScopeAlerts(alerts);
  const critical = grouped.critical.length;
  const warning = grouped.warning.length;
  const recommendation = grouped.recommendation.length;

  if (critical > 0) {
    return {
      critical,
      warning,
      recommendation,
      tone: "danger",
      label: [
        critical > 0 ? scopeAlertCountLabel("critical", critical) : null,
        warning > 0 ? scopeAlertCountLabel("warning", warning) : null,
        recommendation > 0 ? scopeAlertCountLabel("recommendation", recommendation) : null,
      ]
        .filter(Boolean)
        .join(" · "),
    };
  }
  if (warning > 0) {
    return {
      critical,
      warning,
      recommendation,
      tone: "warning",
      label: [
        warning > 0 ? scopeAlertCountLabel("warning", warning) : null,
        recommendation > 0 ? scopeAlertCountLabel("recommendation", recommendation) : null,
      ]
        .filter(Boolean)
        .join(" · "),
    };
  }
  if (recommendation > 0) {
    return {
      critical,
      warning,
      recommendation,
      tone: "info",
      label: scopeAlertCountLabel("recommendation", recommendation),
    };
  }
  return {
    critical,
    warning,
    recommendation,
    tone: "success",
    label: "Без замечаний",
  };
}

export function alertsByLevel(alerts: ScopeAlert[], level: ScopeAlertLevel): ScopeAlert[] {
  return alerts.filter((alert) => alert.level === level);
}

export { LEVEL_ORDER as SCOPE_ALERT_LEVEL_ORDER };
