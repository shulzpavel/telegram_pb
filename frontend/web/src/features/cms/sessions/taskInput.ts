import type { CmsTaskBody } from "../api/cmsClient";

const JIRA_KEY_RE = /\b([A-Z][A-Z0-9]+-\d+)\b/;

export function normalizeOptionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeOptionalNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function parseBulkTasks(input: string, maxItems = 500): CmsTaskBody[] {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, maxItems)
    .map((line) => {
      const match = line.match(JIRA_KEY_RE);
      const jiraKey = match?.[1] ?? null;
      let summary = jiraKey ? line.replace(jiraKey, "").trim() : line;
      while (summary.startsWith("-") || summary.startsWith(":")) {
        summary = summary.slice(1).trim();
      }
      summary = summary || jiraKey || line;
      return {
        summary,
        jira_key: jiraKey,
        url: null,
        story_points: null,
      };
    });
}
