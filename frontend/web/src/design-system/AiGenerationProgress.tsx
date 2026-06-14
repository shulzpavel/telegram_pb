import { AiIntelligenceSurface, AiSparklePill } from "./AiIntelligenceSurface";
import { cn } from "./utils";

export function AiGenerationProgress({
  message,
  detail = "Можно продолжать работать, результат появится здесь автоматически.",
  className,
}: {
  message: string;
  detail?: string;
  className?: string;
}) {
  return (
    <AiIntelligenceSurface
      className={cn("p-4 sm:p-5", className)}
      sparkleLabel="AI генерирует"
      role="status"
      aria-live="polite"
    >
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <AiSparklePill>AI работает</AiSparklePill>
          <span className="text-xs font-medium text-ink3">{message}</span>
        </div>
        <p className="text-sm font-medium text-ink">Готовлю структурную сводку</p>
        {detail ? <p className="text-xs leading-relaxed text-ink3">{detail}</p> : null}
        <div className="ai-progress-track" aria-hidden="true">
          <span className="ai-progress-fill" />
        </div>
      </div>
    </AiIntelligenceSurface>
  );
}
