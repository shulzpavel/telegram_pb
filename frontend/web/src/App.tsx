import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { PageLoader, ScrollHint, ThemeProvider, ToastProvider } from "./design-system";

// Each route ships its own bundle so the manager-only code (DnD, Jira import,
// finished-session report) doesn't tax the participant page, and vice versa.
// Suspense is shared by all routes — `PageLoader` matches the canvas
// background so the transition feels like part of the layout, not a flash.
const CmsPage = lazy(() => import("./pages/CmsPage"));
const DemoPage = lazy(() => import("./pages/DemoPage"));
const FinishedSessionPage = lazy(() => import("./features/manager/FinishedSessionPage"));
const LandingPage = lazy(() => import("./pages/LandingPage"));
const ManagerPage = lazy(() => import("./features/manager/ManagerPage"));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"));
const SessionPage = lazy(() => import("./pages/SessionPage"));

function SessionDetailIndex() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/cms/sessions/${id}/cockpit`} replace />;
}

export default function App() {
  return (
    <ThemeProvider defaultMode="dark">
      <ToastProvider>
        <BrowserRouter>
          <Suspense fallback={<PageLoader rows={4} />}>
            <Routes>
              {/* Root is the public landing page. Authenticated entry points
                  (cockpit, CMS) are linked from there. */}
              <Route path="/" element={<LandingPage />} />
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
              <Route path="/demo" element={<DemoPage />} />
              {/* Anything else falls through to the friendly mascot. */}
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
          <ScrollHint />
        </BrowserRouter>
      </ToastProvider>
    </ThemeProvider>
  );
}
