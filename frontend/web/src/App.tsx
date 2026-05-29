import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { DeferredFallback, PageLoader, RouteTransition, ScrollHint, ThemeProvider, ToastProvider } from "./design-system";

// Each route ships its own bundle so the manager-only code (DnD, Jira import,
// finished-session report) doesn't tax the participant page, and vice versa.
// Suspense is shared by all routes — `PageLoader` matches the canvas
// background so the transition feels like part of the layout, not a flash.
const CmsPage = lazy(() => import("./pages/CmsPage"));
const DemoPage = lazy(() => import("./pages/DemoPage"));
const FinishedSessionPage = lazy(() => import("./features/manager/FinishedSessionPage"));
const LandingPage = lazy(() => import("./pages/LandingPage"));
const ManagerPage = lazy(() => import("./features/manager/ManagerPage"));
const ForbiddenPage = lazy(() => import("./pages/ForbiddenPage"));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"));
const SessionPage = lazy(() => import("./pages/SessionPage"));
const RetroPage = lazy(() => import("./pages/RetroPage"));

function SessionDetailIndex() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/cms/sessions/${id}/cockpit`} replace />;
}

function LandingRouteLoader() {
  return (
    <main className="flex min-h-screen-mobile items-center justify-center app-gradient-bg px-4">
      <span className="relative block h-1 w-full max-w-xs overflow-hidden rounded-full bg-line2/80" aria-hidden="true">
        <span className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-line animate-[skeleton-shimmer_1.2s_var(--ease-out-soft)_infinite]" />
      </span>
    </main>
  );
}

export default function App() {
  return (
    <ThemeProvider defaultMode="dark">
      <ToastProvider>
        <BrowserRouter>
          <AppRoutes />
          <ScrollHint />
        </BrowserRouter>
      </ToastProvider>
    </ThemeProvider>
  );
}

function AppRoutes() {
  const location = useLocation();

  return (
    <Suspense
      fallback={(
        <DeferredFallback>
          <PageLoader rows={4} />
        </DeferredFallback>
      )}
    >
      <RouteTransition transitionKey={location.pathname}>
        <Routes location={location}>
          {/* Root is the public landing page. Authenticated entry points
              (cockpit, CMS) are linked from there. */}
          <Route
            path="/"
            element={
              <Suspense
                fallback={(
                  <DeferredFallback>
                    <LandingRouteLoader />
                  </DeferredFallback>
                )}
              >
                <LandingPage />
              </Suspense>
            }
          />
          {/* Option B alias routes (UX audit recommendation): the
              cockpit and report screens are conceptually the
              "detail view" of a CMS session. We expose them under
              `/cms/sessions/:id/*` so the URL bar tells the user
              *where* they are (inside CMS, on session N), without
              rebuilding either screen from scratch.

              Order in React Router v6 doesn't matter — these
              paths are more specific than `/cms/*` and therefore
              win route ranking. The legacy `/manage/*` paths
              below still resolve so existing bookmarks and the
              in-app deep-links keep working. */}
          <Route path="/cms/sessions/:id/cockpit" element={<ManagerPage />} />
          <Route path="/cms/sessions/:id/report" element={<FinishedSessionPage />} />
          {/* Index for the session detail. We always default to
              the cockpit tab — if the session is already finished,
              the cockpit screen handles it gracefully (and the
              tab-bar surfaces "Отчёт" right next to it for one
              more click). This means deep-links of the form
              `/cms/sessions/<id>` never 404. */}
          <Route path="/cms/sessions/:id" element={<SessionDetailIndex />} />
          <Route path="/cms/*" element={<CmsPage />} />
          <Route path="/manage" element={<ManagerPage />} />
          <Route path="/manage/finished/:chatId" element={<FinishedSessionPage />} />
          <Route path="/s/:token" element={<SessionPage />} />
          <Route path="/r/:token" element={<RetroPage />} />
          <Route path="/demo" element={<DemoPage />} />
          <Route path="/403" element={<ForbiddenPage />} />
          {/* Anything else falls through to the friendly mascot. */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </RouteTransition>
    </Suspense>
  );
}
