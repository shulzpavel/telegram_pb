import { useMemo } from "react";
import { Badge, cn } from "../../../design-system";
import { normalizeAiHistory } from "./scopeAiHistory";
import { ScopeAiView, formatAiTime, HEALTH_LABELS, HEALTH_TONE } from "./ScopeAiView";
import type { ScopeAiHistoryEntry, ScopeAiSummary } from "./scopeAiTypes";
import type { ScopeBoardMetrics } from "../api/cmsClient";

export function ScopeAiPanel({
  summary,
  history,
  selectedHistoryId,
  onSelectHistory,
  metrics,
  openQuestionsCount = 0,
}: {
  summary: ScopeAiSummary | null;
  history: ScopeAiHistoryEntry[];
  selectedHistoryId: string | null;
  onSelectHistory: (id: string | null) => void;
  metrics?: ScopeBoardMetrics | null;
  openQuestionsCount?: number;
}) {
  const entries = useMemo(() => normalizeAiHistory(summary, history), [summary, history]);

  const activeEntry = useMemo(() => {
    if (entries.length === 0) return null;
    if (selectedHistoryId) {
      return entries.find((entry) => entry.id === selectedHistoryId) ?? entries[0];
    }
    return entries[0];
  }, [entries, selectedHistoryId]);

  if (!activeEntry) return null;

  const isHistorical = Boolean(selectedHistoryId && selectedHistoryId !== entries[0]?.id);
  const generatedLabel = formatAiTime(activeEntry.generated_at);
  const snapshotLabel = formatAiTime(activeEntry.snapshot_refreshed_at);

  return (
    <details className="group rounded-lg border border-line bg-surface">
      <summary className="cursor-pointer list-none px-4 py-3 marker:content-none sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-ink">AI-сводка для бизнеса</span>
            <Badge tone={HEALTH_TONE[activeEntry.health]}>{HEALTH_LABELS[activeEntry.health]}</Badge>
            {generatedLabel ? <span className="text-xs text-ink3">{generatedLabel}</span> : null}
          </div>
          <span className="text-xs font-medium text-ink3 scope-print-hide">
            <span className="group-open:hidden">Показать</span>
            <span className="hidden group-open:inline">Скрыть</span>
          </span>
        </div>
      </summary>

      <div className="border-t border-line p-4 sm:p-5">
        <div className="scope-ai-panel-grid grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
            <ScopeAiView
              key={activeEntry.id}
              summary={activeEntry.analysis}
              generatedLabel={generatedLabel}
              snapshotLabel={snapshotLabel}
              isHistorical={isHistorical}
              metrics={metrics}
              openQuestionsCount={openQuestionsCount}
            />

            {entries.length > 1 ? (
              <aside className="scope-ai-history-aside rounded-lg border border-line bg-surface p-3 xl:sticky xl:top-4 xl:self-start">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-ink">История AI</h4>
                  <span className="text-xs text-ink3">{entries.length}</span>
                </div>

                <ol className="max-h-[min(70vh,520px)] space-y-2 overflow-y-auto pr-1">
                  {entries.map((entry) => {
                    const isActive = selectedHistoryId
                      ? entry.id === selectedHistoryId
                      : entry.id === entries[0]?.id;
                    const when = formatAiTime(entry.generated_at) ?? "—";
                    const preview = entry.summary.trim() || entry.analysis.summary;

                    return (
                      <li key={entry.id}>
                        <button
                          type="button"
                          onClick={() => onSelectHistory(entry.id === entries[0]?.id ? null : entry.id)}
                          className={cn(
                            "w-full rounded-lg border px-3 py-2 text-left transition-colors",
                            isActive
                              ? "border-blue/30 bg-blue/[0.08]"
                              : "border-line bg-bg hover:border-line2 hover:bg-line2/40"
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium text-ink3">{when}</span>
                            <Badge tone={HEALTH_TONE[entry.health]}>{HEALTH_LABELS[entry.health]}</Badge>
                          </div>
                          <p className="mt-1 line-clamp-3 text-sm text-ink2">{preview}</p>
                          {entry.snapshot_refreshed_at ? (
                            <p className="mt-1 text-[11px] text-ink3">Snapshot: {formatAiTime(entry.snapshot_refreshed_at)}</p>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </aside>
            ) : null}
        </div>
      </div>
    </details>
  );
}
