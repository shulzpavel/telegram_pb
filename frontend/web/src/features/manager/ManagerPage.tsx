import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Children, FormEvent, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { apiUrl } from "../../app/config";
import TaskTextBlock from "../../components/TaskTextBlock";
import { Alert, Badge, Button, ConfirmDialog, EmptyState, ScrollArea, Spinner, Surface, TextField, TextareaField, ThemeToggle, cn, useTheme, useToast, type ThemeMode } from "../../design-system";
import { cmsAuthApi } from "../cms/api/cmsClient";
import type { CmsPrincipal } from "../cms/api/cmsTypes";
import CmsLoginPage from "../cms/auth/CmsLoginPage";
import { normalizeOptionalNumber, normalizeOptionalText, parseBulkTasks } from "../cms/sessions/taskInput";
import { ManagerTopBar } from "./ManagerTopBar";
import { ManagerBottomDock } from "./ManagerBottomDock";
import { SessionTabsBar } from "./SessionTabsBar";
import { managerApi } from "./api/managerClient";
import type { CompletedTask, JiraPreview, ManagerSession, ManagerSessionRef, NamedVote, TaskItem, TaskMutation } from "./api/managerTypes";

const PHASE_META: Record<string, { label: string; tone: "info" | "success" | "warning" | "danger" | "neutral"; description: string }> = {
  waiting: { label: "Готовы к старту", tone: "warning",  description: "Очередь задач сформирована — ждём команду и жмём Start." },
  voting:  { label: "Идёт голосование", tone: "info",     description: "Карты розданы. Голоса видны только вам до Reveal." },
  results: { label: "Reveal — обсуждение", tone: "success", description: "Голоса раскрыты. Обсудите расхождения и зафиксируйте SP." },
  complete:{ label: "Сессия завершена", tone: "neutral", description: "Все задачи отыграны. Откройте отчёт или добавьте ещё задач." },
};

const STORAGE_KEY = "pp_manager_session";
const ESTIMATE_VALUES = [1, 2, 3, 5, 8, 13, 21, 34];

function canManage(principal: CmsPrincipal | null): boolean {
  return Boolean(principal?.is_superuser || principal?.permissions.includes("app.sessions.manage"));
}

/**
 * Shared theme sync between the CMS principal and the local theme provider.
 * - When the principal loads with a server-side preference different from the
 *   local one, the server value wins (mirrors the CMS shell behaviour).
 * - When the user flips the toggle locally, we push the new value back via
 *   PATCH /auth/me/preferences. Failures are tolerated.
 */
function useCmsPrincipalThemeSync(principal: CmsPrincipal | null): void {
  const { mode: themeMode, setMode: setThemeMode } = useTheme();
  const lastSyncedRef = useRef<ThemeMode | null>(null);

  useEffect(() => {
    if (!principal) {
      lastSyncedRef.current = null;
      return;
    }
    const remote = principal.theme_preference;
    if (!remote || remote === themeMode) {
      if (remote) lastSyncedRef.current = remote;
      return;
    }
    lastSyncedRef.current = remote;
    setThemeMode(remote);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [principal]);

  useEffect(() => {
    if (!principal) return;
    if (lastSyncedRef.current === themeMode) return;
    lastSyncedRef.current = themeMode;
    cmsAuthApi.updatePreferences({ theme_preference: themeMode }).catch((error) => {
      if (typeof console !== "undefined") {
        console.warn("[manager] failed to persist theme preference", error);
      }
    });
  }, [themeMode, principal]);
}

function readStoredSession(): ManagerSessionRef | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ManagerSessionRef;
    return typeof parsed.chatId === "number" ? parsed : null;
  } catch {
    return null;
  }
}

function storeSession(session: ManagerSession): ManagerSessionRef {
  const ref: ManagerSessionRef = {
    chatId: session.chat_id,
    topicId: session.topic_id,
    title: session.title,
    token: session.token,
    inviteUrl: session.invite_url,
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ref));
  return ref;
}

/**
 * Public helper for callers outside ManagerPage who just created a
 * session and want the cockpit to pick it up *without* regenerating a
 * fresh invite token on first render. Used by `/cms/sessions` "Новая
 * сессия" flow — we already have the token, no need to throw it away.
 */
export function storeManagerSession(session: ManagerSession): void {
  storeSession(session);
}

