import { useMemo, useState } from "react";
import { Badge, CheckboxField, TextField } from "../../../../design-system";
import type { CmsPermission } from "../../api/cmsTypes";
import { filterPermissions, groupPermissionsByPrefix } from "./helpers";

interface PermissionPickerProps {
  permissions: CmsPermission[];
  selected: string[];
  disabled?: boolean;
  onChange: (next: string[]) => void;
}

/**
 * Permission picker grouped by dotted prefix with search and per-group select-all.
 */
export function PermissionPicker({ permissions, selected, disabled, onChange }: PermissionPickerProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => filterPermissions(permissions, query), [permissions, query]);
  const groups = useMemo(() => groupPermissionsByPrefix(filtered), [filtered]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  function toggleOne(key: string) {
    if (disabled) return;
    if (selectedSet.has(key)) {
      onChange(selected.filter((value) => value !== key));
    } else {
      onChange([...selected, key]);
    }
  }

  function toggleGroup(groupKeys: string[], shouldSelectAll: boolean) {
    if (disabled) return;
    if (shouldSelectAll) {
      const next = new Set(selected);
      for (const key of groupKeys) next.add(key);
      onChange(Array.from(next));
    } else {
      const drop = new Set(groupKeys);
      onChange(selected.filter((key) => !drop.has(key)));
    }
  }

  return (
    <div className="rounded-lg border border-line bg-canvas/40 p-2">
      <div className="flex flex-col gap-2 px-1 pb-2 pt-1 sm:flex-row sm:items-center sm:justify-between">
        <TextField
          aria-label="Поиск прав"
          placeholder="Поиск по permission, например cms.access"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="flex-1"
          disabled={disabled}
        />
        <div className="flex items-center gap-2 text-xs text-ink3">
          <Badge tone="neutral">Выбрано: {selected.length}</Badge>
          <Badge tone="neutral">Найдено: {filtered.length}</Badge>
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="px-3 py-6 text-center text-sm text-ink3">Ничего не найдено по «{query.trim()}».</p>
      ) : (
        <div className="max-h-72 space-y-3 overflow-auto pr-1">
          {groups.map((group) => {
            const groupKeys = group.permissions.map((permission) => permission.key);
            const selectedInGroup = groupKeys.filter((key) => selectedSet.has(key)).length;
            const allSelected = selectedInGroup === groupKeys.length && groupKeys.length > 0;
            return (
              <fieldset
                key={group.key}
                className="rounded-lg border border-line bg-surface px-2 pb-2 pt-1"
              >
                <legend className="flex w-full items-center justify-between gap-2 px-1 text-xs font-bold uppercase tracking-wide text-ink3">
                  <span className="inline-flex items-center gap-2">
                    <span>{group.label}</span>
                    <Badge tone="neutral">
                      {selectedInGroup}/{groupKeys.length}
                    </Badge>
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleGroup(groupKeys, !allSelected)}
                    disabled={disabled || groupKeys.length === 0}
                    className="rounded px-1.5 py-0.5 text-xs font-semibold text-blue hover:bg-line2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {allSelected ? "Снять все" : "Выбрать все"}
                  </button>
                </legend>
                <div className="mt-1">
                  {group.permissions.map((permission) => (
                    <CheckboxField
                      key={permission.key}
                      label={permission.label || permission.key}
                      hint={permission.description ? `${permission.key} — ${permission.description}` : permission.key}
                      checked={selectedSet.has(permission.key)}
                      disabled={disabled}
                      onChange={() => toggleOne(permission.key)}
                    />
                  ))}
                </div>
              </fieldset>
            );
          })}
        </div>
      )}
    </div>
  );
}
