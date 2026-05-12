import type { CmsPrincipal, TabKey } from "./api/cmsTypes";

export const CMS_PERMISSIONS = {
  overview: "cms.overview.view",
  sessions: "cms.sessions.view",
  users: "cms.users.view",
  votes: "cms.votes.view",
  tokens: "cms.tokens.view",
  web: "cms.web.view",
  events: "cms.events.view",
  access: "cms.access.view",
  accessManage: "cms.access.manage",
  tasksManage: "cms.tasks.manage",
} as const;

export interface CmsTab {
  key: TabKey;
  label: string;
  permission: string;
  path: string;
  routePath: string;
}

export const cmsTabs: CmsTab[] = [
  { key: "overview", label: "Overview", permission: CMS_PERMISSIONS.overview, path: "/cms", routePath: "" },
  { key: "sessions", label: "Sessions", permission: CMS_PERMISSIONS.sessions, path: "/cms/sessions", routePath: "sessions" },
  { key: "users", label: "Users", permission: CMS_PERMISSIONS.users, path: "/cms/users", routePath: "users" },
  { key: "votes", label: "Votes", permission: CMS_PERMISSIONS.votes, path: "/cms/votes", routePath: "votes" },
  { key: "tokens", label: "Tokens", permission: CMS_PERMISSIONS.tokens, path: "/cms/tokens", routePath: "tokens" },
  { key: "web", label: "Web", permission: CMS_PERMISSIONS.web, path: "/cms/web", routePath: "web" },
  { key: "events", label: "Events", permission: CMS_PERMISSIONS.events, path: "/cms/events", routePath: "events" },
  { key: "access", label: "Access", permission: CMS_PERMISSIONS.access, path: "/cms/access", routePath: "access" },
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
    return orderedFromDb;
  }
  return cmsTabs.filter((tab) => hasPermission(principal, tab.permission));
}
