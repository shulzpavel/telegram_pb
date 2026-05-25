import type { CmsPermission } from "../../api/cmsTypes";

export interface PermissionGroup {
  /** Stable key for React lists: the prefix or "_other" for ungrouped. */
  key: string;
  /** Human-friendly label rendered as the group header. */
  label: string;
  permissions: CmsPermission[];
}

// Russian-friendly labels for the prefixes we actually ship. Unknown prefixes
// fall through to the literal key so newly added permission families stay
// readable instead of disappearing into "Прочее".
const PRETTY_PREFIX: Record<string, string> = {
  "app.sessions": "Сессии планинга",
  "cms.access": "Доступы",
  "cms.events": "Журнал событий",
  "cms.overview": "Сводка",
  "cms.sessions": "Сессии (CMS)",
  "cms.tasks": "Задачи",
  "cms.tokens": "Invite-ссылки",
  "cms.users": "Участники",
  app: "Приложение",
  cms: "CMS",
};

/**
 * Returns the dotted prefix (everything before the last segment) for a
 * permission key. "cms.access.view" → "cms.access". Single-segment keys
 * (which the backend doesn't currently use) return "".
 */
export function groupPrefixOf(key: string): string {
  const parts = key.split(".");
  if (parts.length <= 1) return "";
  return parts.slice(0, -1).join(".");
}

export function labelForGroup(prefix: string): string {
  if (!prefix) return "Прочее";
  return PRETTY_PREFIX[prefix] ?? prefix;
}

/**
 * Groups permissions by their dotted prefix. Groups are sorted by label and
 * permissions inside a group by key — both deterministic so React keeps a
 * stable reconciler shape between renders.
 */
export function groupPermissionsByPrefix(permissions: CmsPermission[]): PermissionGroup[] {
  const buckets = new Map<string, CmsPermission[]>();
  for (const permission of permissions) {
    const prefix = groupPrefixOf(permission.key);
    const list = buckets.get(prefix);
    if (list) list.push(permission);
    else buckets.set(prefix, [permission]);
  }
  const groups: PermissionGroup[] = [];
  for (const [prefix, items] of buckets.entries()) {
    groups.push({
      key: prefix || "_other",
      label: labelForGroup(prefix),
      permissions: [...items].sort((a, b) => a.key.localeCompare(b.key)),
    });
  }
  groups.sort((a, b) => {
    // "Прочее" always at the bottom; otherwise alphabetical by label.
    if (a.key === "_other") return 1;
    if (b.key === "_other") return -1;
    return a.label.localeCompare(b.label);
  });
  return groups;
}

export function filterPermissions(permissions: CmsPermission[], query: string): CmsPermission[] {
  const q = query.trim().toLowerCase();
  if (!q) return permissions;
  return permissions.filter((permission) => {
    return (
      permission.key.toLowerCase().includes(q) ||
      permission.label.toLowerCase().includes(q) ||
      (permission.description ?? "").toLowerCase().includes(q)
    );
  });
}

/**
 * Relative ru-RU time formatter intended for "last login"-style metadata.
 * Falls back to the full date when the diff exceeds a week so we don't
 * stretch the relative scale beyond what a human can intuit at a glance.
 */
export function formatRelativeTime(value: string | null | undefined, now: number = Date.now()): string {
  if (!value) return "никогда";
  const date = new Date(value);
  const ms = date.getTime();
  if (Number.isNaN(ms)) return "никогда";
  const diff = now - ms;
  if (diff < 0) return formatFullDate(date);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "только что";
  const min = Math.floor(sec / 60);
  if (min < 60) return pluralize(min, ["минута", "минуты", "минут"]) + " назад";
  const hour = Math.floor(min / 60);
  if (hour < 24) return pluralize(hour, ["час", "часа", "часов"]) + " назад";
  const day = Math.floor(hour / 24);
  if (day < 7) return pluralize(day, ["день", "дня", "дней"]) + " назад";
  return formatFullDate(date);
}

function pluralize(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  let form: string;
  if (mod10 === 1 && mod100 !== 11) form = forms[0];
  else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) form = forms[1];
  else form = forms[2];
  return `${n} ${form}`;
}

function formatFullDate(date: Date): string {
  const datePart = date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const timePart = date.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${datePart} ${timePart}`;
}
