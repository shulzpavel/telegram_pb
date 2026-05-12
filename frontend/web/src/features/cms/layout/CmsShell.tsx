import { lazy, Suspense, useMemo } from "react";
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { Button, SelectField } from "../../../design-system";
import { cmsAuthApi } from "../api/cmsClient";
import type { CmsPrincipal } from "../api/cmsTypes";
import { InlineError, Skeleton } from "../components/CmsPrimitives";
import { CMS_PERMISSIONS, hasPermission, visibleCmsTabs } from "../navigation";

const AccessPage = lazy(() => import("../access/AccessPage"));
const AuditEventsPage = lazy(() => import("../events/AuditEventsPage"));
const OverviewPage = lazy(() => import("../overview/OverviewPage"));
const SessionsPage = lazy(() => import("../sessions/SessionsPage"));
const TokensPage = lazy(() => import("../tokens/TokensPage"));
const UsersPage = lazy(() => import("../users/UsersPage"));
const VotesPage = lazy(() => import("../votes/VotesPage"));
const WebParticipantsPage = lazy(() => import("../webParticipants/WebParticipantsPage"));

export default function CmsShell({
  principal,
  onLogout,
}: {
  principal: CmsPrincipal;
  onLogout: () => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const visibleTabs = useMemo(() => visibleCmsTabs(principal), [principal]);
  const canManageAccess = hasPermission(principal, CMS_PERMISSIONS.accessManage);
  const canManageTasks = hasPermission(principal, CMS_PERMISSIONS.tasksManage);
  const activePath = useMemo(() => {
    const activeTab = visibleTabs.find((item) => {
      if (item.path === "/cms") {
        return location.pathname === "/cms" || location.pathname === "/cms/overview";
      }
      return location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
    });
    return activeTab?.path ?? visibleTabs[0]?.path ?? "";
  }, [location.pathname, visibleTabs]);

  async function logout() {
    await cmsAuthApi.logout().catch(() => undefined);
    onLogout();
  }

  return (
    <main className="min-h-dvh bg-canvas">
      <header className="border-b border-line bg-surface">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold text-ink">Planning Poker CMS</h1>
            <p className="text-xs text-ink3">
              {principal.display_name || principal.username}
              {principal.is_superuser ? " · superuser" : ""}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={logout}>Logout</Button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-5 space-y-5">
        {visibleTabs.length === 0 ? <InlineError text="No CMS pages are available for this account." /> : null}

        <SelectField
          className="md:hidden"
          value={activePath}
          onChange={(event) => navigate(event.target.value)}
          aria-label="CMS section"
        >
          {visibleTabs.map((item) => (
            <option key={item.key} value={item.path}>
              {item.label}
            </option>
          ))}
        </SelectField>

        <nav
          className="hidden md:flex md:flex-nowrap md:gap-2 md:overflow-x-auto md:border-b md:border-line"
          aria-label="CMS sections"
        >
          {visibleTabs.map((item) => (
            <NavLink
              key={item.key}
              to={item.path}
              end={item.key === "overview"}
              className={({ isActive }) =>
                [
                  "shrink-0 whitespace-nowrap px-3 py-2 text-sm font-semibold border-b-2",
                  isActive ? "border-blue text-blue" : "border-transparent text-ink3 hover:text-ink",
                ].join(" ")
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <Suspense fallback={<Skeleton height="h-48" />}>
          <Routes>
            <Route index element={<CmsIndexRedirect firstPath={visibleTabs[0]?.path} />} />
            {hasPermission(principal, CMS_PERMISSIONS.overview) ? (
              <Route path="overview" element={<Navigate to="/cms" replace />} />
            ) : null}
            {hasPermission(principal, CMS_PERMISSIONS.sessions) ? (
              <Route path="sessions" element={<SessionsPage canManageTasks={canManageTasks} />} />
            ) : null}
            {hasPermission(principal, CMS_PERMISSIONS.users) ? <Route path="users" element={<UsersPage />} /> : null}
            {hasPermission(principal, CMS_PERMISSIONS.votes) ? <Route path="votes" element={<VotesPage />} /> : null}
            {hasPermission(principal, CMS_PERMISSIONS.tokens) ? <Route path="tokens" element={<TokensPage />} /> : null}
            {hasPermission(principal, CMS_PERMISSIONS.web) ? <Route path="web" element={<WebParticipantsPage />} /> : null}
            {hasPermission(principal, CMS_PERMISSIONS.events) ? <Route path="events" element={<AuditEventsPage />} /> : null}
            {hasPermission(principal, CMS_PERMISSIONS.access) ? (
              <Route
                path="access"
                element={<AccessPage canManage={canManageAccess} currentAdminId={principal.id} />}
              />
            ) : null}
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
