import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, NavLink, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { cmsAccessApi } from "../api/cmsClient";
import type { CmsAdmin, CmsPageAccess, CmsPermission, CmsRole } from "../api/cmsTypes";
import { HelpCallout, InlineError, SectionHeader, Skeleton } from "../components/CmsPrimitives";
import { cn, DeferredFallback, RouteTransition } from "../../../design-system";

const RolesListPage = lazy(() => import("./RolesListPage"));
const RoleDetailPage = lazy(() => import("./RoleDetailPage"));
const UsersListPage = lazy(() => import("./UsersListPage"));
const UserDetailPage = lazy(() => import("./UserDetailPage"));
const PermissionsRefPage = lazy(() => import("./PermissionsRefPage"));
const TeamsListPage = lazy(() => import("./TeamsListPage"));

interface AccessShellProps {
  canManage: boolean;
  currentAdminId: number;
  isSuperuser: boolean;
}

interface AccessContextValue {
  canManage: boolean;
  currentAdminId: number;
  isSuperuser: boolean;
  permissions: CmsPermission[];
  pages: CmsPageAccess[];
  roles: CmsRole[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  addRole: (role: CmsRole) => void;
  replaceRole: (role: CmsRole) => void;
  cacheAdmin: (admin: CmsAdmin) => void;
  lookupAdmin: (id: number) => CmsAdmin | null;
}

const AccessContext = createContext<AccessContextValue | null>(null);

export function useAccessContext(): AccessContextValue {
  const value = useContext(AccessContext);
  if (!value) {
    throw new Error("useAccessContext must be used inside <AccessShell>");
  }
  return value;
}

interface SubTab {
  key: "roles" | "users" | "permissions" | "teams";
  label: string;
  to: string;
  // Pathname prefixes that should highlight this tab.
  match: (pathname: string) => boolean;
}

const SUB_TABS: SubTab[] = [
  {
    key: "roles",
    label: "Роли",
    to: "/cms/access/roles",
    match: (pathname) =>
      pathname === "/cms/access" ||
      pathname === "/cms/access/" ||
      pathname.startsWith("/cms/access/roles"),
  },
  {
    key: "users",
    label: "Пользователи",
    to: "/cms/access/users",
    match: (pathname) => pathname.startsWith("/cms/access/users"),
  },
  {
    key: "permissions",
    label: "Права",
    to: "/cms/access/permissions",
    match: (pathname) => pathname.startsWith("/cms/access/permissions"),
  },
  {
    key: "teams",
    label: "Команды",
    to: "/cms/access/teams",
    match: (pathname) => pathname.startsWith("/cms/access/teams"),
  },
];

export default function AccessShell({ canManage, currentAdminId, isSuperuser }: AccessShellProps) {
  const [permissions, setPermissions] = useState<CmsPermission[]>([]);
  const [pages, setPages] = useState<CmsPageAccess[]>([]);
  const [roles, setRoles] = useState<CmsRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const adminCacheRef = useRef<Map<number, CmsAdmin>>(new Map());

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [permissionsPage, pagesPage, rolesPage] = await Promise.all([
        cmsAccessApi.permissions(),
        cmsAccessApi.pages(),
        cmsAccessApi.roles(),
      ]);
      setPermissions(permissionsPage.items);
      setPages(pagesPage.items);
      setRoles(rolesPage.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить справочники доступа.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const addRole = useCallback((role: CmsRole) => {
    setRoles((current) => {
      const exists = current.some((item) => item.id === role.id);
      if (exists) return current.map((item) => (item.id === role.id ? role : item));
      return [...current, role];
    });
  }, []);

  const replaceRole = useCallback((role: CmsRole) => {
    setRoles((current) => current.map((item) => (item.id === role.id ? role : item)));
  }, []);

  const cacheAdmin = useCallback((admin: CmsAdmin) => {
    adminCacheRef.current.set(admin.id, admin);
  }, []);

  const lookupAdmin = useCallback((id: number) => {
    return adminCacheRef.current.get(id) ?? null;
  }, []);

  const value = useMemo<AccessContextValue>(
    () => ({
      canManage,
      currentAdminId,
      isSuperuser,
      permissions,
      pages,
      roles,
      loading,
      error,
      reload,
      addRole,
      replaceRole,
      cacheAdmin,
      lookupAdmin,
    }),
    [
      canManage,
      currentAdminId,
      isSuperuser,
      permissions,
      pages,
      roles,
      loading,
      error,
      reload,
      addRole,
      replaceRole,
      cacheAdmin,
      lookupAdmin,
    ]
  );

  return (
    <AccessContext.Provider value={value}>
      <Routes>
        <Route element={<AccessLayout />}>
          <Route index element={<Navigate to="roles" replace />} />
          <Route path="roles" element={<RolesListPage />} />
          <Route path="roles/new" element={<RoleDetailPage />} />
          <Route path="roles/:roleId" element={<RoleDetailPage />} />
          <Route path="users" element={<UsersListPage />} />
          <Route path="users/new" element={<UserDetailPage />} />
          <Route path="users/:userId" element={<UserDetailPage />} />
          <Route path="permissions" element={<PermissionsRefPage />} />
          <Route path="teams" element={<TeamsListPage />} />
          <Route path="*" element={<Navigate to="roles" replace />} />
        </Route>
      </Routes>
    </AccessContext.Provider>
  );
}

function AccessLayout() {
  const { canManage, loading, error } = useAccessContext();
  const { pathname } = useLocation();
  return (
    <section className="space-y-5">
      <SectionHeader
        title="Доступы"
        description="CMS-пользователи, их роли и права. Управление атомарными permissions через роли — переключайте вкладки ниже."
      />
      {!canManage ? (
        <HelpCallout title="Только для чтения">
          <p>Вы видите раздел «Доступы», но не можете изменять роли или пользователей. Кнопки сохранения и удаления будут отключены.</p>
        </HelpCallout>
      ) : null}
      {error ? <InlineError text={error} /> : null}
      <AccessSubTabs />
      <Suspense fallback={(
        <DeferredFallback>
          <Skeleton height="h-48" />
        </DeferredFallback>
      )}
      >
        {loading ? <Skeleton height="h-48" /> : (
          <RouteTransition transitionKey={pathname}>
            <Outlet />
          </RouteTransition>
        )}
      </Suspense>
    </section>
  );
}

function AccessSubTabs() {
  const { isSuperuser } = useAccessContext();
  const { pathname } = useLocation();
  const tabs = isSuperuser ? SUB_TABS : SUB_TABS.filter((tab) => tab.key !== "teams");
  return (
    <nav
      aria-label="Подразделы Доступов"
      className="flex overflow-x-auto border-b border-line pb-px"
    >
      {tabs.map((tab) => {
        const isActive = tab.match(pathname);
        return (
          <NavLink
            key={tab.key}
            to={tab.to}
            className={cn(
              "min-w-28 flex-none whitespace-nowrap border-b-2 px-3 py-2 text-center text-sm font-semibold transition-colors sm:flex-1 sm:basis-0",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue/30",
              isActive
                ? "border-blue text-blue"
                : "border-transparent text-ink3 hover:text-ink"
            )}
            aria-current={isActive ? "page" : undefined}
          >
            {tab.label}
          </NavLink>
        );
      })}
    </nav>
  );
}
