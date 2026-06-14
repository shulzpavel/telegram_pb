import type { CmsPrincipal, TabKey } from "./api/cmsTypes";

export const CMS_PERMISSIONS = {
  overview: "cms.overview.view",
  sessions: "cms.sessions.view",
  users: "cms.users.view",
  tokens: "cms.tokens.view",
  events: "cms.events.view",
  access: "cms.access.view",
  accessManage: "cms.access.manage",
  tasksManage: "cms.tasks.manage",
  appSessionsManage: "app.sessions.manage",
  webParticipantsDelete: "cms.web_participants.delete",
  planner: "cms.planner.view",
  retro: "cms.retro.view",
  retroManage: "cms.retro.manage",
  retroAnalyze: "cms.retro.analyze",
} as const;

/**
 * Logical groups that organize the CMS nav menu. The mobile drawer renders
 * groups in the order declared here, so new sections can be added simply by
 * appending a new entry (e.g. `{ key: "automation", label: "Автоматизации" }`)
 * and tagging the relevant `cmsTabs[].group` with it — `CmsShell` will pick
 * them up automatically with no further changes.
 *
 * Keep group keys narrow (`CmsNavGroupKey`) so TypeScript flags any tab whose
 * group does not exist in this list.
 */
export type CmsNavGroupKey = "core" | "operations" | "security";

export interface CmsNavGroup {
  key: CmsNavGroupKey;
  label: string;
}

export const cmsNavGroups: CmsNavGroup[] = [
  { key: "core", label: "Главное" },
  { key: "operations", label: "Операции" },
  { key: "security", label: "Безопасность" },
];

export interface CmsTab {
  key: TabKey;
  label: string;
  description: string;
  permission: string;
  path: string;
  routePath: string;
  group: CmsNavGroupKey;
}

// "votes" and "web" came from the Telegram bot era and are intentionally
// excluded from navigation. The backend disables their CMS page rows on
// startup; we keep TabKey wide enough for older principal payloads but the
// list below is the single source of truth for what's actually rendered.
export const cmsTabs: CmsTab[] = [
  {
    key: "overview",
    label: "Сводка",
    description: "Ключевые цифры по сессиям, участникам и invite-ссылкам.",
    permission: CMS_PERMISSIONS.overview,
    path: "/cms",
    routePath: "",
    group: "core",
  },
  {
    key: "planner",
    label: "Калькулятор",
    description: "Velocity и Capacity на следующий спринт: задаём команду и историю — получаем рекомендацию в SP.",
    permission: CMS_PERMISSIONS.planner,
    path: "/cms/planner",
    routePath: "planner",
    group: "operations",
  },
  {
    key: "sessions",
    label: "Сессии",
    description: "Список планирований: открыть управление, отчёт, закрыть или удалить из истории.",
    permission: CMS_PERMISSIONS.sessions,
    path: "/cms/sessions",
    routePath: "sessions",
    group: "operations",
  },
  {
    key: "scope",
    label: "Отчеты",
    description: "Месячные отчёты по командам: capacity, статус задач, открытые вопросы и AI-сводка для бизнеса.",
    permission: CMS_PERMISSIONS.planner,
    path: "/cms/scope",
    routePath: "scope",
    group: "operations",
  },
  {
    key: "retro",
    label: "Ретроспективы",
    description: "Живое ретро: настраиваем секции, команда подключается по ссылке, в конце — AI-анализ итогов.",
    permission: CMS_PERMISSIONS.retro,
    path: "/cms/retro",
    routePath: "retro",
    group: "operations",
  },
  {
    key: "users",
    label: "Участники",
    description: "Кто заходил в сессии. Используется для поиска по имени и роли.",
    permission: CMS_PERMISSIONS.users,
    path: "/cms/users",
    routePath: "users",
    group: "operations",
  },
  {
    key: "tokens",
    label: "Invite-ссылки",
    description: "Активные и истёкшие приглашения. Здесь можно отозвать ссылку.",
    permission: CMS_PERMISSIONS.tokens,
    path: "/cms/tokens",
    routePath: "tokens",
    group: "operations",
  },
  {
    key: "events",
    label: "Журнал действий",
    description: "Аудит-лог: кто, когда и что менял в CMS и сессиях.",
    permission: CMS_PERMISSIONS.events,
    path: "/cms/events",
    routePath: "events",
    group: "security",
  },
  {
    key: "access",
    label: "Доступы",
    description: "CMS-пользователи, роли и права. Системные роли защищены от изменений.",
    permission: CMS_PERMISSIONS.access,
    path: "/cms/access",
    routePath: "access",
    group: "security",
  },
];

export function hasPermission(principal: CmsPrincipal, permission: string): boolean {
  return principal.is_superuser || principal.permissions.includes(permission);
}

export function visibleCmsTabs(principal: CmsPrincipal): CmsTab[] {
  const tabByKey = new Map<TabKey, CmsTab>(cmsTabs.map((tab) => [tab.key, tab]));
  const orderedFromDb = principal.pages
    .map((page) => tabByKey.get(page.key as TabKey))
    .filter((tab): tab is CmsTab => Boolean(tab))
    .filter((tab) => hasPermission(principal, tab.permission));

  if (orderedFromDb.length > 0) {
    const included = new Set(orderedFromDb.map((tab) => tab.key));
    const missingPermittedTabs = cmsTabs.filter((tab) => !included.has(tab.key) && hasPermission(principal, tab.permission));
    return [...orderedFromDb, ...missingPermittedTabs];
  }
  return cmsTabs.filter((tab) => hasPermission(principal, tab.permission));
}

/**
 * Group the principal's visible tabs by `cmsNavGroups`, preserving the order
 * of `cmsTabs` inside each group and dropping any group that has no items.
 *
 * Used by the mobile drawer in `CmsShell` to render a hierarchical menu. The
 * desktop tab bar still uses the flat `visibleCmsTabs` list.
 */
export function groupVisibleTabs(
  principal: CmsPrincipal,
): { group: CmsNavGroup; items: CmsTab[] }[] {
  const flat = visibleCmsTabs(principal);
  const bucket = new Map<CmsNavGroupKey, CmsTab[]>();
  for (const tab of flat) {
    const items = bucket.get(tab.group);
    if (items) {
      items.push(tab);
    } else {
      bucket.set(tab.group, [tab]);
    }
  }
  const result: { group: CmsNavGroup; items: CmsTab[] }[] = [];
  for (const group of cmsNavGroups) {
    const items = bucket.get(group.key);
    if (items && items.length > 0) {
      result.push({ group, items });
    }
  }
  return result;
}
