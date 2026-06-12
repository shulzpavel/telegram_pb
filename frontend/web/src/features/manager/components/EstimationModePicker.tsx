import { Badge, Surface } from "../../../design-system";
import {
  DEFAULT_ESTIMATION_MODE,
  ESTIMATION_MODE_OPTIONS,
  type EstimationMode,
} from "../../../shared/lib/estimationModes";

interface EstimationModePickerProps {
  value: EstimationMode;
  onChange: (mode: EstimationMode) => void;
  disabled?: boolean;
  compact?: boolean;
}

export default function EstimationModePicker({
  value,
  onChange,
  disabled = false,
  compact = false,
}: EstimationModePickerProps) {
  const selected = ESTIMATION_MODE_OPTIONS.find((item) => item.mode === value) ?? ESTIMATION_MODE_OPTIONS[0];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-2">
        {ESTIMATION_MODE_OPTIONS.map((option) => {
          const active = option.mode === value;
          return (
            <button
              key={option.mode}
              type="button"
              disabled={disabled}
              onClick={() => onChange(option.mode)}
              className={[
                "min-h-16 rounded-lg border p-3 text-left transition-colors",
                active ? "border-blue bg-blue/10" : "border-line bg-surface hover:border-blue/40",
                disabled ? "cursor-not-allowed opacity-60" : "",
              ].join(" ")}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <span className="min-w-0 text-sm font-semibold leading-snug text-ink">{option.label}</span>
                {active ? <Badge tone="info" className="shrink-0">Выбрано</Badge> : null}
              </div>
              {!compact ? (
                <p className="mt-1 text-xs leading-relaxed text-ink3">{option.description}</p>
              ) : null}
            </button>
          );
        })}
      </div>

      {!compact ? (
        <Surface className="border-blue/30 bg-blue/5 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink3">Как это работает</p>
          <p className="mt-1 text-sm text-ink2">{selected.roleHint}</p>
          {selected.tracks.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {selected.tracks.map((track) => (
                <Badge key={track.key} tone="neutral">
                  {track.label}
                </Badge>
              ))}
            </div>
          ) : (
            <div className="mt-2">
              <Badge tone="neutral">Fibonacci SP</Badge>
            </div>
          )}
        </Surface>
      ) : null}
    </div>
  );
}

export { DEFAULT_ESTIMATION_MODE };
