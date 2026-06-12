import { SelectField } from "../../../design-system";
import type { CmsTeam } from "../api/cmsTypes";

interface TeamFilterProps {
  teams: CmsTeam[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function TeamFilter({ teams, value, onChange, disabled }: TeamFilterProps) {
  return (
    <SelectField
      aria-label="Команда"
      className="md:max-w-[220px]"
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">Все команды</option>
      <option value="legacy">Без команды (legacy)</option>
      {teams.map((team) => (
        <option key={team.id} value={String(team.id)}>
          {team.name}
        </option>
      ))}
    </SelectField>
  );
}

export function teamFilterParams(value: string): { team_id?: number } {
  if (!value || value === "legacy") {
    return {};
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? { team_id: parsed } : {};
}
