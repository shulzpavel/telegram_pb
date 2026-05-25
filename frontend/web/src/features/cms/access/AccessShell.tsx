import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, NavLink, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { cmsAccessApi } from "../api/cmsClient";
import type { CmsAdmin, CmsPageAccess, CmsPermission, CmsRole } from "../api/cmsTypes";
import { HelpCallout, InlineError, SectionHeader, Skeleton } from "../components/CmsPrimitives";
import { cn } from "../../../design-system";

const RolesListPage = lazy(() => import("./RolesListPage"));
const RoleDetailPage = lazy(() => import("./RoleDetailPage"));
const UsersListPage = lazy(() => import("./UsersListPage"));
const UserDetailPage = lazy(() => import("./UserDetailPage"));
const PermissionsRefPage = lazy(() => import("./PermissionsRefPage"));

interface AccessShellProps {
  canManage: boolean;
  currentAdminId: number;
}

interface AccessContextValue {
  canManage: boolean;
  currentAdminId: number;
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
  key: "roles" | "users" | "permissions";
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
];

export default function AccessShell({ canManage, currentAdminId }: AccessShellProps) {
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
          <Route path="*" element={<Navigate to="roles" replace />} />
        </Route>
      </Routes>
    </AccessContext.Provider>
  );
}

function AccessLayout() {
  const { canManage, loading, error } = useAccessContext();
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
      <Suspense fallback={<Skeleton height="h-48" />}>
        {loading ? <Skeleton height="h-48" /> : <Outlet />}
      </Suspense>
    </section>
  );
}

function AccessSubTabs() {
  const { pathname } = useLocation();
  return (
    <nav
      aria-label="Подразделы Доступов"
      className="-mx-1 flex gap-1 overflow-x-auto rounded-lg bg-line2 p-1 no-scrollbar"
    >
      {SUB_TABS.map((tab) => {
        const isActive = tab.match(pathname);
        return (
          <NavLink
            key={tab.key}
            to={tab.to}
            className={cn(
              "shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-semibold transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue/30",
              isActive
                ? "bg-surface text-ink shadow-card"
                : "text-ink3 hover:bg-line2 hover:text-ink"
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
