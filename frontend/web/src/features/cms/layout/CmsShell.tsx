import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { BottomSheet, BrandHomeLink, Button, SheetItem, ThemeToggle, useTheme, type ThemeMode } from "../../../design-system";
import { cmsAuthApi } from "../api/cmsClient";
import type { CmsPrincipal } from "../api/cmsTypes";
import { InlineError, Skeleton } from "../components/CmsPrimitives";
import {
  CMS_PERMISSIONS,
  groupVisibleTabs,
  hasPermission,
  visibleCmsTabs,
  type CmsTab,
} from "../navigation";

const AccessShell = lazy(() => import("../access/AccessShell"));
const AuditEventsPage = lazy(() => import("../events/AuditEventsPage"));
const OverviewPage = lazy(() => import("../overview/OverviewPage"));
const SessionsPage = lazy(() => import("../sessions/SessionsPage"));
const TokensPage = lazy(() => import("../tokens/TokensPage"));
const UsersPage = lazy(() => import("../users/UsersPage"));

export default function CmsShell({
  principal,
  onLogout,
}: {
  principal: CmsPrincipal;
  onLogout: () => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const visibleTabs = useMemo(() => visibleCmsTabs(principal), [principal]);
  const groupedTabs = useMemo(() => groupVisibleTabs(principal), [principal]);

  // Theme persistence: when the CMS principal carries a server preference,
  // apply it locally on mount; when the user flips the toggle inside CMS,
  // mirror the new value to the server. Failures are tolerated so the local
  // choice always sticks.
  const { mode: themeMode, setMode: setThemeMode } = useTheme();
  const lastSyncedRef = useRef<ThemeMode | null>(null);

  useEffect(() => {
    const remote = principal.theme_preference;
    if (!remote || remote === themeMode) {
      if (remote) lastSyncedRef.current = remote;
      return;
    }
    lastSyncedRef.current = remote;
    setThemeMode(remote);
    // We intentionally depend only on the principal so a server update on
    // re-login wins, but local toggles do not re-trigger the sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [principal]);

  useEffect(() => {
    if (lastSyncedRef.current === themeMode) return;
    lastSyncedRef.current = themeMode;
    cmsAuthApi.updatePreferences({ theme_preference: themeMode }).catch((error) => {
      // Swallow but log: theme already updated locally, server sync is best-effort.
      if (typeof console !== "undefined") {
        console.warn("[cms] failed to persist theme preference", error);
      }
    });
  }, [themeMode]);
  const canManageAccess = hasPermission(principal, CMS_PERMISSIONS.accessManage);
  const canManageTasks = hasPermission(principal, CMS_PERMISSIONS.tasksManage);
  const canManageSessions = hasPermission(principal, CMS_PERMISSIONS.appSessionsManage);

  const activeTab = useMemo<CmsTab | null>(() => {
    const match = visibleTabs.find((item) => {
      if (item.path === "/cms") {
        return location.pathname === "/cms" || location.pathname === "/cms/overview";
      }
      return location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
    });
    return match ?? visibleTabs[0] ?? null;
  }, [location.pathname, visibleTabs]);
  const contentWidthClass =
    activeTab?.key === "overview" || activeTab?.key === "access"
      ? "max-w-5xl"
      : "max-w-7xl";

  async function logout() {
    await cmsAuthApi.logout().catch(() => undefined);
    onLogout();
  }

  function navigateTo(path: string) {
    setMobileOpen(false);
    navigate(path);
  }

  return (
    <main className="min-h-screen-mobile app-gradient-bg pb-safe">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 pt-safe backdrop-blur supports-[backdrop-filter]:bg-surface/80">
        <div className="flex min-h-14 w-full items-center gap-2 px-3 py-2 sm:gap-3 sm:px-4 md:min-h-16 lg:px-6">
          <BrandHomeLink size="sm" showWordmark={false} className="shrink-0" />
          <div className="min-w-0 flex-1">
            <h1 className="hidden break-words text-base font-bold leading-snug text-ink sm:block md:text-lg">
              Planning Poker · Админка
            </h1>
            <p className="break-words text-[11px] font-semibold uppercase tracking-wide text-ink3 sm:hidden">
              {activeTab?.label ?? "Админка"}
            </p>
            <p className="break-words text-xs text-ink3 sm:mt-0.5">
              {principal.display_name || principal.username}
              {principal.is_superuser ? " · суперпользователь" : ""}
            </p>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
            <ThemeToggle className="hidden md:inline-flex" />
            <Button
              variant="primary"
              size="sm"
              onClick={() => navigate("/manage")}
              title="Открыть рабочее место фасилитатора"
              className="hidden sm:inline-flex"
            >
              <span className="hidden md:inline">Открыть cockpit</span>
              <span className="md:hidden">Cockpit</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={logout} className="hidden md:inline-flex">
              Выйти
            </Button>
            {/* Mobile-only overflow trigger. The full action set (nav
                groups, cockpit, theme, logout) lives in the bottom
                sheet so the header stays a clean 56px row at 320px. */}
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Открыть меню"
              aria-expanded={mobileOpen}
              className="md:hidden inline-flex h-10 w-10 items-center justify-center rounded-md border border-line bg-surface text-ink transition-colors hover:bg-line2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue/40 active:scale-[0.96] motion-reduce:active:scale-100"
            >
              <DotsIcon />
            </button>
          </div>
        </div>
        {/* Desktop tab strip — horizontal scrollable on tablet, full
            row on laptop+. Mobile uses the bottom sheet instead so we
            don't double-up the navigation surface. */}
        <nav
          aria-label="Разделы CMS"
          className="hidden md:block border-t border-line"
        >
          <div className="flex w-full gap-1 overflow-x-auto px-4 lg:px-6">
            {visibleTabs.map((item) => (
              <NavLink
                key={item.key}
                to={item.path}
                end={item.key === "overview"}
                className={({ isActive }) =>
                  [
                    "shrink-0 whitespace-nowrap px-3 py-2 text-sm font-semibold border-b-2 transition-colors",
                    isActive ? "border-blue text-blue" : "border-transparent text-ink3 hover:text-ink",
                  ].join(" ")
                }
                onClick={() => setMobileOpen(false)}
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        </nav>
      </header>

      <BottomSheet
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        title="Меню CMS"
        description={`${principal.display_name || principal.username}${principal.is_superuser ? " · суперпользователь" : ""}`}
        footer={
          <div className="flex flex-col gap-2">
            <Button
              variant="primary"
              onClick={() => {
                setMobileOpen(false);
                navigate("/manage");
              }}
            >
              Открыть cockpit фасилитатора
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setMobileOpen(false);
                void logout();
              }}
            >
              Выйти из CMS
            </Button>
          </div>
        }
      >
        <div className="space-y-3 px-1 pb-2">
          <div className="rounded-lg border border-line bg-canvas/40 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink3">Тема интерфейса</p>
            <div className="mt-1">
              <ThemeToggle size="sm" tone="surface" />
            </div>
          </div>
          {groupedTabs.map((section) => (
            <div key={section.group.key}>
              <h3 className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-ink3">
                {section.group.label}
              </h3>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const isActive = activeTab?.key === item.key;
                  return (
                    <SheetItem
                      key={item.key}
                      label={item.label}
                      description={item.description}
                      trailing={isActive ? <CheckIcon /> : undefined}
                      onClick={() => navigateTo(item.path)}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </BottomSheet>

      <div className={`mx-auto ${contentWidthClass} space-y-5 px-3 py-5 sm:px-4 lg:py-6`}>
        {visibleTabs.length === 0 ? (
          <InlineError text="Для этой учётной записи не настроено ни одного раздела CMS." />
        ) : null}

        <Suspense fallback={<Skeleton height="h-48" />}>
          <Routes>
            <Route index element={<CmsIndexRedirect firstPath={visibleTabs[0]?.path} />} />
            {hasPermission(principal, CMS_PERMISSIONS.overview) ? (
              <Route path="overview" element={<Navigate to="/cms" replace />} />
            ) : null}
            {hasPermission(principal, CMS_PERMISSIONS.sessions) ? (
              <Route
                path="sessions"
                element={
                  <SessionsPage canManageTasks={canManageTasks} canManageSessions={canManageSessions} />
                }
              />
            ) : null}
            {hasPermission(principal, CMS_PERMISSIONS.users) ? <Route path="users" element={<UsersPage principal={principal} />} /> : null}
            {hasPermission(principal, CMS_PERMISSIONS.tokens) ? (
              <Route path="tokens" element={<TokensPage canManageSessions={canManageSessions} />} />
            ) : null}
            {hasPermission(principal, CMS_PERMISSIONS.events) ? <Route path="events" element={<AuditEventsPage />} /> : null}
            {hasPermission(principal, CMS_PERMISSIONS.access) ? (
              <Route
                path="access/*"
                element={<AccessShell canManage={canManageAccess} currentAdminId={principal.id} />}
              />
            ) : null}
            {/* Deprecated routes from the Telegram-era console: route any
                lingering bookmarks back to the active landing page. */}
            <Route path="votes" element={<Navigate to="/cms/sessions" replace />} />
            <Route path="web" element={<Navigate to="/cms/sessions" replace />} />
            <Route path="*" element={<CmsIndexRedirect firstPath={visibleTabs[0]?.path} />} />
          </Routes>
        </Suspense>
      </div>
    </main>
  );
}

function CmsIndexRedirect({ firstPath }: { firstPath: string | undefined }) {
  if (!firstPath) {
    return null;
  }
  if (firstPath === "/cms") {
    return <OverviewPage />;
  }
  return <Navigate to={firstPath} replace />;
}

function DotsIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
      <circle cx="4.5" cy="10" r="1.5" />
      <circle cx="10" cy="10" r="1.5" />
      <circle cx="15.5" cy="10" r="1.5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <path d="M4 10.5L8 14.5L16 6" />
    </svg>
  );
}
