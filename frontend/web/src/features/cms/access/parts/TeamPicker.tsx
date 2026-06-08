import { useMemo, useState } from "react";
import { CheckboxField, TextField } from "../../../../design-system";
import type { CmsTeam } from "../../api/cmsTypes";

interface TeamPickerProps {
  teams: CmsTeam[];
  selected: number[];
  disabled?: boolean;
  onChange: (next: number[]) => void;
}

export function TeamPicker({ teams, selected, disabled, onChange }: TeamPickerProps) {
  const [q, setQ] = useState("");

  const visibleTeams = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return teams;
    return teams.filter((team) => `${team.name} ${team.slug}`.toLowerCase().includes(query));
  }, [q, teams]);

  function toggle(id: number, next: boolean) {
    if (disabled) return;
    if (next) {
      if (selected.includes(id)) return;
      onChange([...selected, id]);
    } else {
      onChange(selected.filter((teamId) => teamId !== id));
    }
  }

  if (teams.length === 0) {
    return <p className="text-sm text-ink3">Команды ещё не созданы.</p>;
  }

  return (
    <div className="rounded-lg border border-line bg-canvas/40 p-2">
      {teams.length > 8 ? (
        <TextField
          className="mb-2"
          aria-label="Поиск команды"
          placeholder="Поиск команды"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          disabled={disabled}
        />
      ) : null}
      <div className="max-md:overflow-visible md:max-h-52 md:overflow-auto">
        {visibleTeams.map((team) => (
          <CheckboxField
            key={team.id}
            label={team.name}
            hint={team.slug + (team.is_active ? "" : " · неактивна")}
            checked={selected.includes(team.id)}
            disabled={disabled || !team.is_active}
            onChange={(event) => toggle(team.id, event.target.checked)}
          />
        ))}
        {visibleTeams.length === 0 ? <p className="py-2 text-sm text-ink3">Команд не найдено.</p> : null}
      </div>
    </div>
  );
}
