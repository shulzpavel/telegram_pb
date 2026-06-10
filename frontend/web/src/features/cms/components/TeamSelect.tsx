import { useMemo } from "react";
import { SelectField } from "../../../design-system";
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
}: TeamSelectProps) {
  const options = useMemo(() => {
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
  }, [allowEmpty, emptyLabel, required, teams]);

  if (teams.length <= 1 && !allowEmpty) {
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
    <SelectField
      label={label}
      className={compact ? "max-w-sm" : undefined}
      value={value === "" ? "" : String(value)}
      required={required}
      disabled={disabled}
      onChange={(event) => {
        const next = event.target.value;
        onChange(next === "" ? "" : Number(next));
      }}
    >
      {options.map((option) => (
        <option key={option.value || "empty"} value={option.value}>
          {option.label}
        </option>
      ))}
    </SelectField>
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
