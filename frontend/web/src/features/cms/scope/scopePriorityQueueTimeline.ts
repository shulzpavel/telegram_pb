import type { ScopePriorityQueueHistoryEntry } from "../api/cmsClient";

export interface QueueIssueMilestone {
  at: string;
  statusName: string;
}

type QueueIssueLike = {
  key: string;
  status?: string;
  status_entered_at?: string | null;
  status_changed_at?: string | null;
};

/** Resolve when the issue entered the queue filter status (Jira milestone preferred). */
export function resolveQueueIssueMilestone(
  issue: QueueIssueLike,
  history: ScopePriorityQueueHistoryEntry[] = []
): QueueIssueMilestone {
  const statusName = issue.status || "";
  let at = issue.status_entered_at || issue.status_changed_at || "";

  for (const entry of history) {
    if (entry.type !== "appeared" || entry.issue_key !== issue.key || !entry.at) {
      continue;
    }
    if (!at || entry.at < at) {
      at = entry.at;
    }
  }

  return { at, statusName };
}

/** Latest grooming reorder event for a specific issue. */
export function lastReorderForIssue(
  history: ScopePriorityQueueHistoryEntry[],
  issueKey: string
): ScopePriorityQueueHistoryEntry | null {
  let latest: ScopePriorityQueueHistoryEntry | null = null;
  for (const entry of history) {
    if (entry.type !== "reorder" || entry.issue_key !== issueKey || !entry.at) {
      continue;
    }
    if (!latest || entry.at > latest.at) {
      latest = entry;
    }
  }
  return latest;
}

export function formatQueueTimelineDate(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" });
  } catch {
    return iso;
  }
}

export function formatQueueMilestoneLine(milestone: QueueIssueMilestone): string {
  const statusLabel = milestone.statusName ? `«${milestone.statusName}»` : "фильтре";
  if (milestone.at) {
    return `В ${statusLabel} с ${formatQueueTimelineDate(milestone.at)}`;
  }
  if (milestone.statusName) {
    return `В очереди в ${statusLabel} · дата перехода не найдена в Jira`;
  }
  return "В очереди · дата перехода не найдена в Jira";
}

export function formatReorderLine(entry: ScopePriorityQueueHistoryEntry): string {
  const parts = ["Порядок изменён", formatQueueTimelineDate(entry.at)];
  if (entry.from_index != null && entry.to_index != null) {
    parts.push(`${entry.from_index + 1} → ${entry.to_index + 1}`);
  }
  if (entry.by) {
    parts.push(entry.by);
  }
  return parts.join(" · ");
}
