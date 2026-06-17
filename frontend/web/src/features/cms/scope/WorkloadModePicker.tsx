import { Badge, Surface } from "../../../design-system";

export type ScopeWorkloadMode = "sp" | "sp_dev_test";

export const DEFAULT_SCOPE_WORKLOAD_MODE: ScopeWorkloadMode = "sp";

const WORKLOAD_MODE_OPTIONS: Array<{
  mode: ScopeWorkloadMode;
  label: string;
  description: string;
}> = [
  {
    mode: "sp",
    label: "SP",
    description: "Единая оценка Story Points из Jira.",
  },
  {
    mode: "sp_dev_test",
    label: "SP Dev / Test",
    description: "Раздельная нагрузка по полям Story Points dev и Story Points test.",
  },
];

interface WorkloadModePickerProps {
  value: ScopeWorkloadMode;
  onChange: (mode: ScopeWorkloadMode) => void;
  disabled?: boolean;
}

export default function WorkloadModePicker({ value, onChange, disabled = false }: WorkloadModePickerProps) {
  const selected = WORKLOAD_MODE_OPTIONS.find((item) => item.mode === value) ?? WORKLOAD_MODE_OPTIONS[0];

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-ink">Как показывать нагрузку</p>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-2">
        {WORKLOAD_MODE_OPTIONS.map((option) => {
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
              <p className="mt-1 text-xs leading-relaxed text-ink3">{option.description}</p>
            </button>
          );
        })}
      </div>
      {selected.mode === "sp_dev_test" ? (
        <Surface className="border-blue/30 bg-blue/5 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink3">Поля Jira</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge tone="neutral">Story Points dev</Badge>
            <Badge tone="neutral">Story Points test</Badge>
          </div>
          <p className="mt-2 text-sm text-ink2">
            Укажите отдельный capacity для разработки и тестирования.
          </p>
        </Surface>
      ) : null}
    </div>
  );
}
