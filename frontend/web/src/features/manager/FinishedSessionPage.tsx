import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Alert,
  Badge,
  BottomSheet,
  Button,
  EmptyState,
  ListSkeleton,
  MobileBottomDock,
  SheetItem,
  Spinner,
  Surface,
  ThemeMenuControl,
  useTheme,
  type ThemeMode,
} from "../../design-system";
import { useProgressiveList } from "../../hooks/useProgressiveList";
import { cmsAuthApi, hasCmsAuthHint } from "../cms/api/cmsClient";
import type { CmsPrincipal } from "../cms/api/cmsTypes";
import { managerApi } from "./api/managerClient";
import type { CompletedTask, JiraStoryPointsSyncResult, SessionSummary } from "./api/managerTypes";
import { ManagerSessionChrome } from "./ManagerSessionChrome";

/** Page size for the completed-tasks list. Mirrors backend default of 20. */
const TASKS_PAGE_SIZE = 20;
const MANAGER_SESSION_STORAGE_KEY = "pp_manager_session";

function toSafeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizeSummaryStats(stats: SessionSummary["stats"] | null | undefined): SessionSummary["stats"] {
  return {
    total_completed: toSafeNumber(stats?.total_completed),
    with_estimate: toSafeNumber(stats?.with_estimate),
    consensus_count: toSafeNumber(stats?.consensus_count),
    votes_cast: toSafeNumber(stats?.votes_cast),
    total_story_points: toSafeNumber(stats?.total_story_points),
  };
}

