export type EstimationMode = "sp" | "sp_dev_test" | "sp_split";

export interface EstimationTrack {
  key: string;
  label: string;
}

export interface EstimationModeOption {
  mode: EstimationMode;
  label: string;
  description: string;
  tracks: EstimationTrack[];
  roleHint: string;
}

export const ESTIMATION_MODE_OPTIONS: EstimationModeOption[] = [
  {
    mode: "sp",
    label: "SP",
    description: "Единая оценка Story Points для всей команды.",
    tracks: [],
    roleHint: "Все участники голосуют одной колодой.",
  },
  {
    mode: "sp_dev_test",
    label: "SP Dev / Test",
    description: "Раздельная оценка разработки и тестирования.",
    tracks: [
      { key: "dev", label: "SP Dev" },
      { key: "test", label: "SP Test" },
    ],
    roleHint: "Frontend и Backend → Dev, QA → Test.",
  },
  {
    mode: "sp_split",
    label: "SP Front / Back / QA",
    description: "Раздельная оценка по направлениям команды.",
    tracks: [
      { key: "front", label: "SP Front" },
      { key: "back", label: "SP Back" },
      { key: "qa", label: "SP QA" },
    ],
    roleHint: "Frontend → Front, Backend → Back, QA → QA.",
  },
];

export const DEFAULT_ESTIMATION_MODE: EstimationMode = "sp";

export function getEstimationModeOption(mode: EstimationMode | string | undefined | null): EstimationModeOption {
  return ESTIMATION_MODE_OPTIONS.find((item) => item.mode === mode) ?? ESTIMATION_MODE_OPTIONS[0];
}

export function isSplitEstimationMode(mode: EstimationMode | string | undefined | null): boolean {
  return mode != null && mode !== "sp";
}

const ROLE_TO_TRACK: Record<EstimationMode, Record<string, string>> = {
  sp: {},
  sp_dev_test: {
    frontend: "dev",
    backend: "dev",
    qa: "test",
  },
  sp_split: {
    frontend: "front",
    backend: "back",
    qa: "qa",
  },
};

export function resolveTrackForRole(
  mode: EstimationMode | string | undefined | null,
  role: string | undefined | null,
): string | null {
  if (!mode || mode === "sp" || !role) return null;
  return ROLE_TO_TRACK[mode as EstimationMode]?.[role] ?? null;
}

export function resolveTrackLabel(
  mode: EstimationMode | string | undefined | null,
  trackKey: string | null | undefined,
): string | null {
  if (!trackKey) return null;
  const option = getEstimationModeOption(mode);
  return option.tracks.find((track) => track.key === trackKey)?.label ?? trackKey;
}
