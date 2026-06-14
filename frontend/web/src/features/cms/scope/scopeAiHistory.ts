import type { ScopeAiHistoryEntry, ScopeAiSummary } from "./scopeAiTypes";

function isScopeAiSummary(value: unknown): value is ScopeAiSummary {
  return Boolean(value && typeof value === "object" && "summary" in value && "health" in value);
}

/** Normalize API/legacy payloads so history entries are always clickable. */
export function normalizeAiHistory(
  summary: ScopeAiSummary | null,
  history: ScopeAiHistoryEntry[] | null | undefined
): ScopeAiHistoryEntry[] {
  const raw = Array.isArray(history) ? history : [];

  const normalized: ScopeAiHistoryEntry[] = [];

  for (const [index, entry] of raw.entries()) {
    const analysis = isScopeAiSummary(entry.analysis)
      ? entry.analysis
      : isScopeAiSummary(entry)
        ? (entry as unknown as ScopeAiSummary)
        : summary;

    if (!analysis) continue;

    normalized.push({
      id: entry.id || analysis.generated_at || `history-${index}`,
      generated_at: entry.generated_at || analysis.generated_at,
      snapshot_refreshed_at: entry.snapshot_refreshed_at ?? null,
      health: entry.health || analysis.health,
      summary: entry.summary?.trim() || analysis.summary,
      analysis,
    });
  }

  if (normalized.length > 0) return normalized;

  if (!summary) return [];

  return [
    {
      id: summary.generated_at || "latest",
      generated_at: summary.generated_at,
      snapshot_refreshed_at: null,
      health: summary.health,
      summary: summary.summary,
      analysis: summary,
    },
  ];
}
