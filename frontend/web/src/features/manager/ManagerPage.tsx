import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Alert, Badge, Button, ConfirmDialog, EmptyState, Spinner, Surface, TextField, TextareaField, cn } from "../../design-system";
import { cmsAuthApi } from "../cms/api/cmsClient";
import type { CmsPrincipal } from "../cms/api/cmsTypes";
import { normalizeOptionalNumber, normalizeOptionalText, parseBulkTasks } from "../cms/sessions/taskInput";
import { managerApi } from "./api/managerClient";
import type { JiraPreview, ManagerSession, ManagerSessionRef, TaskItem, TaskMutation } from "./api/managerTypes";

const STORAGE_KEY = "pp_manager_session";
const ESTIMATE_VALUES = [1, 2, 3, 5, 8, 13, 21, 34];

function canManage(principal: CmsPrincipal | null): boolean {
  return Boolean(principal?.is_superuser || principal?.permissions.includes("app.sessions.manage"));
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

export default function ManagerPage() {
  const [principal, setPrincipal] = useState<CmsPrincipal | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [sessionRef, setSessionRef] = useState<ManagerSessionRef | null>(() => readStoredSession());
  const wantsDemo = new URLSearchParams(window.location.search).has("demo");

  useEffect(() => {
    let alive = true;
    cmsAuthApi.me()
      .then((me) => { if (alive) setPrincipal(me); })
      .catch(() => { if (alive) setPrincipal(null); })
      .finally(() => { if (alive) setAuthLoading(false); });
    return () => { alive = false; };
  }, []);

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

  if (authLoading) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-canvas">
        <Spinner size="lg" />
      </main>
    );
  }

  if (!principal) {
    return <ManagerLogin onLogin={setPrincipal} />;
  }

  if (!canManage(principal)) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-canvas px-4">
        <Surface className="max-w-md p-6">
          <h1 className="text-xl font-bold text-ink">Нет доступа к управлению сессиями</h1>
          <p className="mt-2 text-sm text-ink3">Нужен permission `app.sessions.manage`. Выдать его можно через CMS access management.</p>
          <Link className="mt-5 inline-flex text-sm font-semibold text-blue hover:text-blue2" to="/cms/access">Открыть access settings</Link>
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
    <main className="grid min-h-dvh bg-canvas px-4 py-8 md:grid-cols-[minmax(0,1fr)_420px] md:px-8">
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

