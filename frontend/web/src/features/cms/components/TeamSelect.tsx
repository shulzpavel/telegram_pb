import { useEffect, useMemo, useState } from "react";
import { DropdownField } from "../../../design-system";
import type { CmsTeam } from "../api/cmsTypes";
import { teamDisplayLabel } from "./TeamBadge";

interface TeamSelectProps {
  teams: CmsTeam[];
  value: number | "";
  onChange: (teamId: number | "") => void;
  required?: boolean;
  disabled?: boolean;
  label?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
  compact?: boolean;
  /** Always render a dropdown (create flows, superadmin, multi-team admins). */
  forcePicker?: boolean;
  loading?: boolean;
}

export function TeamSelect({
  teams,
  value,
  onChange,
  required = false,
  disabled = false,
  label = "Команда",
  allowEmpty = false,
  emptyLabel = "Без команды (legacy)",
  compact = false,
  forcePicker = false,
  loading = false,
}: TeamSelectProps) {
  const options = useMemo(() => {
    if (loading && teams.length === 0) {
      return [{ value: "", label: "Загрузка команд..." }];
    }
    if (!loading && teams.length === 0) {
      return [{ value: "", label: "Нет доступных команд" }];
    }
    const items = teams.map((team) => ({
      value: String(team.id),
      label: teamDisplayLabel(team.id, team),
    }));
    if (allowEmpty) {
      return [{ value: "", label: emptyLabel }, ...items];
    }
    if (required) {
      return [{ value: "", label: "Выберите команду" }, ...items];
    }
    return items;
  }, [allowEmpty, emptyLabel, loading, required, teams]);

  if (!forcePicker && teams.length <= 1 && !allowEmpty) {
    if (teams.length === 1) {
      return (
        <p className="text-sm text-ink2">
          {label}: <span className="font-medium text-ink">{teamDisplayLabel(teams[0].id, teams[0])}</span>
        </p>
      );
    }
    return null;
  }

  return (
    <DropdownField
      label={label}
      className={compact ? "max-w-sm" : undefined}
      value={value === "" ? "" : String(value)}
      options={options}
      required={required}
      disabled={disabled || loading || teams.length === 0}
      searchable={teams.length > 8}
      searchPlaceholder="Поиск команды..."
      onChange={(next) => {
        onChange(next === "" ? "" : Number(next));
      }}
    />
  );
}

export function resolveDefaultTeamId(teams: CmsTeam[]): number | "" {
  if (teams.length === 1) return teams[0].id;
  return "";
}

export function needsTeamPicker(teams: CmsTeam[], isSuperuser: boolean): boolean {
  if (isSuperuser) return true;
  return teams.length > 1;
}

export function teamPickerRequired(teams: CmsTeam[], isSuperuser: boolean): boolean {
  return needsTeamPicker(teams, isSuperuser) && !isSuperuser && teams.length > 1;
}

/** Keep create forms in sync when teams finish loading after the first render. */
export function useTeamIdState(teams: CmsTeam[], enabled = true) {
  const [teamId, setTeamId] = useState<number | "">(() => resolveDefaultTeamId(teams));

  useEffect(() => {
    if (!enabled) return;
    setTeamId((current) => (current === "" ? resolveDefaultTeamId(teams) : current));
  }, [enabled, teams]);

  return [teamId, setTeamId] as const;
}