function useFinishedThemeSync(principal: CmsPrincipal | null): void {
  const { mode, setMode } = useTheme();
  const lastSyncedRef = useRef<ThemeMode | null>(null);

  useEffect(() => {
    if (!principal) {
      lastSyncedRef.current = null;
      return;
    }
    const remote = principal.theme_preference;
    if (!remote || remote === mode) {
      if (remote) lastSyncedRef.current = remote;
      return;
    }
    lastSyncedRef.current = remote;
    setMode(remote);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [principal]);

  useEffect(() => {
    if (!principal) return;
    if (lastSyncedRef.current === mode) return;
    lastSyncedRef.current = mode;
    cmsAuthApi.updatePreferences({ theme_preference: mode }).catch((error) => {
      if (typeof console !== "undefined") {
        console.warn("[finished-session] failed to persist theme preference", error);
      }
    });
  }, [mode, principal]);
}

function canManage(principal: CmsPrincipal | null): boolean {
  return Boolean(principal?.is_superuser || principal?.permissions.includes("app.sessions.manage"));
}

function formatDuration(startedAt: string | null, finishedAt: string | null): string | null {
  if (!startedAt || !finishedAt) return null;
  const startedMs = Date.parse(startedAt);
  const finishedMs = Date.parse(finishedAt);
  if (!Number.isFinite(startedMs) || !Number.isFinite(finishedMs)) return null;
  const deltaSec = Math.max(0, Math.round((finishedMs - startedMs) / 1000));
  if (deltaSec < 60) return `${deltaSec} сек`;
  const minutes = Math.floor(deltaSec / 60);
  const seconds = deltaSec % 60;
  return seconds === 0 ? `${minutes} мин` : `${minutes} мин ${seconds} сек`;
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return value;
  return new Date(ms).toLocaleString();
}

export default function FinishedSessionPage() {
  // Supports both legacy `/manage/finished/:chatId` and the new
  // `/cms/sessions/:id/report` route (Option B). React Router will
  // populate whichever key matches the active route — the other is
  // undefined.
  const params = useParams<{ chatId?: string; id?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const chatId = Number(params.chatId ?? params.id);
  const title = searchParams.get("title") ?? "Planning Poker";

  const [principal, setPrincipal] = useState<CmsPrincipal | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [jiraSyncBusy, setJiraSyncBusy] = useState(false);
  const [jiraSyncResult, setJiraSyncResult] = useState<JiraStoryPointsSyncResult | null>(null);
  const [jiraSyncError, setJiraSyncError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (!hasCmsAuthHint()) {
      setPrincipal(null);
      setAuthLoading(false);
      return () => { alive = false; };
    }
    cmsAuthApi.me()
      .then((me) => { if (alive) setPrincipal(me); })
      .catch(() => { if (alive) setPrincipal(null); })
      .finally(() => { if (alive) setAuthLoading(false); });
    return () => { alive = false; };
  }, []);

  useFinishedThemeSync(principal);

  useEffect(() => {
    if (!Number.isFinite(chatId)) {
      setError("Некорректный chat_id");
      setLoading(false);
      return;
    }
    if (authLoading || !principal || !canManage(principal)) return;
    let alive = true;
    setLoading(true);
    // Request a paginated payload — the first page of completed_tasks plus a
    // cursor for the rest. Stats are always exact (server computes them
    // against the full batch, regardless of pagination).
    managerApi.summary(chatId, title, null, TASKS_PAGE_SIZE)
      .then((data) => { if (alive) setSummary(data); })
      .catch((err) => { if (alive) setError(err instanceof Error ? err.message : "Не удалось загрузить отчёт"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [authLoading, chatId, principal, title]);

  if (authLoading) {
    return (
      <main className="flex min-h-screen-mobile items-center justify-center app-gradient-bg"><Spinner size="lg" /></main>
    );
  }

  if (!principal) {
    return (
      <main className="flex min-h-screen-mobile items-center justify-center app-gradient-bg px-4 py-safe">
        <Surface className="max-w-md p-6 text-center">
          <h1 className="text-xl font-bold text-ink">Требуется вход</h1>
          <p className="mt-2 text-sm text-ink3">Откройте отчёт после авторизации в Manager cockpit.</p>
          <Link to="/manage" className="mt-4 inline-flex text-sm font-semibold text-blue hover:text-blue2">Перейти ко входу</Link>
        </Surface>
      </main>
    );
  }

  if (!canManage(principal)) {
    return (
      <main className="flex min-h-screen-mobile items-center justify-center app-gradient-bg px-4 py-safe">
        <Surface className="max-w-md p-6 text-center">
          <h1 className="text-xl font-bold text-ink">Нет доступа</h1>
          <p className="mt-2 text-sm text-ink3">Нужен permission `app.sessions.manage`.</p>
        </Surface>
      </main>
    );
  }

  const canDownload = Boolean(summary && summary.completed_tasks.length > 0);
  const stats = normalizeSummaryStats(summary?.stats);
  const canSyncJira = Boolean(summary && stats.total_completed > 0);

  async function syncJiraSp() {
    if (!summary || !Number.isFinite(chatId)) return;
    setJiraSyncBusy(true);
    setJiraSyncError(null);
    try {
      const result = await managerApi.syncJiraStoryPoints(chatId, summary.topic_id);
      setJiraSyncResult(result);
    } catch (err) {
      setJiraSyncResult(null);
      setJiraSyncError(err instanceof Error ? err.message : "Не удалось записать SP в Jira");
    } finally {
      setJiraSyncBusy(false);
    }
  }

  function downloadCsv() {
    if (!summary) return;
    const href = managerApi.summaryCsvUrl(chatId, summary.title, summary.topic_id);
    window.location.assign(href);
  }

  function downloadMarkdown() {
    if (!summary) return;
    const href = managerApi.summaryMarkdownUrl(chatId, summary.title, summary.topic_id);
    window.location.assign(href);
  }

  return (
    <main className="min-h-screen-mobile app-gradient-bg md:pb-safe-6">
      <ManagerSessionChrome
        principal={principal}
        title={summary?.title ?? title}
        chatId={Number.isFinite(chatId) ? chatId : undefined}
        trailingActions={
          <>
            <Button
              size="sm"
              variant="secondary"
              disabled={!canSyncJira || jiraSyncBusy}
              loading={jiraSyncBusy}
              onClick={() => { void syncJiraSp(); }}
              className="hidden lg:inline-flex"
            >
              Jira SP
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={!canDownload}
              onClick={downloadCsv}
              className="hidden md:inline-flex"
            >
              CSV
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={!canDownload}
              onClick={downloadMarkdown}
              className="hidden md:inline-flex"
            >
              MD
            </Button>
            <Button size="sm" variant="ghost" onClick={() => navigate("/manage")} className="hidden md:inline-flex">
              Cockpit
            </Button>
          </>
        }
      />

      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-6">
        {error ? <Alert tone="danger" className="mb-4">{error}</Alert> : null}
        {jiraSyncError ? <Alert tone="danger" className="mb-4">{jiraSyncError}</Alert> : null}
        {jiraSyncResult ? (
          <JiraSyncResultPanel result={jiraSyncResult} className="mb-4" />
        ) : null}

        {loading || !summary ? (
          <FinishedSummarySkeleton />
        ) : (
          // Re-mount the body whenever chatId changes so the progressive
          // list seed is consumed cleanly (the hook only honors the seed
          // on first load for a given paramsKey).
          <FinishedSummaryBody
            key={chatId}
            chatId={chatId}
            summary={summary}
          />
        )}
      </div>

      {/* Mobile bottom dock — mirrors ManagerBottomDock pattern so the
          report screen feels like part of the same family. Primary
          download stays the first thumb-reachable action; cockpit
          and overflow menu come next. */}
      <MobileBottomDock aria-label="Действия отчёта" contentClassName="max-w-6xl">
          <Button
            variant="secondary"
            className="min-h-12 shrink-0 px-3"
            disabled={!canSyncJira || jiraSyncBusy}
            loading={jiraSyncBusy}
            onClick={() => { void syncJiraSp(); }}
          >
            Jira SP
          </Button>
          <Button
            variant="primary"
            className="flex-1 min-h-12"
            disabled={!canDownload}
            onClick={downloadMarkdown}
          >
            Скачать MD
          </Button>
          <Button
            variant="ghost"
            className="min-h-12"
            onClick={() => navigate("/manage")}
          >
            Cockpit
          </Button>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Открыть меню"
            className="inline-flex min-h-12 w-12 items-center justify-center rounded-md border border-line bg-surface text-ink transition-colors hover:bg-line2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue/40 active:scale-[0.96] motion-reduce:active:scale-100"
          >
            <DotsIcon />
          </button>
      </MobileBottomDock>

      <BottomSheet
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        title="Меню отчёта"
        description={summary?.title ?? title}
      >
        <div className="space-y-2 px-1 pb-2">
          <SheetItem
            label="Записать SP в Jira"
            description={canSyncJira ? "Обновить Story Points в Jira по завершённому батчу" : "Нет сыгранных задач"}
            disabled={!canSyncJira || jiraSyncBusy}
            onClick={() => {
              setMobileMenuOpen(false);
              void syncJiraSp();
            }}
          />
          <SheetItem
            label="Скачать MD"
            description={canDownload ? "Красивый отчёт для Confluence" : "Нет задач для экспорта"}
            disabled={!canDownload}
            onClick={() => {
              setMobileMenuOpen(false);
              downloadMarkdown();
            }}
          />
          <SheetItem
            label="Скачать CSV"
            description={canDownload ? "Табличный лог задач и оценок" : "Нет задач для экспорта"}
            disabled={!canDownload}
            onClick={() => {
              setMobileMenuOpen(false);
              downloadCsv();
            }}
          />
          <SheetItem
            label="Открыть cockpit"
            description="Вернуться к управлению сессией"
            onClick={() => {
              setMobileMenuOpen(false);
              navigate("/manage");
            }}
          />
          <ThemeMenuControl />
        </div>
      </BottomSheet>
    </main>
  );
}

function JiraSyncResultPanel({ result, className = "" }: { result: JiraStoryPointsSyncResult; className?: string }) {
  const tone =
    result.failed.length === 0 && result.skipped.length === 0
      ? "success"
      : result.updated > 0
        ? "warning"
        : "danger";

  return (
    <Alert tone={tone} className={className}>
      <p className="font-semibold text-ink">
        Jira: обновлено {result.updated}
        {result.failed.length > 0 ? `, ошибок ${result.failed.length}` : ""}
        {result.skipped.length > 0 ? `, пропущено ${result.skipped.length}` : ""}
      </p>
      {result.failed.length > 0 ? (
        <p className="mt-2 text-sm text-ink2">
          <span className="font-semibold">Не удалось:</span> {result.failed.join(", ")}
        </p>
      ) : null}
      {result.skipped.length > 0 ? (
        <ul className="mt-2 list-inside list-disc text-sm text-ink2">
          {result.skipped.slice(0, 8).map((line) => (
            <li key={line}>{line}</li>
          ))}
          {result.skipped.length > 8 ? (
            <li className="list-none text-ink3">…и ещё {result.skipped.length - 8}</li>
          ) : null}
        </ul>
      ) : null}
    </Alert>
  );
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

function FinishedSummarySkeleton() {
  return (
    <div className="space-y-6">
      <Surface className="p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="rounded-lg border border-line bg-line2 px-4 py-3">
              <div className="h-3 w-24 animate-pulse rounded bg-line" />
              <div className="mt-2 h-6 w-16 animate-pulse rounded bg-line" />
            </div>
          ))}
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, idx) => (
            <div key={idx} className="space-y-1.5">
              <div className="h-3 w-20 animate-pulse rounded bg-line2" />
              <div className="h-4 w-32 animate-pulse rounded bg-line2" />
            </div>
          ))}
        </div>
      </Surface>
      <Surface className="overflow-hidden p-3">
        <ListSkeleton rows={4} />
      </Surface>
    </div>
  );
}

