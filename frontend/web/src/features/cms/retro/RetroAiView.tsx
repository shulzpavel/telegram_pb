import { AiIntelligenceSurface, Badge } from "../../../design-system";
import { MOOD_LABELS, type RetroAiSummary, type RetroSeverity } from "./retroLogic";

const SEVERITY_TONE: Record<RetroSeverity, "neutral" | "warning" | "danger"> = {
  low: "neutral",
  medium: "warning",
  high: "danger",
};

const SEVERITY_LABEL: Record<RetroSeverity, string> = {
  low: "низкая",
  medium: "средняя",
  high: "высокая",
};

export function RetroAiView({ summary }: { summary: RetroAiSummary }) {
  return (
    <AiIntelligenceSurface className="space-y-4 p-5" sparkleLabel="AI-анализ ретро">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-bold text-ink">AI-анализ ретроспективы</h3>
        <Badge tone={summary.mood === "high" ? "success" : summary.mood === "low" ? "danger" : "neutral"}>
          Настрой: {MOOD_LABELS[summary.mood] ?? summary.mood}
        </Badge>
      </div>

      <p className="whitespace-pre-wrap text-sm text-ink2">{summary.summary}</p>

      {summary.highlights.length > 0 ? (
        <Block title="Что прошло хорошо">
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink2">
            {summary.highlights.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </Block>
      ) : null}

      {summary.problems.length > 0 ? (
        <Block title="Главные проблемы">
          <ul className="space-y-2">
            {summary.problems.map((problem, i) => (
              <li key={i} className="rounded-lg border border-line bg-surface px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-ink">{problem.title}</span>
                  <Badge tone={SEVERITY_TONE[problem.severity]}>{SEVERITY_LABEL[problem.severity]}</Badge>
                </div>
                {problem.detail ? <p className="mt-1 text-sm text-ink3">{problem.detail}</p> : null}
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      {summary.patterns.length > 0 ? (
        <Block title="Повторяющиеся паттерны">
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink2">
            {summary.patterns.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </Block>
      ) : null}

      {summary.recommendations.length > 0 ? (
        <Block title="Рекомендации">
          <ul className="space-y-2">
            {summary.recommendations.map((rec, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2">
                <Badge tone={SEVERITY_TONE[rec.impact]}>эффект: {SEVERITY_LABEL[rec.impact]}</Badge>
                <span className="text-sm text-ink2">{rec.text}</span>
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      {summary.risks.length > 0 ? (
        <Block title="Риски">
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink2">
            {summary.risks.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </Block>
      ) : null}

      {summary.suggested_action_items.length > 0 ? (
        <Block title="Предлагаемые action items">
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink2">
            {summary.suggested_action_items.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </Block>
      ) : null}
    </AiIntelligenceSurface>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-ink3">{title}</h4>
      {children}
    </div>
  );
}
