import { AiIntelligenceSurface, Badge } from "../design-system";
import type { AiTaskSummary } from "../hooks/useSession";

interface AiSummaryViewProps {
  summary: AiTaskSummary;
  /**
   * Short status caption rendered next to the "AI summary" badge.
   * Examples: "Подсказка уже видна участникам" on the cockpit,
   * "для оценки" on the voting page.
   */
  helperText?: string;
  /** Override the sparkle accessibility label (defaults to "AI summary"). */
  sparkleLabel?: string;
  className?: string;
}

/**
 * Single source of truth for the AI estimation hint card.
 *
 * Used by both the manager cockpit and the voting page so the spec they
 * see is byte-identical — same description, same methods bullets, same
 * SP dev/test/final breakdown, same assumptions list. Previously the
 * voter UI rendered a stripped-down version (description + methods +
 * complexity only) which silently diverged from the cockpit and confused
 * teams comparing notes between the two screens.
 *
 * Stays presentational on purpose: takes a fully-shaped ``AiTaskSummary``
 * and renders it. Nothing here fetches, generates, or mutates the AI
 * payload — that's done upstream by the LLM service.
 */
export default function AiSummaryView({
  summary,
  helperText,
  sparkleLabel = "AI summary",
  className = "p-4",
}: AiSummaryViewProps) {
  const hasStructuredSp =
    typeof summary.sp_dev === "number" &&
    typeof summary.sp_test === "number" &&
    typeof summary.sp_final === "number";

  return (
    <AiIntelligenceSurface className={className} sparkleLabel={sparkleLabel}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="info">AI summary</Badge>
        {helperText ? (
          <span className="text-xs text-ink3">{helperText}</span>
        ) : null}
      </div>
      <p className="mt-3 text-sm leading-6 text-ink2">{summary.description}</p>
      <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink3">Методы / зоны внимания</p>
          <ul className="mt-1 space-y-1 text-sm text-ink2">
            {summary.methods.map((method) => (
              <li key={method} className="flex gap-2">
                <span className="text-blue" aria-hidden="true">•</span>
                <span>{method}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink3">Оценка сложности от AI</p>
          <p className="mt-1 text-sm leading-6 text-ink2">{summary.complexity}</p>
        </div>
      </div>
      {hasStructuredSp ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg border border-line bg-surface px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink3">SP dev</p>
            <p className="mt-1 text-lg font-bold text-ink">{summary.sp_dev}</p>
          </div>
          <div className="rounded-lg border border-line bg-surface px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink3">SP test</p>
            <p className="mt-1 text-lg font-bold text-ink">{summary.sp_test}</p>
          </div>
          <div className="rounded-lg border border-blue/30 bg-blue/10 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink3">SP final</p>
            <p className="mt-1 text-lg font-bold text-blue">{summary.sp_final}</p>
            <p className="text-[11px] text-ink3">
              {summary.scale_label ?? "SP = max(SP dev, SP test)"}
            </p>
          </div>
        </div>
      ) : null}
      {summary.assumptions && summary.assumptions.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink3">Предположения / риски</p>
          <ul className="mt-1 space-y-1 text-sm text-ink2">
            {summary.assumptions.map((item) => (
              <li key={item} className="flex gap-2">
                <span className="text-blue" aria-hidden="true">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </AiIntelligenceSurface>
  );
}