function FinishedSummaryBody({
  chatId,
  summary,
}: {
  chatId: number;
  summary: SessionSummary;
}) {
  const navigate = useNavigate();
  const [reopenBusy, setReopenBusy] = useState<string | null>(null);
  const [reopenError, setReopenError] = useState<string | null>(null);

  const duration = useMemo(() => formatDuration(summary.started_at, summary.finished_at), [summary]);
  const stats = useMemo(() => normalizeSummaryStats(summary.stats), [summary.stats]);
  const total = stats.total_completed;
  const isPaginated = summary.completed_next_cursor !== undefined;

  // Stable identity for the seed so re-renders of `summary` (e.g. after
  // `useFinishedThemeSync` mutates principal-related state) don't reset
  // the progressive list. The cursor + first-page items only change when
  // we re-fetch the summary entirely (different chatId / forced reload).
  const seed = useMemo(
    () => ({
      items: summary.completed_tasks,
      nextCursor: summary.completed_next_cursor ?? null,
      total: total,
    }),
    // We deliberately key on the cursor + first-page identity so the seed
    // is stable across unrelated re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [summary.completed_next_cursor, summary.completed_tasks, total],
  );

  const fetchPage = useCallback(
    async ({
      cursor,
      limit,
      signal,
    }: {
      cursor: string | null;
      limit: number;
      params: void;
      signal: AbortSignal;
    }) => {
      const page = await managerApi.summaryTasks(
        chatId,
        { cursor, limit, topicId: summary.topic_id },
        { signal },
      );
      return {
        items: page.items,
        next_cursor: page.next_cursor,
        total: page.total,
      };
    },
    [chatId, summary.topic_id],
  );

  const list = useProgressiveList<CompletedTask, void>(
    fetchPage,
    undefined,
    {
      pageSize: TASKS_PAGE_SIZE,
      // Finished sessions are immutable, but a long batch can still be
      // hundreds of tasks long. Keep a generous cap so most reports load
      // entirely without forcing the user to refine, but still bail out at
      // very long batches.
      softCap: 400,
      seed: isPaginated ? seed : null,
      scrollKey: `finished-summary-${chatId}`,
    },
  );

  // When the summary is unpaginated (legacy fallback or empty), render
  // straight from `summary.completed_tasks`. Otherwise render the
  // progressive list.
  const items = isPaginated ? list.items : summary.completed_tasks;

  const reopenTask = useCallback(
    async (taskId: string) => {
      setReopenBusy(taskId);
      setReopenError(null);
      try {
        const updated = await managerApi.reopenCompletedTask(
          chatId,
          taskId,
          summary.topic_id,
        );
        window.localStorage.setItem(
          MANAGER_SESSION_STORAGE_KEY,
          JSON.stringify({
            chatId: updated.chat_id,
            topicId: updated.topic_id,
            title: updated.title,
            token: updated.token,
            inviteUrl: updated.invite_url,
          }),
        );
        navigate("/manage");
      } catch (err) {
        setReopenError(err instanceof Error ? err.message : "Не удалось переоткрыть задачу");
      } finally {
        setReopenBusy(null);
      }
    },
    [chatId, navigate, summary.topic_id],
  );

  return (
    <div className="space-y-6">
      {reopenError ? <Alert tone="danger">{reopenError}</Alert> : null}
      {/* META + STATS */}
      <Surface className="p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label="Сыграно задач" value={stats.total_completed.toString()} />
          <StatCard label="С итоговой оценкой" value={`${stats.with_estimate} / ${stats.total_completed}`} />
          <StatCard label="TOTAL SP" value={stats.total_story_points.toString()} />
          <StatCard label="Consensus" value={`${stats.consensus_count} / ${stats.total_completed}`} />
          <StatCard label="Голосов отдано" value={stats.votes_cast.toString()} />
        </div>
        <div className="mt-5 grid gap-3 text-sm text-ink3 sm:grid-cols-3">
          <MetaRow label="Старт">{formatDateTime(summary.started_at)}</MetaRow>
          <MetaRow label="Завершение">{formatDateTime(summary.finished_at)}</MetaRow>
          <MetaRow label="Длительность">{duration ?? "—"}</MetaRow>
        </div>
        <div className="mt-3 text-sm text-ink3">
          <span className="font-semibold text-ink2">Участники:</span>{" "}
          {summary.participants.length === 0 ? <span>—</span> : summary.participants.join(", ")}
        </div>
      </Surface>

      {/* TASKS TABLE */}
      {items.length === 0 ? (
        <Surface className="p-6">
          <EmptyState
            title="В этой сессии ещё нет сыгранных задач"
            description="Вернитесь в cockpit и сыграйте хотя бы одну задачу — таблица заполнится автоматически."
          />
        </Surface>
      ) : (
        <Surface className="overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-line bg-line2 px-5 py-3">
            <h2 className="text-sm font-bold text-ink">Результаты по задачам</h2>
            <span className="text-xs text-ink3">
              {items.length === total ? `${total} задач` : `Показано ${items.length} из ${total}`}
            </span>
          </div>
          {/* Mobile: compact cards (no horizontal scroll). */}
          <ul className="flex flex-col gap-3 bg-canvas p-3 md:hidden">
            {items.map((entry, idx) => (
              <TaskCard
                key={entry.task_id}
                index={idx + 1}
                entry={entry}
                reopenBusy={reopenBusy}
                onReopen={reopenTask}
              />
            ))}
          </ul>
          {/* Desktop: regular table; cells use break-words / fixed max-widths
              so the table never pushes the page sideways. */}
          <div className="hidden md:block">
            <table className="w-full table-auto divide-y divide-line text-sm">
              <thead className="bg-surface text-left text-xs font-semibold uppercase tracking-wide text-ink3">
                <tr>
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Jira</th>
                  <th className="px-4 py-3">Summary</th>
                  <th className="px-4 py-3 text-center">SP</th>
                  <th className="px-4 py-3 text-center">Голоса</th>
                  <th className="px-4 py-3">Распределение</th>
                  <th className="px-4 py-3">Consensus</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {items.map((entry, idx) => (
                  <TaskRow
                    key={entry.task_id}
                    index={idx + 1}
                    entry={entry}
                    reopenBusy={reopenBusy}
                    onReopen={reopenTask}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {isPaginated ? (
            <FinishedTasksFooter
              loadingMore={list.loadingMore}
              hasMore={list.hasMore}
              reachedCap={list.reachedCap}
              error={list.error}
              loadedCount={items.length}
              total={total}
              onMore={() => { void list.loadMore(); }}
            />
          ) : null}
        </Surface>
      )}
    </div>
  );
}

function FinishedTasksFooter({
  loadingMore,
  hasMore,
  reachedCap,
  error,
  loadedCount,
  total,
  onMore,
}: {
  loadingMore: boolean;
  hasMore: boolean;
  reachedCap: boolean;
  error: string | null;
  loadedCount: number;
  total: number;
  onMore: () => void;
}) {
  if (reachedCap) {
    return (
      <div className="border-t border-line bg-canvas px-4 py-3 text-center text-xs text-ink2">
        Показано {loadedCount} задач из {total}. Чтобы увидеть оставшиеся, скачайте полный CSV — браузер не справится с таким DOM.
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2 border-t border-line bg-canvas px-4 py-3">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {hasMore ? (
        <Button variant="secondary" size="sm" onClick={onMore} loading={loadingMore} disabled={loadingMore}>
          Показать ещё
        </Button>
      ) : (
        <span className="text-xs text-ink3">Показаны все {total} задач</span>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-line2 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink3">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-ink">{value}</p>
    </div>
  );
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-ink3">{label}</p>
      <p className="mt-1 text-sm text-ink2">{children}</p>
    </div>
  );
}

function TaskRow({
  index,
  entry,
  reopenBusy,
  onReopen,
}: {
  index: number;
  entry: CompletedTask;
  reopenBusy: string | null;
  onReopen: (taskId: string) => void;
}) {
  const distribution = Object.entries(entry.distribution).sort((a, b) => b[1] - a[1]);
  const max = distribution.reduce((acc, [, count]) => Math.max(acc, count), 1);

  return (
    <tr className="align-top hover:bg-line2/40">
      <td className="px-4 py-3 text-xs font-semibold tabular-nums text-ink3">{index}</td>
      <td className="px-4 py-3">
        {entry.jira_key ? (
          entry.url ? (
            <a className="text-xs font-bold text-blue hover:underline" href={entry.url} target="_blank" rel="noreferrer">{entry.jira_key}</a>
          ) : (
            <span className="text-xs font-bold text-blue">{entry.jira_key}</span>
          )
        ) : <span className="text-xs text-ink4">Manual</span>}
      </td>
      <td className="px-4 py-3">
        <p className="max-w-[28rem] break-words font-semibold text-ink">{entry.summary}</p>
      </td>
      <td className="px-4 py-3 text-center">
        <div className="flex flex-col items-center gap-2">
          {entry.story_points !== null ? (
            <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-sm font-bold tabular-nums text-emerald-700">{entry.story_points}</span>
          ) : (
            <span className="text-xs text-ink4">—</span>
          )}
          <Button
            size="sm"
            variant="secondary"
            disabled={reopenBusy !== null}
            loading={reopenBusy === entry.task_id}
            onClick={() => { void onReopen(entry.task_id); }}
          >
            Переоценить
          </Button>
        </div>
      </td>
      <td className="px-4 py-3 text-center text-sm font-semibold tabular-nums text-ink2">{entry.voter_count}</td>
      <td className="px-4 py-3">
        {distribution.length === 0 ? (
          <span className="text-xs text-ink4">—</span>
        ) : (
          <div className="min-w-[160px] space-y-1">
            {distribution.map(([value, count]) => (
              <div key={value} className="flex items-center gap-2">
                <span className="w-7 text-right text-[11px] font-bold tabular-nums text-ink2">{value}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                  <div className="h-full rounded-full bg-blue/70" style={{ width: `${(count / max) * 100}%` }} />
                </div>
                <span className="w-7 text-right text-[11px] font-semibold tabular-nums text-ink3">×{count}</span>
              </div>
            ))}
          </div>
        )}
        {entry.votes.length > 0 ? (
          <details className="mt-2 text-xs text-ink3">
            <summary className="cursor-pointer select-none font-semibold text-ink2 hover:text-blue">По участникам</summary>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {entry.votes.map((vote, idx) => (
                <span key={`${vote.name}-${idx}`} className="rounded-md border border-line bg-surface px-2 py-0.5 text-[11px] font-semibold text-ink2">
                  {vote.name} → <span className="text-blue">{vote.value}</span>
                </span>
              ))}
            </div>
          </details>
        ) : null}
      </td>
      <td className="px-4 py-3">
        {entry.consensus ? (
          <Badge tone="success">Consensus</Badge>
        ) : (
          <span className="text-xs text-ink4">—</span>
        )}
      </td>
    </tr>
  );
}

/** Mobile-only compact card for the finished-tasks list. Mirrors the data
 *  available in `TaskRow` but stacks vertically so we never produce a
 *  horizontal scroll inside the page. */
function TaskCard({
  index,
  entry,
  reopenBusy,
  onReopen,
}: {
  index: number;
  entry: CompletedTask;
  reopenBusy: string | null;
  onReopen: (taskId: string) => void;
}) {
  const distribution = Object.entries(entry.distribution).sort((a, b) => b[1] - a[1]);
  const max = distribution.reduce((acc, [, count]) => Math.max(acc, count), 1);
  return (
    <li className="rounded-xl border border-line bg-surface p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold tabular-nums text-ink3">#{index}</p>
          {entry.jira_key ? (
            entry.url ? (
              <a className="text-xs font-bold text-blue hover:underline" href={entry.url} target="_blank" rel="noreferrer">
                {entry.jira_key}
              </a>
            ) : (
              <span className="text-xs font-bold text-blue">{entry.jira_key}</span>
            )
          ) : <span className="text-xs text-ink4">Manual</span>}
          <p className="mt-1 break-words font-semibold text-ink">{entry.summary}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {entry.story_points !== null ? (
            <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-sm font-bold tabular-nums text-emerald-700">
              {entry.story_points} SP
            </span>
          ) : (
            <span className="text-xs text-ink4">— SP</span>
          )}
          {entry.consensus ? <Badge tone="success">Consensus</Badge> : null}
        </div>
      </div>
      <Button
        size="sm"
        variant="secondary"
        className="mt-3 w-full"
        disabled={reopenBusy !== null}
        loading={reopenBusy === entry.task_id}
        onClick={() => { void onReopen(entry.task_id); }}
      >
        Переоценить
      </Button>
      <p className="mt-3 text-xs text-ink3">
        Голосов: <span className="font-semibold tabular-nums text-ink2">{entry.voter_count}</span>
      </p>
      {distribution.length > 0 ? (
        <div className="mt-2 space-y-1">
          {distribution.map(([value, count]) => (
            <div key={value} className="flex items-center gap-2">
              <span className="w-7 text-right text-[11px] font-bold tabular-nums text-ink2">{value}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                <div className="h-full rounded-full bg-blue/70" style={{ width: `${(count / max) * 100}%` }} />
              </div>
              <span className="w-7 text-right text-[11px] font-semibold tabular-nums text-ink3">×{count}</span>
            </div>
          ))}
        </div>
      ) : null}
      {entry.votes.length > 0 ? (
        <details className="mt-3 text-xs text-ink3">
          <summary className="cursor-pointer select-none font-semibold text-ink2 hover:text-blue">По участникам</summary>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {entry.votes.map((vote, idx) => (
              <span
                key={`${vote.name}-${idx}`}
                className="break-words rounded-md border border-line bg-canvas px-2 py-0.5 text-[11px] font-semibold text-ink2"
              >
                {vote.name} → <span className="text-blue">{vote.value}</span>
              </span>
            ))}
          </div>
        </details>
      ) : null}
    </li>
  );
}
