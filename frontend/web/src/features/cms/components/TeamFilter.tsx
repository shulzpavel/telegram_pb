import { DropdownField } from "../../../design-system";
import type { CmsTeam } from "../api/cmsTypes";

interface TeamFilterProps {
  teams: CmsTeam[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function TeamFilter({ teams, value, onChange, disabled }: TeamFilterProps) {
  const options = [
    { value: "", label: "Все команды" },
    { value: "legacy", label: "Без команды (legacy)" },
    ...teams.map((team) => ({ value: String(team.id), label: team.name })),
  ];

  return (
    <DropdownField
      aria-label="Команда"
      className="md:max-w-[220px]"
      value={value}
      options={options}
      disabled={disabled}
      searchable={teams.length > 8}
      searchPlaceholder="Поиск команды..."
      onChange={onChange}
    />
  );
}

export function teamFilterParams(value: string): { team_id?: number } {
  if (!value || value === "legacy") {
    return {};
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? { team_id: parsed } : {};
}