export default function ManagerPage() {
  const [principal, setPrincipal] = useState<CmsPrincipal | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [sessionRef, setSessionRef] = useState<ManagerSessionRef | null>(() => readStoredSession());
  // When the deep-link to /cms/sessions/<id>/cockpit references a
  // session that no longer exists (deleted from CMS history, mistyped
  // id, etc.) the `regenerateInvite` call below fails — we capture it
  // so the screen can show a graceful "сессия не найдена" instead of
  // dropping the user into the empty create-session shell.
  const [resolveError, setResolveError] = useState<string | null>(null);
  const search = new URLSearchParams(window.location.search);
  const wantsDemo = search.has("demo");
  // Two entry points are supported simultaneously to enable Option B of
  // the UX audit without breaking old links:
  //   /manage?chat_id=<id>            (legacy)
  //   /cms/sessions/<id>/cockpit      (new — opens the cockpit as the
  //                                    "detail view" of a CMS session)
  // The numeric source-of-truth is `requestedChatId`; both shapes feed
  // into it.
  const routeParams = useParams<{ id?: string }>();
  const requestedChatIdRaw = search.get("chat_id") ?? routeParams.id ?? null;
  const requestedChatId = requestedChatIdRaw ? Number(requestedChatIdRaw) : null;
  const requestedChatIdValid =
    requestedChatId !== null && Number.isFinite(requestedChatId);

  useEffect(() => {
    let alive = true;
    cmsAuthApi.me()
      .then((me) => { if (alive) setPrincipal(me); })
      .catch(() => { if (alive) setPrincipal(null); })
      .finally(() => { if (alive) setAuthLoading(false); });
    return () => { alive = false; };
  }, []);

  useCmsPrincipalThemeSync(principal);

  useEffect(() => {
    if (!wantsDemo || authLoading || !principal || !canManage(principal)) return;
    let alive = true;
    managerApi.demoSession(false)
      .then((demo) => {
        if (!alive) return;
        setSessionRef(storeSession(demo));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [authLoading, principal, wantsDemo]);

  // When CMS deep-links to /manage?chat_id=<id> we may need to switch the
  // cached session: a chat_id mismatch means the manager opened a different
  // session via "Open cockpit" and we should mint a fresh invite token for it
  // instead of resuming whatever was last in localStorage.
  useEffect(() => {
    if (!requestedChatIdValid || authLoading || !principal || !canManage(principal)) return;
    if (sessionRef && sessionRef.chatId === requestedChatId) {
      // We already have the session cached. Drop any stale resolve
      // error from a previous failed lookup so the screen doesn't
      // keep showing "сессия не найдена".
      if (resolveError) setResolveError(null);
      return;
    }
    let alive = true;
    setResolveError(null);
    (async () => {
      try {
        const fresh = await managerApi.regenerateInvite(requestedChatId as number, "Planning Poker", null);
        if (!alive) return;
        const nextRef: ManagerSessionRef = {
          chatId: requestedChatId as number,
          topicId: null,
          title: "Planning Poker",
          token: fresh.token,
          inviteUrl: fresh.invite_url,
        };
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextRef));
        setSessionRef(nextRef);
      } catch (err) {
        if (!alive) return;
        // Surface the failure so the user sees a recoverable "session
        // not found" screen instead of an empty cockpit. They can
        // jump back to the sessions list with one click.
        setResolveError(err instanceof Error ? err.message : "Не удалось открыть сессию");
      }
    })();
    return () => { alive = false; };
    // resolveError intentionally omitted — including it would cause an
    // infinite re-run loop the moment we clear the error above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, principal, requestedChatId, requestedChatIdValid, sessionRef]);

  if (authLoading) {
    return (
      <main className="flex min-h-screen-mobile items-center justify-center app-gradient-bg">
        <Spinner size="lg" />
      </main>
    );
  }

  // Phase 2 follow-up (A1): collapse the duplicate entry-points.
  // `/manage` was the legacy landing page for facilitators; after the
  // UX audit, CMS is the single source-of-truth for everything except
  // the actual cockpit/report screens. We keep these escape hatches:
  //   - `?demo=1`            (auto-create a demo session for tests)
  //   - `?chat_id=<id>`      (legacy bookmark that resolves to a real
  //                           session — same flow as before)
  //   - new tabbed routes    `/cms/sessions/:id/cockpit|report`
  // Anything else that lands on bare `/manage` is redirected.
  const onLegacyManageRoute =
    window.location.pathname === "/manage" && !requestedChatIdValid && !wantsDemo;

  if (!principal) {
    if (onLegacyManageRoute) {
      // Send the user to the unified CMS login. After signing in
      // they'll naturally see the sessions list — no more parallel
      // "Вход менеджера" landing.
      return <Navigate to="/cms/sessions" replace />;
    }
    const onCmsRoute = window.location.pathname.startsWith("/cms/");
    if (onCmsRoute) {
      return <CmsLoginPage onLogin={setPrincipal} />;
    }
    // Manager-login UI remains for the explicit legacy URLs that still
    // make sense as a direct entry (e.g. `/manage?chat_id=...` opened
    // from an old bookmark). For the bare `/manage` we already
    // redirected above.
    return <ManagerLogin onLogin={setPrincipal} />;
  }

  if (onLegacyManageRoute) {
    // Logged-in user hit the bare `/manage` — send them to the list
    // instead of the parallel "marketing" landing page. They can
    // create a session from there via the dialog (Option B).
    return <Navigate to="/cms/sessions" replace />;
  }

  if (!canManage(principal)) {
    return (
      <main className="flex min-h-screen-mobile items-center justify-center app-gradient-bg px-4 py-safe">
        <Surface className="max-w-md p-6">
          <h1 className="text-xl font-bold text-ink">Нет доступа к управлению сессиями</h1>
          <p className="mt-2 text-sm text-ink3">Нужен permission `app.sessions.manage`. Выдать его можно через CMS access management.</p>
          <Link className="mt-5 inline-flex text-sm font-semibold text-blue hover:text-blue2" to="/cms/access">Открыть access settings</Link>
        </Surface>
      </main>
    );
  }

  // Deep-link to a non-existent / deleted session: show a graceful
  // "session not found" page instead of dropping the user into the
  // create-session shell where they'd silently lose the URL context.
  if (resolveError && requestedChatIdValid && (!sessionRef || sessionRef.chatId !== requestedChatId)) {
    return (
      <main className="flex min-h-screen-mobile items-center justify-center app-gradient-bg px-4 py-safe">
        <Surface className="max-w-md p-6 text-center">
          <h1 className="text-xl font-bold text-ink">Сессия не найдена</h1>
          <p className="mt-2 text-sm text-ink3">
            Сессия с id <span className="font-mono text-ink2">{requestedChatId}</span> либо удалена из истории, либо была переименована. Вернитесь к списку — там видны все доступные сессии.
          </p>
          <p className="mt-3 text-xs text-ink4">{resolveError}</p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link
              to="/cms/sessions"
              className="inline-flex items-center justify-center rounded-md bg-blue px-4 py-2 text-sm font-semibold text-white hover:bg-blue2"
            >
              К списку сессий
            </Link>
            <Link
              to="/cms"
              className="inline-flex items-center justify-center rounded-md border border-line px-4 py-2 text-sm font-semibold text-ink hover:bg-line2"
            >
              На главную CMS
            </Link>
          </div>
        </Surface>
      </main>
    );
  }

  return (
    <ManagerWorkspace
      principal={principal}
      sessionRef={sessionRef}
      onSessionRef={setSessionRef}
    />
  );
}

function ManagerLogin({ onLogin }: { onLogin: (principal: CmsPrincipal) => void }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await cmsAuthApi.login(username, password);
      onLogin(await cmsAuthApi.me());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative grid min-h-screen-mobile app-gradient-bg px-4 pb-safe-6 pt-safe md:grid-cols-[minmax(0,1fr)_420px] md:px-8 md:pt-safe-4">
      <div className="absolute right-4 top-4 z-10">
        <ThemeToggle />
      </div>
      <section className="hidden min-h-[calc(100dvh-64px)] flex-col justify-between rounded-lg border border-line bg-surface px-8 py-7 md:flex">
        <div>
          <p className="text-sm font-semibold text-blue">Planning Poker</p>
          <h1 className="mt-5 max-w-xl text-4xl font-bold leading-tight text-ink">Рабочая комната для фасилитации оценки</h1>
          <p className="mt-4 max-w-lg text-base leading-7 text-ink3">Создайте сессию, соберите участников, подготовьте backlog и управляйте reveal/next без перехода в CMS.</p>
        </div>
        <div className="grid max-w-xl grid-cols-3 gap-3 text-sm">
          {["Lobby", "Queue", "Reveal"].map((item) => (
            <div key={item} className="rounded-lg border border-line bg-line2 px-3 py-3 font-semibold text-ink2">{item}</div>
          ))}
        </div>
      </section>
      <section className="flex items-center justify-center">
        <Surface as="form" className="w-full max-w-sm p-6" onSubmit={submit}>
          <h2 className="text-xl font-bold text-ink">Вход менеджера</h2>
          <p className="mt-1 text-sm text-ink3">Используется тот же аккаунт, что и для CMS.</p>
          <div className="mt-6 space-y-4">
            <TextField label="Username" value={username} onChange={(event) => setUsername(event.target.value)} />
            <TextField label="Password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
            {error ? <Alert tone="danger">{error}</Alert> : null}
            <Button type="submit" variant="primary" className="w-full" disabled={loading || !username || !password} loading={loading}>
              {loading ? "Вход" : "Войти"}
            </Button>
          </div>
        </Surface>
      </section>
    </main>
  );
}

/** Page size for paginated history — keeps the cockpit responsive even on
 *  long-running batches. Mirrors the backend default of 20. */
const HISTORY_PAGE_SIZE = 20;

/** Normalize an action-endpoint payload (returns the FULL completed list,
 *  unpaginated) into the partial-pagination shape the rest of the cockpit
 *  expects, so downstream consumers don't have to special-case it. */
function normalizeFullSession(raw: ManagerSession): ManagerSession {
  return {
    ...raw,
    completed_count: raw.completed_tasks.length,
    completed_next_cursor: null,
  };
}

/** Merge a paginated `state` refresh into the previous session snapshot.
 *  If the user has already manually paginated (loaded more than the first
 *  page), we keep the accumulated `completed_tasks` and just sync the
 *  authoritative `completed_count` from the server — otherwise we'd lose
 *  the user's current scroll/position on every poll. */
function mergePaginatedRefresh(
  prev: ManagerSession | null,
  next: ManagerSession,
): ManagerSession {
  const wasPaginated = next.completed_count !== undefined;
  if (!wasPaginated) {
    // Server returned the legacy unpaginated payload (e.g. action endpoint).
    return normalizeFullSession(next);
  }
  if (!prev) return next;
  const userPaginated = prev.completed_tasks.length > next.completed_tasks.length;
  if (!userPaginated) return next;
  return {
    ...next,
    completed_tasks: prev.completed_tasks,
    completed_next_cursor: prev.completed_next_cursor ?? null,
    // Keep total fresh from the server — it grows when a new task is
    // revealed/finished mid-session.
    completed_count: next.completed_count,
  };
}

function ManagerWorkspace({
  principal,
  sessionRef,
  onSessionRef,
}: {
  principal: CmsPrincipal;
  sessionRef: ManagerSessionRef | null;
  onSessionRef: (value: ManagerSessionRef | null) => void;
}) {
  const navigate = useNavigate();
  const [session, setSession] = useState<ManagerSession | null>(null);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [taskQuery, setTaskQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const toast = useToast();
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  /** Background prefetch cache for the next history page. Keyed by cursor
   *  so we never accidentally serve a stale entry. */
  const historyPrefetchRef = useRef<{ cursor: string; items: CompletedTask[]; nextCursor: string | null; total: number } | null>(null);

  const loadTasks = useCallback(async (
    ref: ManagerSessionRef,
    mode: "replace" | "append" = "replace",
    nextCursor: string | null = null,
  ) => {
    const page = await managerApi.tasks(ref.chatId, mode === "append" ? nextCursor : null, taskQuery, ref.topicId);
    setTasks((current) => mode === "append" ? [...current, ...page.items] : page.items);
    setCursor(page.next_cursor);
  }, [taskQuery]);

  const prefetchHistoryPage = useCallback((ref: ManagerSessionRef, fromCursor: string | null) => {
    if (!fromCursor) return;
    if (historyPrefetchRef.current?.cursor === fromCursor) return;
    void (async () => {
      try {
        const page = await managerApi.completed(ref.chatId, {
          cursor: fromCursor,
          limit: HISTORY_PAGE_SIZE,
          topicId: ref.topicId,
        });
        // Guard against rapid context switches — only keep the result if it
        // still corresponds to the latest cursor we tried to prefetch.
        if (historyPrefetchRef.current?.cursor !== fromCursor) {
          historyPrefetchRef.current = {
            cursor: fromCursor,
            items: page.items,
            nextCursor: page.next_cursor,
            total: page.total,
          };
        } else {
          historyPrefetchRef.current = {
            cursor: fromCursor,
            items: page.items,
            nextCursor: page.next_cursor,
            total: page.total,
          };
        }
      } catch {
        // Prefetch errors are silent — the next foreground click will
        // retry through the regular loadMoreHistory path.
      }
    })();
  }, []);

  const refresh = useCallback(async (silent = false) => {
    if (!sessionRef) return;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const next = await managerApi.state(
        sessionRef.chatId,
        sessionRef.title,
        sessionRef.topicId,
        HISTORY_PAGE_SIZE,
      );
      setSession((prev) => {
        const merged = mergePaginatedRefresh(prev, {
          ...next,
          token: sessionRef.token,
          invite_url: sessionRef.inviteUrl,
        });
        // Schedule a prefetch of the next history page (best-effort) so
        // "Show more" feels instant. We only do this when the user is on
        // the first page — otherwise their current next_cursor is already
        // tracked by historyPrefetchRef.
        const nextCursor = merged.completed_next_cursor ?? null;
        if (
          merged.completed_tasks.length <= HISTORY_PAGE_SIZE &&
          nextCursor &&
          historyPrefetchRef.current?.cursor !== nextCursor
        ) {
          prefetchHistoryPage(sessionRef, nextCursor);
        }
        return merged;
      });
      await loadTasks(sessionRef, "replace");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load session");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [loadTasks, prefetchHistoryPage, sessionRef]);

  const loadMoreHistory = useCallback(async () => {
    if (!sessionRef || !session) return;
    const cursor = session.completed_next_cursor ?? null;
    if (!cursor || historyLoadingMore) return;
    setHistoryLoadingMore(true);
    setHistoryError(null);
    try {
      const cached = historyPrefetchRef.current;
      let page;
      if (cached && cached.cursor === cursor) {
        page = { items: cached.items, next_cursor: cached.nextCursor, limit: HISTORY_PAGE_SIZE, total: cached.total };
        historyPrefetchRef.current = null;
      } else {
        page = await managerApi.completed(sessionRef.chatId, {
          cursor,
          limit: HISTORY_PAGE_SIZE,
          topicId: sessionRef.topicId,
        });
      }
      setSession((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          completed_tasks: [...prev.completed_tasks, ...page.items],
          completed_next_cursor: page.next_cursor,
          completed_count: page.total ?? prev.completed_count ?? prev.completed_tasks.length + page.items.length,
        };
      });
      // Kick off the next prefetch.
      if (page.next_cursor) {
        prefetchHistoryPage(sessionRef, page.next_cursor);
      }
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : "Не удалось загрузить историю");
    } finally {
      setHistoryLoadingMore(false);
    }
  }, [historyLoadingMore, prefetchHistoryPage, session, sessionRef]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!sessionRef) return;
    const timer = window.setInterval(() => {
      if (!busy) void refresh(true);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [busy, refresh, sessionRef]);

  // Validate the cached invite token once per session reference. Web tokens
  // live in Redis with an 8h TTL and may have been evicted (volume reset,
  // manager comes back the next day, etc.); without this, the manager would
  // happily copy a dead invite URL and participants would see "Session token
  // not found or expired" on /s/<token>.
  const cachedToken = sessionRef?.token ?? null;
  const cachedChatId = sessionRef?.chatId ?? null;
  const cachedTopicId = sessionRef?.topicId ?? null;
  const cachedTitle = sessionRef?.title ?? "Planning Poker";
  useEffect(() => {
    if (cachedChatId === null) return;
    let alive = true;

    const adoptFreshToken = async () => {
      try {
        const fresh = await managerApi.regenerateInvite(cachedChatId, cachedTitle, cachedTopicId);
        if (!alive) return;
        const nextRef: ManagerSessionRef = {
          chatId: cachedChatId,
          topicId: cachedTopicId,
          title: cachedTitle,
          token: fresh.token,
          inviteUrl: fresh.invite_url,
        };
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextRef));
        onSessionRef(nextRef);
      } catch {
        // Surfacing handled by the regular refresh path.
      }
    };

    if (!cachedToken) {
      void adoptFreshToken();
      return () => { alive = false; };
    }

    // The public web/state endpoint is the source of truth for token liveness.
    fetch(apiUrl(`/web/state/${encodeURIComponent(cachedToken)}`))
      .then((resp) => {
        if (!alive) return;
        if (resp.status === 404) {
          void adoptFreshToken();
        }
      })
      .catch(() => {
        // Network blip; the polling refresh will retry the broader path.
      });

    return () => { alive = false; };
  }, [cachedChatId, cachedTopicId, cachedToken, cachedTitle, onSessionRef]);

  async function createSession(title: string) {
    setBusy("create");
    setError(null);
    try {
      const created = await managerApi.createSession(title);
      const ref = storeSession(created);
      onSessionRef(ref);
      setSession(normalizeFullSession(created));
      setTasks([]);
      setCursor(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Session create failed");
    } finally {
      setBusy(null);
    }
  }

  /**
   * Rename the active session. The new title is persisted to the CMS read
   * model so /cms shows the same name; locally we update sessionRef +
   * localStorage so refreshes and child screens (FinishedSessionPage,
   * invite-regenerate paths) pick it up without a full reload.
   */
  const renameSession = useCallback(async (rawTitle: string): Promise<boolean> => {
    if (!sessionRef) return false;
    const trimmed = rawTitle.trim();
    if (!trimmed || trimmed === sessionRef.title) return false;
    setBusy("rename");
    setError(null);
    try {
      const result = await managerApi.renameSession(sessionRef.chatId, trimmed, sessionRef.topicId);
      const nextRef: ManagerSessionRef = { ...sessionRef, title: result.title };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextRef));
      onSessionRef(nextRef);
      setSession((prev) => (prev ? { ...prev, title: result.title } : prev));
      toast.success(`Сессия переименована в «${result.title}»`);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Rename failed";
      setError(message);
      toast.error(message, { title: "Не удалось переименовать" });
      return false;
    } finally {
      setBusy(null);
    }
  }, [sessionRef, onSessionRef, toast]);

  async function applyAction(label: string, action: () => Promise<ManagerSession | TaskMutation>) {
    if (!sessionRef) return;
    setBusy(label);
    setError(null);
    try {
      const result = await action();
      if ("state" in result) {
        // Action endpoints return the full unpaginated session — normalize
        // it through mergePaginatedRefresh so completed_count stays in
        // sync and downstream consumers don't have to special-case it.
        setSession((prev) =>
          mergePaginatedRefresh(prev, {
            ...result,
            token: sessionRef.token,
            invite_url: sessionRef.inviteUrl,
            title: sessionRef.title,
          }),
        );
        // Action returned the full list, so any cached prefetch is stale.
        historyPrefetchRef.current = null;
      }
      await loadTasks(sessionRef, "replace");
    } catch (err) {
      const message = err instanceof Error ? err.message : `${label} failed`;
      setError(message);
      if (label === "ai-summary") {
        toast.error(message, { title: "AI summary не сгенерирован" });
      }
    } finally {
      setBusy(null);
    }
  }

  // Auto-advance to the next task as soon as the manager picks a final SP.
  // Last-task case (no more tasks ahead) lands the session in phase=complete
  // and we stay put — the user explicitly hits "Open report" or adds more.
  const autoNextGuard = useRef<string | null>(null);
  function requestLeaveCockpit(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    setLeaveConfirmOpen(true);
  }

  const leaveCockpitConfirm = (
    <ConfirmDialog
      open={leaveConfirmOpen}
      title="Покинуть сессию?"
      description="Вы точно хотите покинуть текущую сессию и перейти на главную страницу?"
      confirmLabel="Перейти на главную"
      cancelLabel="Остаться"
      tone="primary"
      onConfirm={() => navigate("/")}
      onCancel={() => setLeaveConfirmOpen(false)}
    />
  );

  async function selectFinalEstimate(value: number) {
    if (!sessionRef || !session?.state.task) return;
    // Use the manager-only current_task_id (always present) as the dedup key
    // so we never auto-next twice for the same live task.
    const taskKey = session.current_task_id ?? session.state.task.task_id ?? "";
    if (!taskKey) return;
    if (autoNextGuard.current === taskKey) return;
    autoNextGuard.current = taskKey;
    setBusy("estimate");
    setError(null);
    try {
      await managerApi.finalEstimate(sessionRef.chatId, value);
      const advanced = await managerApi.next(sessionRef.chatId);
      setSession((prev) =>
        mergePaginatedRefresh(prev, {
          ...advanced,
          token: sessionRef.token,
          invite_url: sessionRef.inviteUrl,
          title: sessionRef.title,
        }),
      );
      historyPrefetchRef.current = null;
      await loadTasks(sessionRef, "replace");
    } catch (err) {
      autoNextGuard.current = null;
      setError(err instanceof Error ? err.message : "Final estimate failed");
    } finally {
      setBusy(null);
    }
  }

  async function finishAndOpenReport() {
    if (!sessionRef) return;
    setBusy("finish");
    setError(null);
    try {
      const finished = await managerApi.finish(sessionRef.chatId);
      setSession((prev) =>
        mergePaginatedRefresh(prev, {
          ...finished,
          token: sessionRef.token,
          invite_url: sessionRef.inviteUrl,
          title: sessionRef.title,
        }),
      );
      historyPrefetchRef.current = null;
      navigate(`/cms/sessions/${sessionRef.chatId}/report?title=${encodeURIComponent(sessionRef.title)}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Finish failed";
      setError(message);
      toast.error(message, { title: "Не удалось завершить сессию" });
    } finally {
      setBusy(null);
    }
  }

  if (!sessionRef || !session) {
    return (
      <main className="min-h-screen-mobile app-gradient-bg px-4 pb-safe-6 pt-safe md:px-8">
        <ManagerTopBar principal={principal} />
        <div className="mx-auto mt-10 max-w-xl">
          {error ? <Alert tone="danger" className="mb-4">{error}</Alert> : null}
          <CreateSessionPanel loading={busy === "create"} onCreate={createSession} />
          <Surface className="mt-4 p-4">
            <h2 className="text-sm font-bold text-ink">Быстрый тест на реальных задачах</h2>
            <p className="mt-1 text-sm text-ink3">Создаст живую demo session с Jira-like задачами и invite link.</p>
            <Button
              className="mt-3 w-full"
              disabled={busy !== null}
              onClick={() => {
                setBusy("demo");
                managerApi.demoSession(false)
                  .then((demo) => {
                    const ref = storeSession(demo);
                    onSessionRef(ref);
                    setSession(normalizeFullSession(demo));
                  })
                  .catch((err) => setError(err instanceof Error ? err.message : "Demo session failed"))
                  .finally(() => setBusy(null));
              }}
            >
              Открыть demo session
            </Button>
          </Surface>
        </div>
      </main>
    );
  }

  const phase = session.state.phase;
  const currentTask = session.state.task;
  const inviteUrl = session.invite_url ?? sessionRef.inviteUrl ?? "";

  // Wizard mode: queue is empty. Shown every time queue=0 (even after history)
  // so the manager always lands on a clear "add tasks" call-to-action.
  if (session.tasks_queue_count === 0) {
    const wizardFinishHandler = (session.completed_count ?? session.completed_tasks.length) > 0 ? finishAndOpenReport : undefined;
    return (
      <>
        <CockpitShell
          principal={principal}
          title={sessionRef.title}
          inviteUrl={inviteUrl}
          chatId={sessionRef.chatId}
          onFinishSession={wizardFinishHandler}
          finishBusy={busy === "finish"}
          onRename={renameSession}
          renameBusy={busy === "rename"}
          onLogoClick={requestLeaveCockpit}
        >
          <BacklogWizard
            chatId={sessionRef.chatId}
            tasksVersion={session.tasks_version}
            busy={busy}
            error={error}
            completedCount={session.completed_count ?? session.completed_tasks.length}
            onAction={applyAction}
          />
        </CockpitShell>
        {leaveCockpitConfirm}
      </>
    );
  }

  const backlogColumn = (
    <div className="flex flex-col gap-4 lg:h-full lg:min-h-0">
      <div className="hidden shrink-0 lg:block">
        <InviteCard inviteUrl={inviteUrl} />
      </div>
      <QueuePanel
        className="lg:min-h-0 lg:flex-1"
        tasks={tasks}
        query={taskQuery}
        cursor={cursor}
        busy={busy}
        tasksVersion={session.tasks_version}
        currentTaskId={session.current_task_id}
        completedTasks={session.completed_tasks}
        completedCount={session.completed_count ?? session.completed_tasks.length}
        onQuery={(value) => setTaskQuery(value)}
        onReload={() => { void refresh(); }}
        onLoadMore={() => sessionRef ? void loadTasks(sessionRef, "append", cursor) : undefined}
        onDelete={(task) => applyAction("delete", () => managerApi.deleteTask(sessionRef.chatId, task.task_uid, session.tasks_version))}
        onMove={(task, targetIndex) => applyAction("move", () => managerApi.moveTask(sessionRef.chatId, task.task_uid, targetIndex, session.tasks_version))}
        onUpdate={(task, summary) => applyAction("update", () => managerApi.updateTask(sessionRef.chatId, task.task_uid, {
          summary,
          jira_key: task.jira_key,
          url: task.url,
          story_points: task.story_points,
          expected_version: session.tasks_version,
        }))}
      />
    </div>
  );

  const controlColumn = (
    <div className="space-y-4">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <ControlRoom
        phase={phase}
        task={currentTask}
        participants={session.state.participants}
        liveVotes={session.current_task_votes}
        completedTasks={session.completed_tasks}
        completedCount={session.completed_count ?? session.completed_tasks.length}
        completedHasMore={Boolean(session.completed_next_cursor)}
        historyLoadingMore={historyLoadingMore}
        historyError={historyError}
        onLoadMoreHistory={() => { void loadMoreHistory(); }}
        results={session.state.results ?? null}
        loading={loading}
        busy={busy}
        canStart={session.tasks_queue_count > 0 && phase === "waiting"}
        onStart={() => applyAction("start", () => managerApi.start(sessionRef.chatId))}
        onReveal={() => applyAction("reveal", () => managerApi.reveal(sessionRef.chatId))}
        onGenerateAiSummary={() => applyAction("ai-summary", () => managerApi.generateAiSummary(sessionRef.chatId))}
        onNext={() => applyAction("next", () => managerApi.next(sessionRef.chatId))}
        onSkip={() => applyAction("skip", () => managerApi.skip(sessionRef.chatId))}
        onOpenReport={finishAndOpenReport}
        onFinalEstimate={selectFinalEstimate}
      />
    </div>
  );

  const settingsColumn = (
    <div className="space-y-4">
      <ParticipantsPanel participants={session.state.participants} />
      <TaskAddPanel
        chatId={sessionRef.chatId}
        tasksVersion={session.tasks_version}
        busy={busy}
        onAction={applyAction}
      />
    </div>
  );

  return (
    <>
      <CockpitShell
        principal={principal}
        title={sessionRef.title}
        inviteUrl={inviteUrl}
        chatId={sessionRef.chatId}
        onFinishSession={finishAndOpenReport}
        finishBusy={busy === "finish"}
        onRename={renameSession}
        renameBusy={busy === "rename"}
        onLogoClick={requestLeaveCockpit}
      >
        {backlogColumn}
        {controlColumn}
        {settingsColumn}
      </CockpitShell>
      {leaveCockpitConfirm}
    </>
  );
}

/**
 * Session cockpit shell: header + tabs stay fixed, content never grows
 * the document. On desktop the three columns fill the viewport and
 * scroll internally; on mobile the sections stack inside one scroll
 * region below the chrome (no "scroll the page to find the hint").
 */
type MobileCockpitTab = "session" | "queue" | "more";

const MOBILE_COCKPIT_TABS: { id: MobileCockpitTab; label: string }[] = [
  { id: "session", label: "Сессия" },
  { id: "queue", label: "Очередь" },
  { id: "more", label: "Ещё" },
];

function CockpitShell({
  principal,
  title,
  inviteUrl,
  chatId,
  onFinishSession,
  finishBusy,
  onRename,
  renameBusy,
  onLogoClick,
  children,
}: {
  principal: CmsPrincipal;
  title: string;
  inviteUrl: string;
  chatId: number;
  onFinishSession?: () => void;
  finishBusy?: boolean;
  onRename?: (title: string) => Promise<boolean>;
  renameBusy?: boolean;
  onLogoClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  /** Wizard: single child. Cockpit: three column fragments in order. */
  children: ReactNode;
}) {
  const childList = Children.toArray(children);
  const isWizard = childList.length === 1;
  const [mobileTab, setMobileTab] = useState<MobileCockpitTab>("session");

  return (
    <main className="flex h-screen-mobile flex-col overflow-hidden app-gradient-bg">
      <div className="shrink-0">
        <ManagerTopBar
          principal={principal}
          title={title}
          inviteUrl={inviteUrl}
          onFinishSession={onFinishSession}
          finishBusy={finishBusy}
          onRename={onRename}
          renameBusy={renameBusy}
          onLogoClick={onLogoClick}
        />
        <SessionTabsBar chatId={chatId} />
        {!isWizard ? (
          <div
            className="border-b border-line bg-surface px-3 lg:hidden"
            role="tablist"
            aria-label="Разделы cockpit"
          >
            <div className="flex w-full">
              {MOBILE_COCKPIT_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={mobileTab === tab.id}
                  onClick={() => setMobileTab(tab.id)}
                  className={cn(
                    "min-h-11 flex-1 basis-0 border-b-2 px-3 text-center text-sm font-semibold transition-colors",
                    mobileTab === tab.id
                      ? "border-blue text-blue"
                      : "border-transparent text-ink3 hover:text-ink",
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {isWizard ? (
        <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full pb-4 md:pb-safe-6" hint="Прокрутите ниже">
          <div className="mx-auto w-full max-w-3xl px-4 py-4 md:py-6">{children}</div>
        </ScrollArea>
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 lg:hidden">
            <div className="mx-auto w-full max-w-[1440px]">
              {mobileTab === "session" ? <div className="min-w-0">{childList[1]}</div> : null}
              {mobileTab === "queue" ? <div className="min-w-0">{childList[0]}</div> : null}
              {mobileTab === "more" ? <div className="min-w-0 space-y-4">{childList[2]}</div> : null}
            </div>
          </div>

          <div className="mx-auto hidden min-h-0 w-full max-w-[1440px] flex-1 grid-cols-[360px_minmax(0,1fr)_340px] gap-4 overflow-hidden px-4 py-4 lg:grid lg:px-6">
            <div className="min-h-0 h-full pr-1">{childList[0]}</div>
            <ScrollArea
              as="section"
              className="min-h-0 h-full min-w-0"
              viewportClassName="h-full pr-1"
              hint="Прокрутите панель"
            >
              {childList[1]}
            </ScrollArea>
            <ScrollArea
              as="aside"
              className="min-h-0 h-full"
              viewportClassName="h-full space-y-4 pr-1"
              hint="Ещё настройки"
            >
              {childList[2]}
            </ScrollArea>
          </div>
        </>
      )}

      <ManagerBottomDock
        principal={principal}
        currentTitle={title}
        inviteUrl={inviteUrl || undefined}
        onFinishSession={onFinishSession}
        finishBusy={finishBusy}
        onRename={onRename}
        renameBusy={renameBusy}
      />
    </main>
  );
}

function CreateSessionPanel({ loading, onCreate }: { loading: boolean; onCreate: (title: string) => Promise<void> }) {
  const [title, setTitle] = useState("Sprint planning");
  return (
    <Surface className="p-6">
      <h2 className="text-2xl font-bold text-ink">Новая planning session</h2>
      <p className="mt-2 text-sm leading-6 text-ink3">Сначала создайте комнату. После этого появится ссылка для участников, очередь задач и панель управления голосованием.</p>
      <div className="mt-6 space-y-4">
        <TextField label="Название" value={title} onChange={(event) => setTitle(event.target.value)} />
        <Button variant="primary" className="w-full" loading={loading} disabled={loading || !title.trim()} onClick={() => onCreate(title.trim())}>
          Создать сессию
        </Button>
      </div>
    </Surface>
  );
}

function InviteCard({ inviteUrl }: { inviteUrl: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(new URL(inviteUrl, window.location.origin).toString());
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }
  return (
    <Surface className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-ink">Ссылка для участников</h2>
          <p className="mt-1 break-all text-xs text-ink3">{new URL(inviteUrl, window.location.origin).toString()}</p>
        </div>
        <Button size="sm" variant="primary" onClick={copy}>{copied ? "Copied" : "Copy"}</Button>
      </div>
    </Surface>
  );
}

function QueuePanel({
  className,
  tasks,
  query,
  cursor,
  busy,
  tasksVersion,
  currentTaskId,
  completedTasks,
  completedCount,
  onQuery,
  onReload,
  onLoadMore,
  onDelete,
  onMove,
  onUpdate,
}: {
  className?: string;
  tasks: TaskItem[];
  query: string;
  cursor: string | null;
  busy: string | null;
  tasksVersion: number;
  currentTaskId: string | null;
  /**
   * Already-played tasks the cockpit currently knows about. May be a partial
   * list when paginated; pair with `completedCount` for the authoritative
   * total. Used here only to render the SP chip on tasks that have been
   * played already.
   */
  completedTasks: CompletedTask[];
  completedCount: number;
  onQuery: (value: string) => void;
  onReload: () => void;
  onLoadMore: () => void;
  onDelete: (task: TaskItem) => void;
  onMove: (task: TaskItem, targetIndex: number) => void;
  onUpdate: (task: TaskItem, summary: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [deleteTask, setDeleteTask] = useState<TaskItem | null>(null);
  const sortableIds = useMemo(() => tasks.map((task) => task.task_uid).filter(Boolean), [tasks]);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { delay: 140, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Map task_id → final SP so we can render a "✓ NSP" chip on already-played
  // rows. Tasks that are still alive in the queue but had their SP set
  // earlier also benefit (e.g. when the manager edits SP via final-estimate).
  const completedById = useMemo(() => {
    const map = new Map<string, CompletedTask>();
    for (const entry of completedTasks) map.set(entry.task_id, entry);
    return map;
  }, [completedTasks]);

  function handleDragEnd(event: DragEndEvent) {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    if (!overId || activeId === overId || busy !== null) return;

    const activeTask = tasks.find((task) => task.task_uid === activeId);
    const overTask = tasks.find((task) => task.task_uid === overId);
    if (!activeTask || !overTask) return;

    onMove(activeTask, overTask.bucket_index);
  }

  const queueList = tasks.length === 0 ? (
    <EmptyState title="Очередь пуста" description="Добавьте задачи вручную или импортируйте их из Jira." />
  ) : (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {tasks.map((task) => (
            <SortableQueueTaskCard
              key={task.task_uid}
              task={task}
              active={task.task_uid === currentTaskId}
              editing={editingId === task.task_uid}
              editValue={editValue}
              played={completedById.get(task.task_uid)}
              busy={busy}
              onEditValue={setEditValue}
              onStartEdit={() => { setEditingId(task.task_uid); setEditValue(task.summary); }}
              onCancelEdit={() => setEditingId(null)}
              onSaveEdit={() => {
                if (!editValue.trim()) return;
                onUpdate(task, editValue.trim());
                setEditingId(null);
              }}
              onDelete={() => setDeleteTask(task)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );

  return (
    <Surface className={cn("flex flex-col p-4 lg:h-full lg:min-h-0 lg:overflow-hidden", className)}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-ink">Backlog</h2>
          <p className="text-xs text-ink3">v{tasksVersion} · {tasks.length} loaded · {completedCount} сыграно</p>
        </div>
        <Button size="sm" variant="ghost" onClick={onReload}>Refresh</Button>
      </div>
      <TextField className="mt-3" aria-label="Search tasks" placeholder="Search by Jira key or summary" value={query} onChange={(event) => onQuery(event.target.value)} />
      <div className="mt-3 min-h-0 overflow-auto pr-1 lg:flex-1">
        {queueList}
      </div>
      {cursor ? <Button className="mt-3 w-full" variant="secondary" onClick={onLoadMore}>Load more</Button> : null}
      <ConfirmDialog
        open={Boolean(deleteTask)}
        title="Удалить задачу?"
        description={deleteTask?.summary ?? ""}
        confirmLabel="Delete"
        onCancel={() => setDeleteTask(null)}
        onConfirm={() => {
          if (deleteTask) onDelete(deleteTask);
          setDeleteTask(null);
        }}
      />
    </Surface>
  );
}

function SortableQueueTaskCard({
  task,
  active,
  editing,
  editValue,
  played,
  busy,
  onEditValue,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
}: {
  task: TaskItem;
  active: boolean;
  editing: boolean;
  editValue: string;
  played?: CompletedTask;
  busy: string | null;
  onEditValue: (value: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onDelete: () => void;
}) {
  const sortable = useSortable({
    id: task.task_uid,
    disabled: editing || busy !== null || !task.task_uid,
  });
  const finalSp = task.story_points ?? played?.story_points ?? null;
  const dragging = sortable.isDragging;

  return (
    <div
      ref={sortable.setNodeRef}
      style={{
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
        opacity: dragging ? 0.72 : 1,
      }}
      className={cn(
        "rounded-lg border bg-surface p-3",
        "touch-manipulation transition-[border-color,background-color,box-shadow]",
        dragging ? "shadow-pop ring-2 ring-blue/20" : "",
        active ? "border-blue bg-blue/5" : played ? "border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/50 dark:bg-emerald-900/10" : "border-line",
      )}
      {...sortable.attributes}
      {...sortable.listeners}
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5 w-7 shrink-0 text-right text-xs font-semibold tabular-nums text-ink4">{task.bucket_index + 1}</span>
        <div className="min-w-0 flex-1">
          {editing ? (
            <TextField
              aria-label="Task summary"
              value={editValue}
              onPointerDown={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key === "Enter" && editValue.trim()) onSaveEdit();
              }}
              onChange={(event) => onEditValue(event.target.value)}
            />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                {task.jira_key ? <Badge tone="info">{task.jira_key}</Badge> : <Badge>Manual</Badge>}
                {active ? <Badge tone="success">Current</Badge> : null}
                {played ? (
                  <Badge tone="success">
                    {finalSp !== null ? `✓ ${finalSp} SP` : "✓ Сыграна"}
                  </Badge>
                ) : null}
                {played?.consensus ? <Badge tone="info">Consensus</Badge> : null}
                <span className="text-2xs font-semibold uppercase tracking-wide text-ink4">Drag</span>
              </div>
              <p className="mt-2 text-sm font-semibold leading-5 text-ink">{task.summary}</p>
            </>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5 pl-9" onPointerDown={(event) => event.stopPropagation()}>
        {editing ? (
          <>
            <Button size="sm" variant="primary" disabled={!editValue.trim() || busy !== null} onClick={onSaveEdit}>Save</Button>
            <Button size="sm" variant="ghost" onClick={onCancelEdit}>Cancel</Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="ghost" onClick={onStartEdit}>Edit</Button>
            <Button size="sm" variant="danger" disabled={busy !== null} onClick={onDelete}>Delete</Button>
          </>
        )}
      </div>
    </div>
  );
}

function ControlRoom({
  phase,
  task,
  participants,
  liveVotes,
  completedTasks,
  completedCount,
  completedHasMore,
  historyLoadingMore,
  historyError,
  onLoadMoreHistory,
  results,
  loading,
  busy,
  canStart,
  onStart,
  onReveal,
  onGenerateAiSummary,
  onNext,
  onSkip,
  onOpenReport,
  onFinalEstimate,
}: {
  phase: string;
  task: ManagerSession["state"]["task"];
  participants: ManagerSession["state"]["participants"];
  liveVotes: NamedVote[];
  /** Currently-loaded slice of already-played tasks. Render only this list;
   *  `completedCount` is the authoritative server-side total. */
  completedTasks: CompletedTask[];
  completedCount: number;
  completedHasMore: boolean;
  historyLoadingMore: boolean;
  historyError: string | null;
  onLoadMoreHistory: () => void;
  results: NamedVote[] | null;
  loading: boolean;
  busy: string | null;
  canStart: boolean;
  onStart: () => void;
  onReveal: () => void;
  onGenerateAiSummary: () => void;
  onNext: () => void;
  onSkip: () => void;
  onOpenReport: () => void;
  onFinalEstimate: (value: number) => void;
}) {
  const meta = PHASE_META[phase] ?? PHASE_META.waiting;
  const votedCount = participants.filter((p) => p.voted).length;
  const totalVoters = participants.length;
  const progress = totalVoters > 0 ? votedCount / totalVoters : 0;

  // After reveal we trust `results`; before reveal, the manager-only `liveVotes`
  // is the source of truth (participants only see vote/not-voted booleans).
  const revealedVotes = phase === "results" ? (results ?? []) : [];

  return (
    <Surface className="relative isolate min-h-0 p-4 md:p-6">
      {/* PHASE HEADER --------------------------------------------------- */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={meta.tone}>{meta.label}</Badge>
            {task ? <span className="text-xs font-semibold text-ink3">Задача {task.index} из {task.total}</span> : null}
            {task?.jira_key ? <Badge tone="info">{task.jira_key}</Badge> : null}
          </div>
          <TaskTextBlock
            text={task?.text}
            fallback={phase === "complete" ? "Сессия завершена" : "Нет активной задачи"}
            titleClassName="text-xl md:text-3xl"
            linkClassName="md:text-base"
          />
          <p className="mt-2 text-sm text-ink3">{meta.description}</p>
        </div>
        <div className="rounded-lg border border-line bg-line2 px-4 py-3 text-right">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink3">Проголосовало</p>
          <p className="text-3xl font-bold tabular-nums text-ink">{votedCount}<span className="text-base text-ink3">/{totalVoters || "—"}</span></p>
          {totalVoters > 0 ? (
            <div className="mt-2 h-1.5 w-32 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full bg-blue transition-[width] duration-200" style={{ width: `${progress * 100}%` }} />
            </div>
          ) : null}
        </div>
      </div>

      {/* PRIMARY ACTIONS ------------------------------------------------
          Disabled-state hints: each button carries a `title` so a hover
          or screen reader explains *why* it's blocked, and we surface
          the same reason inline (`disabledReason`) below the row so
          mobile users — who can't hover for a tooltip — still see it.
          This closes the "disabled buttons without a reason" risk
          flagged in the UX audit. */}
      {(() => {
        const startDisabled = phase === "waiting" && !canStart;
        const noTask = (phase === "voting" || phase === "results") && !task;
        const disabledReason = startDisabled
          ? "Сначала добавьте задачи в очередь — выше есть кнопка «Добавить задачи»."
          : noTask
            ? "Ждём, пока появится текущая задача. Если очередь пуста, добавьте задачи или нажмите «Закрыть сессию»."
            : null;
        return (
          <>
            <div className="mt-6 flex flex-wrap gap-2">
              {phase === "waiting" ? (
                <Button
                  variant="primary"
                  size="lg"
                  disabled={!canStart || busy !== null}
                  loading={busy === "start" || loading}
                  onClick={onStart}
                  title={!canStart ? "Сначала добавьте задачи в очередь" : undefined}
                >
                  ▶ Начать голосование
                </Button>
              ) : null}
              {phase === "voting" ? (
                <>
                  <Button
                    variant="primary"
                    size="lg"
                    disabled={!task || busy !== null}
                    loading={busy === "reveal"}
                    onClick={onReveal}
                    title={!task ? "Текущей задачи нет — добавьте задачи в очередь" : undefined}
                  >
                    👁 Reveal — раскрыть голоса
                  </Button>
                  <Button
                    variant={task?.ai_summary ? "secondary" : "success"}
                    size="lg"
                    disabled={!task || busy !== null}
                    loading={busy === "ai-summary"}
                    onClick={onGenerateAiSummary}
                    title={!task ? "Сначала нужна текущая задача" : "Сгенерировать подсказку для оценки задачи"}
                  >
                    {task?.ai_summary ? "↻ Обновить AI summary" : "Generate AI summary"}
                  </Button>
                </>
              ) : null}
              {(phase === "voting" || phase === "results") ? (
                <>
                  <Button
                    variant="secondary"
                    disabled={!task || busy !== null}
                    loading={busy === "next"}
                    onClick={onNext}
                    title={!task ? "Нет текущей задачи" : undefined}
                  >
                    Next →
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={!task || busy !== null}
                    loading={busy === "skip"}
                    onClick={onSkip}
                    title={!task ? "Нет текущей задачи" : undefined}
                  >
                    Skip
                  </Button>
                </>
              ) : null}
              {phase === "complete" ? (
                <Button variant="primary" size="lg" onClick={onOpenReport}>
                  📊 Открыть отчёт сессии
                </Button>
              ) : null}
            </div>
            {disabledReason ? (
              <p className="mt-2 text-xs text-ink3" role="status" aria-live="polite">
                {disabledReason}
              </p>
            ) : null}
          </>
        );
      })()}

      {/* LIVE VOTING / RESULTS / FINAL SP ------------------------------- */}
      <div className="mt-6">
        {task?.ai_summary ? <AiSummaryPanel summary={task.ai_summary} /> : null}
        {phase === "waiting" ? (
          <EmptyState
            title="Готовы стартовать?"
            description={canStart ? "Жмите «Начать голосование» — участникам мгновенно прилетят карты." : "Сначала добавьте задачи в очередь."}
          />
        ) : phase === "voting" ? (
          <LiveVotesPanel participants={participants} liveVotes={liveVotes} />
        ) : phase === "results" ? (
          <ResultsPanel
            revealedVotes={revealedVotes}
            currentSp={task?.story_points ?? null}
            busy={busy}
            onFinalEstimate={onFinalEstimate}
          />
        ) : (
          <EmptyState
            title="Сессия завершена"
            description="Откройте отчёт или добавьте ещё задач в очередь, чтобы продолжить."
          />
        )}
      </div>

      {/* HISTORY STRIP -------------------------------------------------- */}
      {completedCount > 0 ? (
        <div className="mt-8 border-t border-line pt-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-ink">История этой сессии</h3>
            <span className="text-xs text-ink3">
              {completedTasks.length === completedCount
                ? `${completedCount} сыграно`
                : `Показано ${completedTasks.length} из ${completedCount}`}
            </span>
          </div>
          <HistoryStrip entries={completedTasks} />
          {historyError ? (
            <Alert tone="danger" className="mt-3">{historyError}</Alert>
          ) : null}
          {completedHasMore ? (
            <div className="mt-3 flex justify-center">
              <Button
                variant="secondary"
                size="sm"
                onClick={onLoadMoreHistory}
                disabled={historyLoadingMore}
                loading={historyLoadingMore}
              >
                Показать ещё
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </Surface>
  );
}

function AiSummaryPanel({ summary }: { summary: NonNullable<NonNullable<ManagerSession["state"]["task"]>["ai_summary"]> }) {
  const hasStructuredSp =
    typeof summary.sp_dev === "number" &&
    typeof summary.sp_test === "number" &&
    typeof summary.sp_final === "number";

  return (
    <Surface className="mb-4 border-blue/25 bg-blue/5 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="info">AI summary</Badge>
        <span className="text-xs text-ink3">Подсказка уже видна участникам</span>
      </div>
      <p className="mt-3 text-sm leading-6 text-ink2">{summary.description}</p>
      <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink3">Методы / зоны внимания</p>
          <ul className="mt-1 space-y-1 text-sm text-ink2">
            {summary.methods.map((method) => (
              <li key={method} className="flex gap-2">
                <span className="text-blue" aria-hidden="true">•</span>
                <span>{method}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink3">Оценка сложности от AI</p>
          <p className="mt-1 text-sm leading-6 text-ink2">{summary.complexity}</p>
        </div>
      </div>
      {hasStructuredSp ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg border border-line bg-surface px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink3">SP dev</p>
            <p className="mt-1 text-lg font-bold text-ink">{summary.sp_dev}</p>
          </div>
          <div className="rounded-lg border border-line bg-surface px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink3">SP test</p>
            <p className="mt-1 text-lg font-bold text-ink">{summary.sp_test}</p>
          </div>
          <div className="rounded-lg border border-blue/30 bg-blue/10 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink3">SP final</p>
            <p className="mt-1 text-lg font-bold text-blue">{summary.sp_final}</p>
            <p className="text-[11px] text-ink3">
              {summary.scale_label ?? "SP = max(SP dev, SP test)"}
            </p>
          </div>
        </div>
      ) : null}
      {summary.assumptions && summary.assumptions.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink3">Предположения / риски</p>
          <ul className="mt-1 space-y-1 text-sm text-ink2">
            {summary.assumptions.map((item) => (
              <li key={item} className="flex gap-2">
                <span className="text-blue" aria-hidden="true">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Surface>
  );
}

function LiveVotesPanel({
  participants,
  liveVotes,
}: {
  participants: ManagerSession["state"]["participants"];
  liveVotes: NamedVote[];
}) {
  // Build name → vote lookup so we can render the full roster with their
  // pick (or "ждёт"). Manager sees real values; participants UI only sees the
  // boolean voted flag.
  const voteByName = new Map<string, string>();
  for (const vote of liveVotes) voteByName.set(vote.name, vote.value);

  return (
    <div className="rounded-lg border border-line bg-line2 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink3">Голоса (видны только вам)</p>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {participants.length === 0 ? (
          <p className="text-sm text-ink3">Пока никого не подключилось — отправьте invite link.</p>
        ) : participants.map((participant, idx) => {
          const value = voteByName.get(participant.name);
          const voted = Boolean(value);
          return (
            <div
              key={`${participant.name}-${idx}`}
              className={cn(
                "grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3 rounded-lg border bg-surface px-3 py-2.5",
                voted ? "border-blue/30" : "border-line",
              )}
            >
              <span className="min-w-0 whitespace-normal break-all text-sm font-semibold leading-5 text-ink">
                {participant.name}
              </span>
              {voted ? (
                <span className="rounded-md bg-blue px-2 py-0.5 text-sm font-bold tabular-nums text-white">{value}</span>
              ) : (
                <span className="pt-0.5 text-xs font-semibold text-ink3">ждёт…</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ResultsPanel({
  revealedVotes,
  currentSp,
  busy,
  onFinalEstimate,
}: {
  revealedVotes: NamedVote[];
  currentSp: number | null;
  busy: string | null;
  onFinalEstimate: (value: number) => void;
}) {
  const distribution = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const vote of revealedVotes) counts[vote.value] = (counts[vote.value] ?? 0) + 1;
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [revealedVotes]);
  const max = distribution.reduce((acc, [, count]) => Math.max(acc, count), 1);

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-line bg-line2 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink3">Распределение голосов</p>
        {distribution.length === 0 ? (
          <p className="mt-2 text-sm text-ink3">Никто не проголосовал.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {distribution.map(([value, count]) => (
              <div key={value} className="flex items-center gap-3">
                <span className="w-10 shrink-0 rounded-md bg-blue px-2 py-1 text-center text-sm font-bold tabular-nums text-white">{value}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-line">
                  <div className="h-full rounded-full bg-blue" style={{ width: `${(count / max) * 100}%` }} />
                </div>
                <span className="w-12 shrink-0 text-right text-sm font-semibold tabular-nums text-ink2">×{count}</span>
              </div>
            ))}
          </div>
        )}
        {revealedVotes.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {revealedVotes.map((vote, idx) => (
              <span key={`${vote.name}-${idx}`} className="rounded-md border border-line bg-surface px-2 py-1 text-xs font-semibold text-ink2">
                {vote.name} → <span className="text-blue">{vote.value}</span>
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="rounded-lg border border-line bg-surface p-4">
        <p className="text-sm font-bold text-ink">Зафиксируйте итоговую оценку</p>
        <p className="mt-1 text-xs text-ink3">После выбора SP мы автоматически перейдём к следующей задаче.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {ESTIMATE_VALUES.map((value) => (
            <Button
              key={value}
              size="md"
              variant={currentSp === value ? "primary" : "secondary"}
              disabled={busy !== null}
              onClick={() => onFinalEstimate(value)}
            >
              {value}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

function HistoryStrip({ entries }: { entries: CompletedTask[] }) {
  // Reverse-chronological: latest played task first, so the manager always
  // sees the freshest decision without scrolling.
  const ordered = [...entries].reverse();
  return (
    <div className="mt-3 overflow-x-auto">
      <div className="flex gap-3 pb-1">
        {ordered.map((entry) => (
          <HistoryCard key={entry.task_id} entry={entry} />
        ))}
      </div>
    </div>
  );
}

function HistoryCard({ entry }: { entry: CompletedTask }) {
  const distribution = Object.entries(entry.distribution).sort((a, b) => b[1] - a[1]);
  const max = distribution.reduce((acc, [, count]) => Math.max(acc, count), 1);
  return (
    <div className="flex w-64 shrink-0 flex-col rounded-lg border border-line bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        {entry.jira_key ? <Badge tone="info">{entry.jira_key}</Badge> : <Badge>Manual</Badge>}
        {entry.story_points !== null ? (
          <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-bold tabular-nums text-emerald-700">{entry.story_points} SP</span>
        ) : (
          <span className="text-[11px] font-semibold uppercase text-ink4">no SP</span>
        )}
      </div>
      <p className="mt-2 break-words text-sm font-semibold text-ink">{entry.summary}</p>
      {distribution.length > 0 ? (
        <div className="mt-3 space-y-1">
          {distribution.slice(0, 4).map(([value, count]) => (
            <div key={value} className="flex items-center gap-2">
              <span className="w-6 text-right text-[11px] font-bold tabular-nums text-ink2">{value}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                <div className="h-full rounded-full bg-blue/70" style={{ width: `${(count / max) * 100}%` }} />
              </div>
              <span className="w-5 text-right text-[11px] font-semibold tabular-nums text-ink3">×{count}</span>
            </div>
          ))}
          {distribution.length > 4 ? (
            <p className="text-[11px] text-ink4">+{distribution.length - 4} ещё</p>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-[11px] text-ink4">Без голосов</p>
      )}
      {entry.consensus ? (
        <p className="mt-2 text-[11px] font-semibold text-emerald-600">Consensus</p>
      ) : null}
    </div>
  );
}

/**
 * Empty-queue landing for a session. Used in two situations:
 *  1. Brand-new session — facilitator just created it and needs to
 *     add the first batch of tasks.
 *  2. Mid-session lull — all queued tasks have been played and the
 *     queue dropped back to zero. The previous batch is still in
 *     `completed_count` but it is *not* the focus here.
 *
 * The screen is intentionally narrow in purpose: it explains what to
 * do next, shows three input methods (Manual / Bulk / Jira import),
 * and gets out of the way. Reading the previous report is *not* part
 * of this flow — it lives on the `Отчёт` tab (one click in the tab
 * bar at the top) and inside CMS. Surfacing it here was confusing
 * facilitators who just created a session and saw "open report"
 * pre-occupying the screen.
 */
function BacklogWizard({
  chatId,
  tasksVersion,
  busy,
  error,
  completedCount,
  onAction,
}: {
  chatId: number;
  tasksVersion: number;
  busy: string | null;
  error: string | null;
  completedCount: number;
  onAction: (label: string, action: () => Promise<ManagerSession | TaskMutation>) => Promise<void>;
}) {
  type Tab = "jira" | "manual" | "bulk";
  const [tab, setTab] = useState<Tab>("jira");
  const tabHints: Record<Tab, string> = {
    manual: "Добавьте одну задачу — название обязательно, Jira-ключ и URL по желанию.",
    bulk: "Вставьте список одной колонкой — каждая строка станет отдельной задачей в очереди.",
    jira: "Введите JQL и выберите задачи из результата. Появятся в очереди с ключом и ссылкой.",
  };
  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-6 md:py-10">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue">Шаг 1 из 2 — backlog</p>
        <h1 className="mt-2 text-2xl font-bold leading-tight text-ink md:text-3xl">
          Добавьте задачи в очередь
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-ink3 md:text-base">
          Без задач голосовать не из чего. Выберите способ ниже, добавьте хотя бы одну —
          и сразу откроется cockpit с управлением голосованием.
        </p>
      </div>

      {/* Step-by-step preview. Tiny, decorative — anchors the
          facilitator's mental model: "I'm here, this is what happens
          after." Plain text, no icons, so it stays readable at any
          contrast and renders without webfont quirks. */}
      <ol className="mx-auto mt-5 grid max-w-2xl gap-2 text-sm text-ink3 sm:grid-cols-3">
        <li className="rounded-md border border-blue/30 bg-blue/5 px-3 py-2 text-ink">
          <span className="block text-2xs font-semibold uppercase tracking-wide text-blue">сейчас</span>
          Добавьте задачи
        </li>
        <li className="rounded-md border border-line bg-surface px-3 py-2">
          <span className="block text-2xs font-semibold uppercase tracking-wide text-ink4">далее</span>
          Скопируйте invite и пригласите команду
        </li>
        <li className="rounded-md border border-line bg-surface px-3 py-2">
          <span className="block text-2xs font-semibold uppercase tracking-wide text-ink4">далее</span>
          Жмите «Начать голосование»
        </li>
      </ol>

      {error ? <Alert tone="danger" className="mt-6">{error}</Alert> : null}

      <div className="mt-7 flex border-b border-line">
        {(["jira", "manual", "bulk"] as Tab[]).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            aria-pressed={tab === value}
            className={cn(
              "min-h-11 flex-1 basis-0 border-b-2 px-3 py-2 text-center text-sm font-semibold",
              "transition-[border-color,color] duration-150 ease-out active:scale-[0.98]",
              tab === value
                ? "border-blue text-blue"
                : "border-transparent text-ink3 hover:text-ink",
            )}
          >
            {value === "jira" ? "Jira import" : value === "manual" ? "Manual" : "Bulk paste"}
          </button>
        ))}
      </div>

      {/* One-line hint tied to the active tab — keeps the page
          self-explanatory without forcing the user to look up docs. */}
      <p className="mt-2 text-center text-xs text-ink3 md:text-sm">{tabHints[tab]}</p>

      <div className="mt-4">
        {tab === "jira" ? (
          <WizardJiraForm chatId={chatId} tasksVersion={tasksVersion} busy={busy} onAction={onAction} />
        ) : tab === "manual" ? (
          <WizardManualForm chatId={chatId} tasksVersion={tasksVersion} busy={busy} onAction={onAction} />
        ) : (
          <WizardBulkForm chatId={chatId} tasksVersion={tasksVersion} busy={busy} onAction={onAction} />
        )}
      </div>

      {/* History acknowledgement — neutral, no CTA. If the facilitator
          wants the report, they go to the `Отчёт` tab one row up. */}
      {completedCount > 0 ? (
        <p className="mt-8 text-center text-xs text-ink4">
          В этой сессии уже сыграно {completedCount} {completedCount === 1 ? "задача" : completedCount < 5 ? "задачи" : "задач"}.
          {" "}
          <span className="text-ink3">История доступна на вкладке «Отчёт» выше.</span>
        </p>
      ) : null}
    </section>
  );
}

/**
 * Mobile-only sticky footer for wizard forms.
 *
 * On viewports < md the wrapper attaches itself to the bottom of the
 * visual viewport so the primary action stays reachable while the user
 * scrolls long forms (Bulk paste, Jira preview). The negative margins
 * cancel `Surface` padding so the footer visually extends to the card
 * edges, and `pb-safe-4` reserves space for the iOS home indicator.
 *
 * On md+ the wrapper degrades to a plain block — desktop layouts have
 * room for the CTA inline, no need to overlay it on top of the form.
 */
function MobileStickyFormFooter({ children }: { children: React.ReactNode }) {
  // Stays inline. The persistent "copy invite / finish / menu" strip
  // is now owned by `ManagerBottomDock`, so we no longer pin the
  // form's primary action to the viewport bottom — that would double
  // up against the dock at 320–414px and force the user to scroll
  // through a tower of overlapping controls.
  return <div className="mt-4">{children}</div>;
}

function WizardManualForm({
  chatId,
  tasksVersion,
  busy,
  onAction,
}: {
  chatId: number;
  tasksVersion: number;
  busy: string | null;
  onAction: (label: string, action: () => Promise<ManagerSession | TaskMutation>) => Promise<void>;
}) {
  const [summary, setSummary] = useState("");
  const [jiraKey, setJiraKey] = useState("");
  return (
    <Surface className="p-5">
      <p className="text-sm font-semibold text-ink">Одна задача</p>
      <p className="mt-1 text-xs text-ink3">Удобно для первой задачи или быстрых добавок.</p>
      <div className="mt-4 space-y-3">
        <TextField label="Summary" value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="Например: Подключить email-нотификации" />
        <TextField label="Jira key (опционально)" value={jiraKey} onChange={(event) => setJiraKey(event.target.value)} placeholder="PRJ-123" />
      </div>
      <MobileStickyFormFooter>
        <Button
          variant="primary"
          className="w-full"
          disabled={!summary.trim() || busy !== null}
          onClick={() => onAction("add", async () => {
            const result = await managerApi.addTask(chatId, {
              summary: summary.trim(),
              jira_key: normalizeOptionalText(jiraKey),
              expected_version: tasksVersion,
            });
            setSummary("");
            setJiraKey("");
            return result;
          })}
        >
          Добавить и продолжить
        </Button>
      </MobileStickyFormFooter>
    </Surface>
  );
}

function WizardBulkForm({
  chatId,
  tasksVersion,
  busy,
  onAction,
}: {
  chatId: number;
  tasksVersion: number;
  busy: string | null;
  onAction: (label: string, action: () => Promise<ManagerSession | TaskMutation>) => Promise<void>;
}) {
  const [bulk, setBulk] = useState("");
  const bulkTasks = useMemo(() => parseBulkTasks(bulk), [bulk]);
  return (
    <Surface className="p-5">
      <p className="text-sm font-semibold text-ink">Множество задач</p>
      <p className="mt-1 text-xs text-ink3">Одна задача в строку. Формат: <code>JIRA-123 Резюме</code> или просто <code>Резюме</code>.</p>
      <TextareaField className="mt-4" label="Список задач" value={bulk} onChange={(event) => setBulk(event.target.value)} rows={8} />
      <MobileStickyFormFooter>
        <Button
          variant="primary"
          className="w-full"
          disabled={bulkTasks.length === 0 || busy !== null}
          onClick={() => onAction("bulk", async () => {
            const result = await managerApi.addTasksBulk(chatId, bulkTasks, tasksVersion);
            setBulk("");
            return result;
          })}
        >
          Добавить {bulkTasks.length || ""} задач
        </Button>
      </MobileStickyFormFooter>
    </Surface>
  );
}

function WizardJiraForm({
  chatId,
  tasksVersion,
  busy,
  onAction,
}: {
  chatId: number;
  tasksVersion: number;
  busy: string | null;
  onAction: (label: string, action: () => Promise<ManagerSession | TaskMutation>) => Promise<void>;
}) {
  const [jql, setJql] = useState("");
  const [preview, setPreview] = useState<JiraPreview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  async function runPreview() {
    setPreviewBusy(true);
    setPreviewError(null);
    try {
      const data = await managerApi.jiraPreview(chatId, jql, 500);
      setPreview(data);
      setSelected(new Set(data.items.filter((item) => !item.duplicate).map((item) => item.key)));
      if (data.items.length === 0) {
        setPreviewError("Jira не вернула задач по этому JQL. Проверьте фильтр и доступы к проекту.");
      }
    } catch (err) {
      setPreview(null);
      setSelected(new Set());
      setPreviewError(err instanceof Error ? err.message : "Не удалось получить задачи из Jira");
    } finally {
      setPreviewBusy(false);
    }
  }

  return (
    <Surface className="p-5">
      <p className="text-sm font-semibold text-ink">Импорт из Jira</p>
      <p className="mt-1 text-xs text-ink3">После preview отметьте нужные задачи.</p>
      <TextareaField
        className="mt-4"
        label="JQL"
        placeholder="Пользуйтесь поиском задач в Jira через JQL"
        value={jql}
        onChange={(event) => setJql(event.target.value)}
        rows={3}
      />
      {previewError ? <Alert tone="danger" className="mt-4">{previewError}</Alert> : null}
      {/* Preview list is rendered above the sticky CTA so its `max-h-64`
          scroll area always fits between the JQL field and the action
          bar — neither overlaps the other when the keyboard opens. */}
      {preview ? (
        <ScrollArea className="mt-4 max-h-64 rounded-lg border border-line" viewportClassName="max-h-64" hint="Ещё задачи">
          <div className="sticky top-0 border-b border-line bg-surface px-3 py-2 text-xs font-semibold text-ink3">
            {preview.importable}/{preview.total} importable · {selected.size} selected
          </div>
          {preview.items.map((item) => (
            <label key={item.key} className="flex gap-2 border-b border-line px-3 py-2 last:border-b-0">
              <input
                type="checkbox"
                className="mt-1"
                checked={selected.has(item.key)}
                disabled={item.duplicate}
                onChange={(event) => {
                  const next = new Set(selected);
                  if (event.target.checked) next.add(item.key);
                  else next.delete(item.key);
                  setSelected(next);
                }}
              />
              <span className="min-w-0">
                <span className="text-xs font-bold text-blue">{item.key}</span>
                <span className="block text-xs text-ink3">{item.summary}</span>
              </span>
            </label>
          ))}
        </ScrollArea>
      ) : null}

      <MobileStickyFormFooter>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            disabled={!jql.trim() || busy !== null || previewBusy}
            loading={previewBusy}
            onClick={() => { void runPreview(); }}
          >
            Preview
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            disabled={!preview || selected.size === 0 || busy !== null}
            onClick={() => onAction("jira-import", async () => {
              const result = await managerApi.jiraImport(chatId, {
                jql,
                selected_keys: [...selected],
                expected_version: tasksVersion,
              });
              setPreview(null);
              setSelected(new Set());
              return result;
            })}
          >
            Импортировать {selected.size || ""}
          </Button>
        </div>
      </MobileStickyFormFooter>
    </Surface>
  );
}

function ParticipantsPanel({ participants }: { participants: ManagerSession["state"]["participants"] }) {
  return (
    <Surface className="p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-ink">Участники</h2>
        <Badge>{participants.length}</Badge>
      </div>
      <div className="mt-3 space-y-2">
        {participants.length === 0 ? (
          <EmptyState title="Пока никого" description="Отправьте invite link команде." />
        ) : participants.map((participant, idx) => (
          <div key={`${participant.name}-${idx}`} className="flex items-center justify-between rounded-lg border border-line bg-line2 px-3 py-2">
            <span className="min-w-0 whitespace-normal break-words text-sm font-semibold text-ink">{participant.name}</span>
            <Badge tone={participant.voted ? "success" : "neutral"}>{participant.voted ? "voted" : "waiting"}</Badge>
          </div>
        ))}
      </div>
    </Surface>
  );
}

function TaskAddPanel({
  chatId,
  tasksVersion,
  busy,
  onAction,
}: {
  chatId: number;
  tasksVersion: number;
  busy: string | null;
  onAction: (label: string, action: () => Promise<ManagerSession | TaskMutation>) => Promise<void>;
}) {
  const [summary, setSummary] = useState("");
  const [jiraKey, setJiraKey] = useState("");
  const [storyPoints, setStoryPoints] = useState("");
  const [bulk, setBulk] = useState("");
  const [jql, setJql] = useState("");
  const [preview, setPreview] = useState<JiraPreview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const bulkTasks = useMemo(() => parseBulkTasks(bulk), [bulk]);

  async function previewJira() {
    const data = await managerApi.jiraPreview(chatId, jql, 500);
    setPreview(data);
    setSelected(new Set(data.items.filter((item) => !item.duplicate).map((item) => item.key)));
    return {
      ok: true,
      tasks_version: tasksVersion,
      current_task_id: null,
      tasks_queue_count: 0,
      task: null,
      tasks: [],
      deleted_task_id: null,
    };
  }

  return (
    <div className="space-y-4">
      <Surface className="p-4">
        <h2 className="text-sm font-bold text-ink">Jira import</h2>
        <TextareaField
          className="mt-3"
          label="JQL"
          placeholder="Пользуйтесь поиском задач в Jira через JQL"
          value={jql}
          onChange={(event) => setJql(event.target.value)}
        />
        <div className="mt-3 flex gap-2">
          <Button className="flex-1" disabled={!jql.trim() || busy !== null} onClick={() => onAction("jira-preview", previewJira)}>
            Preview
          </Button>
          <Button
            className="flex-1"
            variant="primary"
            disabled={!preview || selected.size === 0 || busy !== null}
            onClick={() => onAction("jira-import", async () => {
              const result = await managerApi.jiraImport(chatId, {
                jql,
                selected_keys: [...selected],
                expected_version: tasksVersion,
              });
              setPreview(null);
              setSelected(new Set());
              return result;
            })}
          >
            Import
          </Button>
        </div>
        {preview ? (
          <ScrollArea className="mt-3 max-h-56 rounded-lg border border-line" viewportClassName="max-h-56" hint="Ещё задачи">
            <div className="sticky top-0 border-b border-line bg-surface px-3 py-2 text-xs font-semibold text-ink3">
              {preview.importable}/{preview.total} importable · {selected.size} selected
            </div>
            {preview.items.map((item) => (
              <label key={item.key} className="flex gap-2 border-b border-line px-3 py-2 last:border-b-0">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={selected.has(item.key)}
                  disabled={item.duplicate}
                  onChange={(event) => {
                    const next = new Set(selected);
                    if (event.target.checked) next.add(item.key);
                    else next.delete(item.key);
                    setSelected(next);
                  }}
                />
                <span className="min-w-0">
                  <span className="text-xs font-bold text-blue">{item.key}</span>
                  <span className="block text-xs text-ink3">{item.summary}</span>
                </span>
              </label>
            ))}
          </ScrollArea>
        ) : null}
      </Surface>

      <Surface className="p-4">
        <h2 className="text-sm font-bold text-ink">Manual task</h2>
        <div className="mt-3 space-y-3">
          <TextField label="Summary" value={summary} onChange={(event) => setSummary(event.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <TextField label="Jira key" value={jiraKey} onChange={(event) => setJiraKey(event.target.value)} />
            <TextField label="SP" value={storyPoints} onChange={(event) => setStoryPoints(event.target.value)} />
          </div>
          <Button
            className="w-full"
            variant="primary"
            disabled={!summary.trim() || busy !== null}
            onClick={() => onAction("add", async () => {
              const result = await managerApi.addTask(chatId, {
                summary: summary.trim(),
                jira_key: normalizeOptionalText(jiraKey),
                story_points: normalizeOptionalNumber(storyPoints),
                expected_version: tasksVersion,
              });
              setSummary("");
              setJiraKey("");
              setStoryPoints("");
              return result;
            })}
          >
            Add task
          </Button>
        </div>
      </Surface>

      <Surface className="p-4">
        <h2 className="text-sm font-bold text-ink">Bulk paste</h2>
        <TextareaField className="mt-3" label="One task per line" value={bulk} onChange={(event) => setBulk(event.target.value)} />
        <Button
          className="mt-3 w-full"
          disabled={bulkTasks.length === 0 || busy !== null}
          onClick={() => onAction("bulk", async () => {
            const result = await managerApi.addTasksBulk(chatId, bulkTasks, tasksVersion);
            setBulk("");
            return result;
          })}
        >
          Add {bulkTasks.length || ""} tasks
        </Button>
      </Surface>

    </div>
  );
}