function ManagerWorkspace({
  principal,
  sessionRef,
  onSessionRef,
}: {
  principal: CmsPrincipal;
  sessionRef: ManagerSessionRef | null;
  onSessionRef: (value: ManagerSessionRef | null) => void;
}) {
  const [session, setSession] = useState<ManagerSession | null>(null);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [taskQuery, setTaskQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadTasks = useCallback(async (
    ref: ManagerSessionRef,
    mode: "replace" | "append" = "replace",
    nextCursor: string | null = null,
  ) => {
    const page = await managerApi.tasks(ref.chatId, mode === "append" ? nextCursor : null, taskQuery, ref.topicId);
    setTasks((current) => mode === "append" ? [...current, ...page.items] : page.items);
    setCursor(page.next_cursor);
  }, [taskQuery]);

  const refresh = useCallback(async (silent = false) => {
    if (!sessionRef) return;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const next = await managerApi.state(sessionRef.chatId, sessionRef.title, sessionRef.topicId);
      setSession({ ...next, token: sessionRef.token, invite_url: sessionRef.inviteUrl });
      await loadTasks(sessionRef, "replace");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load session");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [loadTasks, sessionRef]);

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

  async function createSession(title: string) {
    setBusy("create");
    setError(null);
    try {
      const created = await managerApi.createSession(title);
      const ref = storeSession(created);
      onSessionRef(ref);
      setSession(created);
      setTasks([]);
      setCursor(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Session create failed");
    } finally {
      setBusy(null);
    }
  }

  async function applyAction(label: string, action: () => Promise<ManagerSession | TaskMutation>) {
    if (!sessionRef) return;
    setBusy(label);
    setError(null);
    try {
      const result = await action();
      if ("state" in result) setSession({ ...result, token: sessionRef.token, invite_url: sessionRef.inviteUrl, title: sessionRef.title });
      await loadTasks(sessionRef, "replace");
    } catch (err) {
      setError(err instanceof Error ? err.message : `${label} failed`);
    } finally {
      setBusy(null);
    }
  }

  if (!sessionRef || !session) {
    return (
      <main className="min-h-dvh bg-canvas px-4 py-6 md:px-8">
        <TopBar principal={principal} />
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
                    setSession(demo);
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
  const votedCount = session.state.participants.filter((participant) => participant.voted).length;
  const totalVoters = session.state.participants.length;
  const inviteUrl = session.invite_url ?? sessionRef.inviteUrl ?? "";

  return (
    <main className="min-h-dvh bg-canvas">
      <TopBar principal={principal} title={sessionRef.title} />
      <div className="mx-auto grid w-full max-w-[1440px] grid-cols-1 gap-4 px-4 py-4 lg:grid-cols-[360px_minmax(0,1fr)_340px] lg:px-6">
        <aside className="space-y-4 lg:sticky lg:top-[76px] lg:h-[calc(100dvh-96px)]">
          <InviteCard inviteUrl={inviteUrl} />
          <QueuePanel
            tasks={tasks}
            query={taskQuery}
            cursor={cursor}
            busy={busy}
            tasksVersion={session.tasks_version}
            currentTaskId={session.current_task_id}
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
        </aside>

        <section className="min-w-0 space-y-4">
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <ControlRoom
            phase={phase}
            task={currentTask}
            votedCount={votedCount}
            totalVoters={totalVoters}
            loading={loading}
            busy={busy}
            canStart={session.tasks_queue_count > 0}
            onStart={() => applyAction("start", () => managerApi.start(sessionRef.chatId))}
            onReveal={() => applyAction("reveal", () => managerApi.reveal(sessionRef.chatId))}
            onNext={() => applyAction("next", () => managerApi.next(sessionRef.chatId))}
            onSkip={() => applyAction("skip", () => managerApi.skip(sessionRef.chatId))}
            onFinish={() => applyAction("finish", () => managerApi.finish(sessionRef.chatId))}
            onFinalEstimate={(value) => applyAction("estimate", () => managerApi.finalEstimate(sessionRef.chatId, value))}
          />
        </section>

        <aside className="space-y-4 lg:sticky lg:top-[76px] lg:h-[calc(100dvh-96px)] lg:overflow-auto">
          <ParticipantsPanel participants={session.state.participants} />
          <TaskAddPanel
            chatId={sessionRef.chatId}
            tasksVersion={session.tasks_version}
            busy={busy}
            onAction={applyAction}
          />
        </aside>
      </div>
    </main>
  );
}

function TopBar({ principal, title = "Planning Poker" }: { principal: CmsPrincipal; title?: string }) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur">
      <div className="mx-auto flex min-h-16 max-w-[1440px] items-center justify-between gap-3 px-4 lg:px-6">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase text-ink3">Manager cockpit</p>
          <h1 className="truncate text-base font-bold text-ink md:text-lg">{title}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-ink3 hover:bg-line2 hover:text-ink sm:inline-flex" to="/cms">
            CMS
          </Link>
          <Badge tone="info">{principal.display_name ?? principal.username}</Badge>
        </div>
      </div>
    </header>
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
  tasks,
  query,
  cursor,
  busy,
  tasksVersion,
  currentTaskId,
  onQuery,
  onReload,
  onLoadMore,
  onDelete,
  onMove,
  onUpdate,
}: {
  tasks: TaskItem[];
  query: string;
  cursor: string | null;
  busy: string | null;
  tasksVersion: number;
  currentTaskId: string | null;
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

  return (
    <Surface className="flex max-h-[70dvh] flex-col p-4 lg:max-h-full">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-ink">Backlog</h2>
          <p className="text-xs text-ink3">v{tasksVersion} · {tasks.length} loaded</p>
        </div>
        <Button size="sm" variant="ghost" onClick={onReload}>Refresh</Button>
      </div>
      <TextField className="mt-3" aria-label="Search tasks" placeholder="Search by Jira key or summary" value={query} onChange={(event) => onQuery(event.target.value)} />
      <div className="mt-3 min-h-0 flex-1 overflow-auto pr-1">
        {tasks.length === 0 ? (
          <EmptyState title="Очередь пуста" description="Добавьте задачи вручную или импортируйте их из Jira." />
        ) : (
          <div className="space-y-2">
            {tasks.map((task) => {
              const active = task.task_uid === currentTaskId;
              const editing = editingId === task.task_uid;
              return (
                <div key={task.task_uid} className={cn("rounded-lg border bg-surface p-3", active ? "border-blue bg-blue/5" : "border-line")}>
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 w-7 shrink-0 text-right text-xs font-semibold tabular-nums text-ink4">{task.bucket_index + 1}</span>
                    <div className="min-w-0 flex-1">
                      {editing ? (
                        <TextField
                          aria-label="Task summary"
                          value={editValue}
                          onChange={(event) => setEditValue(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" && editValue.trim()) {
                              onUpdate(task, editValue.trim());
                              setEditingId(null);
                            }
                          }}
                        />
                      ) : (
                        <>
                          <div className="flex flex-wrap items-center gap-2">
                            {task.jira_key ? <Badge tone="info">{task.jira_key}</Badge> : <Badge>Manual</Badge>}
                            {active ? <Badge tone="success">Current</Badge> : null}
                          </div>
                          <p className="mt-2 text-sm font-semibold leading-5 text-ink">{task.summary}</p>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5 pl-9">
                    {editing ? (
                      <>
                        <Button size="sm" variant="primary" disabled={!editValue.trim() || busy !== null} onClick={() => { onUpdate(task, editValue.trim()); setEditingId(null); }}>Save</Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                      </>
                    ) : (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => { setEditingId(task.task_uid); setEditValue(task.summary); }}>Edit</Button>
                        <Button size="sm" variant="ghost" disabled={task.bucket_index === 0 || busy !== null} onClick={() => onMove(task, 0)}>Top</Button>
                        <Button size="sm" variant="ghost" disabled={task.bucket_index === 0 || busy !== null} onClick={() => onMove(task, task.bucket_index - 1)}>Up</Button>
                        <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => onMove(task, task.bucket_index + 1)}>Down</Button>
                        <Button size="sm" variant="danger" disabled={busy !== null} onClick={() => setDeleteTask(task)}>Delete</Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
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

function ControlRoom({
  phase,
  task,
  votedCount,
  totalVoters,
  loading,
  busy,
  canStart,
  onStart,
  onReveal,
  onNext,
  onSkip,
  onFinish,
  onFinalEstimate,
}: {
  phase: string;
  task: ManagerSession["state"]["task"];
  votedCount: number;
  totalVoters: number;
  loading: boolean;
  busy: string | null;
  canStart: boolean;
  onStart: () => void;
  onReveal: () => void;
  onNext: () => void;
  onSkip: () => void;
  onFinish: () => void;
  onFinalEstimate: (value: number) => void;
}) {
  const phaseTone = phase === "voting" ? "info" : phase === "results" ? "success" : phase === "complete" ? "neutral" : "warning";
  return (
    <Surface className="min-h-[calc(100dvh-96px)] p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <Badge tone={phaseTone}>{phase}</Badge>
          <h2 className="mt-3 text-2xl font-bold leading-tight text-ink md:text-3xl">
            {task?.text ?? "Подготовьте очередь задач"}
          </h2>
          {task?.jira_key ? <p className="mt-2 text-sm font-semibold text-blue">{task.jira_key}</p> : null}
        </div>
        <div className="rounded-lg border border-line bg-line2 px-4 py-3 text-right">
          <p className="text-xs font-semibold uppercase text-ink3">Votes</p>
          <p className="text-2xl font-bold tabular-nums text-ink">{votedCount}/{totalVoters}</p>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Button variant="primary" disabled={!canStart || busy !== null || phase === "voting"} loading={busy === "start" || loading} onClick={onStart}>Start</Button>
        <Button disabled={!task || busy !== null || phase !== "voting"} loading={busy === "reveal"} onClick={onReveal}>Reveal</Button>
        <Button disabled={!task || busy !== null} loading={busy === "next"} onClick={onNext}>Next</Button>
        <Button variant="danger" disabled={!task || busy !== null} loading={busy === "skip"} onClick={onSkip}>Skip</Button>
        <Button variant="ghost" disabled={busy !== null || phase === "complete"} loading={busy === "finish"} onClick={onFinish}>Finish</Button>
      </div>

      <div className="mt-8 grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="rounded-lg border border-line bg-line2 p-4">
          <p className="text-xs font-semibold uppercase text-ink3">Voting canvas</p>
          {phase === "waiting" ? (
            <EmptyState title="Участники ждут начала" description="Проверьте очередь и нажмите Start, когда команда готова." />
          ) : phase === "voting" ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-line bg-surface p-4">
                <p className="text-sm font-bold text-ink">Скрытое голосование</p>
                <p className="mt-1 text-sm text-ink3">Оценки участников не раскрываются до Reveal.</p>
              </div>
              <div className="rounded-lg border border-line bg-surface p-4">
                <p className="text-sm font-bold text-ink">Обсуждение после reveal</p>
                <p className="mt-1 text-sm text-ink3">Сначала сравните крайние оценки, затем фиксируйте итоговый SP.</p>
              </div>
            </div>
          ) : phase === "results" ? (
            <div className="mt-5">
              <p className="text-sm text-ink3">Выберите итоговую оценку после обсуждения.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {ESTIMATE_VALUES.map((value) => (
                  <Button key={value} size="sm" variant={task?.story_points === value ? "primary" : "secondary"} onClick={() => onFinalEstimate(value)}>
                    {value}
                  </Button>
                ))}
              </div>
            </div>
          ) : phase === "complete" ? (
            <EmptyState title="Сессия завершена" description="Результаты доступны в CMS и истории сессии." />
          ) : (
            <EmptyState title="Нет активной задачи" description="Добавьте задачи или начните новую очередь." />
          )}
        </div>
        <div className="rounded-lg border border-line bg-surface p-4">
          <p className="text-sm font-bold text-ink">Facilitator checklist</p>
          <ul className="mt-3 space-y-2 text-sm text-ink3">
            <li>Покажите задачу и критерии готовности.</li>
            <li>Голосование индивидуальное и закрытое.</li>
            <li>После reveal обсудите расхождения.</li>
            <li>Фиксируйте итоговый SP до перехода дальше.</li>
          </ul>
        </div>
      </div>
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
        ) : participants.map((participant) => (
          <div key={participant.name} className="flex items-center justify-between rounded-lg border border-line bg-line2 px-3 py-2">
            <span className="min-w-0 truncate text-sm font-semibold text-ink">{participant.name}</span>
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
  const [jql, setJql] = useState("project = DEMO ORDER BY priority DESC");
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

      <Surface className="p-4">
        <h2 className="text-sm font-bold text-ink">Jira import</h2>
        <TextareaField className="mt-3" label="JQL" value={jql} onChange={(event) => setJql(event.target.value)} />
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
          <div className="mt-3 max-h-56 overflow-auto rounded-lg border border-line">
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
          </div>
        ) : null}
      </Surface>
    </div>
  );
}
