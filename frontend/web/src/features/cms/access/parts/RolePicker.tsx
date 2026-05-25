import { useMemo, useState } from "react";
import { CheckboxField, TextField } from "../../../../design-system";
import type { CmsRole } from "../../api/cmsTypes";

interface RolePickerProps {
  roles: CmsRole[];
  selected: number[];
  disabled?: boolean;
  onChange: (next: number[]) => void;
}

/**
 * Role multi-select with optional in-place search (when there are more than eight roles).
 */
export function RolePicker({ roles, selected, disabled, onChange }: RolePickerProps) {
  const [q, setQ] = useState("");

  const visibleRoles = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return roles;
    return roles.filter((role) => `${role.name} ${role.key}`.toLowerCase().includes(query));
  }, [q, roles]);

  function toggle(id: number, next: boolean) {
    if (disabled) return;
    if (next) {
      if (selected.includes(id)) return;
      onChange([...selected, id]);
    } else {
      onChange(selected.filter((roleId) => roleId !== id));
    }
  }

  return (
    <div className="rounded-lg border border-line bg-canvas/40 p-2">
      {roles.length > 8 ? (
        <TextField
          className="mb-2"
          aria-label="Поиск роли"
          placeholder="Поиск роли"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          disabled={disabled}
        />
      ) : null}
      <div className="max-h-52 overflow-auto">
        {visibleRoles.map((role) => (
          <CheckboxField
            key={role.id}
            label={role.name}
            hint={role.key + (role.is_system ? " · системная" : "")}
            checked={selected.includes(role.id)}
            disabled={disabled}
            onChange={(event) => toggle(role.id, event.target.checked)}
          />
        ))}
        {visibleRoles.length === 0 ? <p className="py-2 text-sm text-ink3">Ролей не найдено.</p> : null}
      </div>
    </div>
  );
}
