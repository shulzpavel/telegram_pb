import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import {
  AiGenerationProgress,
  AiSparkleButton,
  Alert,
  Badge,
  Button,
  ConfirmDialog,
  DropdownField,
  EmptyState,
  Spinner,
  Surface,
  TextField,
  useToast,
} from "../../../design-system";
import { ApiError } from "../../../shared/api/http";
import {
  DataTable,
  InlineError,
  MobileRecordCard,
  MobileRecordField,
  SectionHeader,
  Toolbar,
} from "../components/CmsPrimitives";
import {
  cmsRetroApi,
  type RetroAiAnalyzeResult,
  type RetroAnalyzeStartResponse,
  type RetroConfig,
  type RetroRecord,
  type RetroSectionConfig,
} from "../api/cmsClient";
import { pollAiJob } from "../../../shared/lib/pollAiJob";
import { useUnsavedChangesGuard } from "../hooks/useUnsavedChangesGuard";
import { GroupingSelectionBar } from "./GroupingSelectionBar";
import { RetroAiView } from "./RetroAiView";
import { RetroBoard, RetroOutcomesPanel } from "./RetroBoard";
import {
  DEFAULT_RETRO_SECTIONS,
  MIN_GROUP_CARDS,
  allRetroSectionsOpened,
  formatCountdown,
  groupableCards,
  nextUnopenedSection,
  phaseLabel,
  type RetroAiSummary,
  type RetroLiveState,
} from "./retroLogic";
import { useRetro } from "./useRetro";

const DEFAULT_SECTIONS: RetroSectionConfig[] = DEFAULT_RETRO_SECTIONS.map((section) => ({ ...section }));

import type { CmsPrincipal } from "../api/cmsTypes";
import { TeamBadge } from "../components/TeamBadge";
import { TeamFilter, teamFilterParams } from "../components/TeamFilter";
import {
  TeamSelect,
  needsTeamPicker,
  teamPickerRequired,
  useTeamIdState,
} from "../components/TeamSelect";
import { useCmsTeams } from "../hooks/useCmsTeams";

export default function RetroShell({
  principal,
  canManage = false,
  canAnalyze = false,
}: {
  principal: CmsPrincipal;
  canManage?: boolean;
  canAnalyze?: boolean;
}) {
  return (
    <Routes>
      <Route index element={<RetroListPage principal={principal} canManage={canManage} />} />
      <Route path="new" element={<RetroCreatePage principal={principal} canManage={canManage} />} />
      <Route path=":id" element={<RetroDetailPage canManage={canManage} canAnalyze={canAnalyze} />} />
      <Route path="*" element={<Navigate to="/cms/retro" replace />} />
    </Routes>
  );
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

function RetroListPage({ principal, canManage }: { principal: CmsPrincipal; canManage: boolean }) {
  const navigate = useNavigate();
  const toast = useToast();
  const { teams } = useCmsTeams(principal);
  const [teamFilter, setTeamFilter] = useState("");
  const [teamSort, setTeamSort] = useState(false);
  const [items, setItems] = useState<RetroRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<RetroRecord | null>(null);
  const [busyDelete, setBusyDelete] = useState<number | null>(null);

  const reload = useCallback(() => {
    cmsRetroApi
      .list({
        ...teamFilterParams(teamFilter),
        sort: teamSort && principal.is_superuser ? "team_then_updated" : undefined,
      })
      .then((res) => setItems(res.items))
      .catch((e) => setError(e instanceof Error ? e.message : "Не удалось загрузить ретро"));
  }, [principal.is_superuser, teamFilter, teamSort]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function remove(retro: RetroRecord) {
    setBusyDelete(retro.id);
    try {
      await cmsRetroApi.delete(retro.id);
      toast.success("Ретро удалено");
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось удалить");
    } finally {
      setBusyDelete(null);
      setConfirmTarget(null);
    }
  }

  const loading = items === null;
  const rows = items ?? [];

  return (
    <section className="space-y-4">
      <SectionHeader
        title="Ретроспективы"
        description="Настройте секции, поделитесь ссылкой с командой и проведите живое ретро. В конце — AI-анализ итогов."
        actions={
          canManage ? (
            <Button variant="primary" size="sm" onClick={() => navigate("new")}>
              Создать ретро
            </Button>
          ) : null
        }
      />
      {error ? <InlineError text={error} /> : null}
      {principal.is_superuser ? (
        <Toolbar>
          <TeamFilter teams={teams} value={teamFilter} onChange={setTeamFilter} />
          <DropdownField
            aria-label="Сортировка ретро"
            value={teamSort ? "team" : "updated"}
            options={[
              { value: "updated", label: "По дате обновления" },
              { value: "team", label: "По команде" },
            ]}
            onChange={(value) => setTeamSort(value === "team")}
          />
        </Toolbar>
      ) : null}
      <DataTable
        columns={["Ретро", "Статус", "Секции", "AI", "Обновлено", "Действия"]}
        error={null}
        loading={loading}
        loadingMore={false}
        hasMore={false}
        loadedCount={rows.length}
        total={rows.length}
        onMore={() => undefined}
        itemNoun="ретро"
        empty={
          rows.length === 0 && !loading ? (
            <EmptyState
              title="Пока нет ретроспектив"
              description="Создайте первое ретро — настройте секции и пригласите команду."
              action={
                canManage ? (
                  <Button variant="primary" size="sm" onClick={() => navigate("new")}>
                    Создать ретро
                  </Button>
                ) : undefined
              }
            />
          ) : null
        }
        mobileCards={rows.map((retro) => (
          <MobileRecordCard
            key={retro.id}
            title={
              <Link to={`${retro.id}`} className="hover:text-blue">
                {retro.title}
              </Link>
            }
            meta={
              <span className="flex flex-wrap items-center gap-2">
                <TeamBadge teamId={retro.team_id} team={retro.team} />
                <span>Обновлено {formatRetroDate(retro.updated_at)}</span>
              </span>
            }
            status={<StatusBadge status={retro.status} />}
            footer={
              <>
                <Button variant="secondary" size="sm" onClick={() => navigate(`${retro.id}`)}>
                  Открыть
                </Button>
                {canManage ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmTarget(retro)}
                    loading={busyDelete === retro.id}
                    disabled={busyDelete !== null}
                  >
                    Удалить
                  </Button>
                ) : null}
              </>
            }
          >
            <MobileRecordField label="Секции" value={retro.config?.sections?.length ?? 0} />
            <MobileRecordField label="AI" value={retro.ai_summary ? "есть анализ" : "нет"} />
          </MobileRecordCard>
        ))}
      >
        {rows.map((retro) => (
          <tr key={retro.id} className="border-t border-line align-top">
            <td className="px-3 py-2">
              <Link to={`${retro.id}`} className="font-semibold text-ink hover:text-blue">
                {retro.title}
              </Link>
              <p className="mt-1">
                <TeamBadge teamId={retro.team_id} team={retro.team} />
              </p>
            </td>
            <td className="px-3 py-2">
              <StatusBadge status={retro.status} />
            </td>
            <td className="px-3 py-2 tabular-nums">{retro.config?.sections?.length ?? 0}</td>
            <td className="px-3 py-2">
              {retro.ai_summary ? <Badge tone="info">есть</Badge> : <span className="text-xs text-ink4">—</span>}
            </td>
            <td className="whitespace-nowrap px-3 py-2 text-ink3">{formatRetroDate(retro.updated_at)}</td>
            <td className="px-3 py-2">
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => navigate(`${retro.id}`)}>
                  Открыть
                </Button>
                {canManage ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmTarget(retro)}
                    loading={busyDelete === retro.id}
                    disabled={busyDelete !== null}
                  >
                    Удалить
                  </Button>
                ) : null}
              </div>
            </td>
          </tr>
        ))}
      </DataTable>
      <ConfirmDialog
        open={confirmTarget !== null}
        title="Удалить ретро?"
        description={confirmTarget ? `Ретро «${confirmTarget.title}» будет удалено из CMS.` : ""}
        confirmLabel="Удалить"
        cancelLabel="Отмена"
        tone="danger"
        onCancel={() => setConfirmTarget(null)}
        onConfirm={() => {
          if (confirmTarget) void remove(confirmTarget);
        }}
      />
    </section>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "live") return <Badge tone="info">идёт</Badge>;
  if (status === "done") return <Badge tone="success">завершено</Badge>;
  return <Badge tone="neutral">черновик</Badge>;
}

function formatRetroDate(value: string): string {
  return new Date(value).toLocaleString("ru-RU");
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

function RetroCreatePage({ principal, canManage }: { principal: CmsPrincipal; canManage: boolean }) {
  const navigate = useNavigate();
  const toast = useToast();
  const { teams, loading: teamsLoading } = useCmsTeams(principal);
  const [teamId, setTeamId] = useTeamIdState(teams);

  if (!canManage) {
    return <InlineError text="Недостаточно прав для создания ретроспектив." />;
  }

  async function handleCreate(title: string, config: RetroConfig) {
    if (teamPickerRequired(teams, principal.is_superuser) && teamId === "") {
      throw new Error("Выберите команду");
    }
    const created = await cmsRetroApi.create({
      title,
      config,
      team_id: teamId === "" ? undefined : teamId,
    });
    toast.success("Ретро создано");
    navigate(`/cms/retro/${created.id}`);
  }

  return (
    <div className="space-y-5">
      <SectionHeader title="Новое ретро" description="Задайте название и секции для обсуждения." />
      {needsTeamPicker(teams, principal.is_superuser) ? (
        <TeamSelect
          teams={teams}
          value={teamId}
          forcePicker
          loading={teamsLoading}
          required={teamPickerRequired(teams, principal.is_superuser)}
          allowEmpty={principal.is_superuser}
          onChange={setTeamId}
        />
      ) : null}
      <RetroConfigForm
        initialTitle=""
        initialConfig={{ sections: DEFAULT_SECTIONS, votes_per_person: 5, default_section_seconds: 300 }}
        submitLabel="Создать"
        warnOnUnsaved
        onSubmit={handleCreate}
        onCancel={() => navigate("/cms/retro")}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Config form (shared by create + draft edit)
// ---------------------------------------------------------------------------

function RetroConfigForm({
  initialTitle,
  initialConfig,
  submitLabel,
  warnOnUnsaved = false,
  onSubmit,
  onCancel,
}: {
  initialTitle: string;
  initialConfig: RetroConfig;
  submitLabel: string;
  warnOnUnsaved?: boolean;
  onSubmit: (title: string, config: RetroConfig) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [sections, setSections] = useState<RetroSectionConfig[]>(initialConfig.sections);
  const [votesPerPerson, setVotesPerPerson] = useState(initialConfig.votes_per_person);
  const [timerMinutes, setTimerMinutes] = useState(Math.round((initialConfig.default_section_seconds ?? 0) / 60));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialDraftRef = useRef(JSON.stringify({ title, sections, votesPerPerson, timerMinutes }));
  const currentDraft = useMemo(
    () => JSON.stringify({ title, sections, votesPerPerson, timerMinutes }),
    [sections, timerMinutes, title, votesPerPerson],
  );
  const unsavedGuard = useUnsavedChangesGuard({
    when: warnOnUnsaved && currentDraft !== initialDraftRef.current && !busy,
  });

  function updateSection(index: number, value: string) {
    setSections((prev) => prev.map((s, i) => (i === index ? { ...s, title: value } : s)));
  }
  function addSection() {
    setSections((prev) => [...prev, { title: "" }]);
  }
  function removeSection(index: number) {
    setSections((prev) => prev.filter((_, i) => i !== index));
  }

  async function submit() {
    const cleanTitle = title.trim();
    const cleanSections = sections
      .map((s) => ({ ...s, title: s.title.trim() }))
      .filter((s) => s.title.length > 0);
    if (!cleanTitle) {
      setError("Укажите название ретро");
      return;
    }
    if (cleanSections.length === 0) {
      setError("Добавьте хотя бы одну секцию");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await unsavedGuard.runWithoutPrompt(() => onSubmit(cleanTitle, {
        sections: cleanSections,
        votes_per_person: Math.max(1, votesPerPerson),
        default_section_seconds: Math.max(0, timerMinutes) * 60,
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Surface className="space-y-4 p-4">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <TextField
        label="Название ретро"
        placeholder="Например: Ретро спринта 42"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />

      <div className="space-y-2">
        <p className="text-sm font-semibold text-ink3">Секции (категории обсуждения)</p>
        <div className="space-y-2">
          {sections.map((section, index) => (
            <div key={index} className="flex items-center gap-2">
              <TextField
                className="flex-1"
                reserveMessageSpace={false}
                placeholder="Название секции"
                value={section.title}
                onChange={(e) => updateSection(index, e.target.value)}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeSection(index)}
                disabled={sections.length <= 1}
                title="Удалить секцию"
                aria-label="Удалить секцию"
              >
                ✕
              </Button>
            </div>
          ))}
        </div>
        <Button variant="secondary" size="sm" onClick={addSection}>
          + Секция
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label="Голосов на участника"
          type="number"
          min={1}
          max={50}
          value={String(votesPerPerson)}
          onChange={(e) => setVotesPerPerson(Number(e.target.value) || 1)}
          hint="Сколько голосов раздаёт каждый при приоритизации"
        />
        <DropdownField
          label="Таймер секции по умолчанию"
          value={String(timerMinutes)}
          options={[
            { value: "0", label: "Без таймера" },
            { value: "3", label: "3 минуты" },
            { value: "5", label: "5 минут" },
            { value: "7", label: "7 минут" },
            { value: "10", label: "10 минут" },
          ]}
          onChange={(value) => setTimerMinutes(Number(value))}
          hint="Мягкий ориентир, переход всегда за вами"
        />
      </div>

      <div className="flex gap-2">
        <Button variant="primary" onClick={() => void submit()} loading={busy}>
          {submitLabel}
        </Button>
        <Button variant="ghost" onClick={() => unsavedGuard.confirmIfNeeded(onCancel)}>
          Отмена
        </Button>
      </div>
      {unsavedGuard.dialog}
    </Surface>
  );
}

// ---------------------------------------------------------------------------
// Detail (draft editor OR cockpit)
// ---------------------------------------------------------------------------

function RetroDetailPage({ canManage, canAnalyze }: { canManage: boolean; canAnalyze: boolean }) {
  const params = useParams<{ id: string }>();
  const retroId = Number(params.id);
  const navigate = useNavigate();
  const toast = useToast();

  const [record, setRecord] = useState<RetroRecord | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const load = useCallback(() => {
    if (!Number.isFinite(retroId)) {
      setError("Некорректный идентификатор ретро");
      return;
    }
    cmsRetroApi
      .get(retroId)
      .then(setRecord)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 404) setError("Ретро не найдено");
        else setError(e instanceof Error ? e.message : "Не удалось загрузить ретро");
      });
  }, [retroId]);

  useEffect(() => {
    load();
  }, [load]);

  // Once the retro is live/done, fetch a usable invite token to drive the board.
  const startOrResume = useCallback(async () => {
    setStarting(true);
    setInviteError(null);
    try {
      const res = await cmsRetroApi.invite(retroId);
      setToken(res.token);
      load();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Не удалось запустить ретро";
      setInviteError(message);
      toast.error(message);
    } finally {
      setStarting(false);
    }
  }, [retroId, load, toast]);

  useEffect(() => {
    if (record && record.status !== "draft" && !token) {
      void startOrResume();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record?.status]);

  if (error) return <InlineError text={error} />;
  if (!record) return <Spinner />;

  if (record.status === "draft") {
    return (
      <div className="space-y-5">
        <SectionHeader
          title={record.title}
          description="Черновик. Отредактируйте секции и запустите ретро, чтобы получить ссылку для команды."
          actions={
            <Button variant="ghost" onClick={() => navigate("/cms/retro")}>
              ← К списку
            </Button>
          }
        />
        {canManage ? (
          <RetroConfigForm
            initialTitle={record.title}
            initialConfig={record.config}
            submitLabel="Сохранить черновик"
            onSubmit={async (title, config) => {
              await cmsRetroApi.update(retroId, { title, config });
              toast.success("Сохранено");
              load();
            }}
            onCancel={() => navigate("/cms/retro")}
          />
        ) : (
          <Surface className="p-4 text-sm text-ink2">
            У вас есть доступ на просмотр, но нет прав на изменение или запуск ретро.
          </Surface>
        )}
        {canManage ? (
          <Surface className="flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="text-sm text-ink2">Готовы начать? Сохранённая конфигурация запустит живое ретро.</p>
            <Button variant="primary" onClick={() => void startOrResume()} loading={starting}>
              Запустить ретро
            </Button>
          </Surface>
        ) : null}
      </div>
    );
  }

  if (!token) {
    return (
      <div className="space-y-3">
        {inviteError ? <InlineError text={inviteError} /> : <Spinner />}
        {canManage ? (
          <Button variant="secondary" onClick={() => void startOrResume()} loading={starting}>
            Получить новую ссылку
          </Button>
        ) : null}
      </div>
    );
  }
  return (
    <RetroCockpit
      retroId={retroId}
      token={token}
      initialAi={record.ai_summary}
      canManage={canManage}
      canAnalyze={canAnalyze}
      onBack={() => navigate("/cms/retro")}
    />
  );
}

// ---------------------------------------------------------------------------
// Cockpit (manager facilitation)
// ---------------------------------------------------------------------------

function RetroCockpit({
  retroId,
  token,
  initialAi,
  canManage,
  canAnalyze,
  onBack,
}: {
  retroId: number;
  token: string;
  initialAi: RetroAiSummary | null;
  canManage: boolean;
  canAnalyze: boolean;
  onBack: () => void;
}) {
  const toast = useToast();
  const { state, error, applyState } = useRetro(token, { participant: false });
  const [busy, setBusy] = useState(false);
  const [ai, setAi] = useState<RetroAiSummary | null>(initialAi);
  const [aiProgress, setAiProgress] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());
  const [groupTitle, setGroupTitle] = useState("");

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const inviteUrl = useMemo(() => `${window.location.origin}/r/${token}`, [token]);

  async function run(action: () => Promise<RetroLiveState>, okMsg?: string) {
    setBusy(true);
    try {
      const next = await action();
      applyState(next);
      if (okMsg) toast.success(okMsg);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Ошибка";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  async function analyze() {
    setBusy(true);
    setAiProgress("Запускаем AI...");
    try {
      const started = await cmsRetroApi.startAnalyze(retroId);
      if (isRetroAnalyzeResult(started)) {
        setAi(started.ai_summary);
        toast.success(started.cached ? "AI-анализ уже актуален" : "AI-анализ готов");
        return;
      }

      const jobId = started.job_id;
      if (!jobId) {
        throw new Error("AI job was not started");
      }

      const result = await pollAiJob<RetroAiAnalyzeResult>(
        () => cmsRetroApi.getAnalyzeJob(retroId, jobId),
        {
          intervalMs: 1200,
          onProgress: (job) => setAiProgress(job.message ?? "AI готовит анализ..."),
        }
      );
      setAi(result.ai_summary);
      toast.success(result.cached ? "AI-анализ уже актуален" : "AI-анализ готов");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI-анализ не выполнен", { title: "Ошибка" });
    } finally {
      setBusy(false);
      setAiProgress(null);
    }
  }

  useEffect(() => {
    if (!state) return;
    const selectable = new Set(groupableCards(state).map((card) => card.card_id));
    setSelectedCardIds((prev) => {
      const next = new Set([...prev].filter((cardId) => selectable.has(cardId)));
      return next.size === prev.size ? prev : next;
    });
  }, [state]);

  if (!state) return <Spinner />;

  const countdown = formatCountdown(state.section_deadline, now);
  const effectiveAi = state.ai_summary ?? ai;
  const selectedCardsCount = selectedCardIds.size;
  const groupableCount = groupableCards(state).length;

  function toggleCardSelection(cardId: string) {
    setSelectedCardIds((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  }

  async function createGroup() {
    const title = groupTitle.trim();
    if (!title || selectedCardIds.size < 2) return;
    setBusy(true);
    try {
      const next = await cmsRetroApi.createGroup(retroId, { title, card_ids: [...selectedCardIds] });
      applyState(next);
      setSelectedCardIds(new Set());
      setGroupTitle("");
      toast.success("Группа создана");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось создать группу");
    } finally {
      setBusy(false);
    }
  }

  return (
    // Bottom padding keeps the floating grouping bar from covering content.
    <div className={["space-y-5", selectedCardsCount > 0 ? "pb-32" : ""].join(" ")}>
      <SectionHeader
        title={state.title}
        description={`Фаза: ${phaseLabel(state.phase)}`}
        actions={
          <Button variant="ghost" onClick={onBack}>
            ← К списку
          </Button>
        }
      />

      {error ? <Alert tone="warning">{error}</Alert> : null}

      <Surface className="space-y-2 p-4">
        <p className="text-sm font-semibold text-ink3">Ссылка для команды</p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="flex-1 break-all rounded-md border border-line bg-surface px-3 py-2 text-xs text-ink2">
            {inviteUrl}
          </code>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              navigator.clipboard?.writeText(inviteUrl).then(
                () => toast.success("Ссылка скопирована"),
                () => toast.error("Не удалось скопировать"),
              );
            }}
          >
            Копировать
          </Button>
        </div>
      </Surface>

      {canManage ? (
        <ManagerControls
          state={state}
          busy={busy}
          countdown={countdown}
          onOpenSection={(sectionId) =>
            run(() => cmsRetroApi.openSection(retroId, sectionId), "Секция открыта")
          }
          onCloseSection={() => run(() => cmsRetroApi.closeSection(retroId), "Сбор приостановлен")}
          onStartVoting={() => run(() => cmsRetroApi.setPhase(retroId, "voting"), "Голосование открыто")}
          onStartDiscussion={() =>
            run(() => cmsRetroApi.setPhase(retroId, "discussing"), "Переход к обсуждению")
          }
          onFinalize={() => run(() => cmsRetroApi.finalize(retroId), "Ретро завершено")}
        />
      ) : null}

      {canManage && state.phase === "discussing" ? (
        <ActionItemsPanel
          state={state}
          busy={busy}
          onAdd={(text, assignee) =>
            run(() => cmsRetroApi.addActionItem(retroId, { text, assignee }))
          }
          onRemove={(itemId) => run(() => cmsRetroApi.removeActionItem(retroId, itemId))}
        />
      ) : null}

      {canManage && groupableCount >= MIN_GROUP_CARDS ? (
        <p className="text-xs text-ink3">
          Похожие карточки можно объединить: отметьте их чекбоксами — внизу появится панель группировки.
        </p>
      ) : null}

      <RetroBoard
        state={state}
        countdown={countdown}
        selectableCards={canManage && groupableCount > 0}
        selectedCardIds={selectedCardIds}
        onToggleCardSelection={toggleCardSelection}
        groupActions={
          canManage
            ? {
                busy,
                onRename: (groupId, title) =>
                  run(() => cmsRetroApi.renameGroup(retroId, groupId, { title }), "Группа переименована"),
                onUngroup: (groupId) =>
                  run(() => cmsRetroApi.ungroup(retroId, groupId), "Группа разобрана"),
              }
            : undefined
        }
      />
      <RetroOutcomesPanel state={state} showAi={false} />

      {canManage ? (
        <GroupingSelectionBar
          selectedCount={selectedCardsCount}
          title={groupTitle}
          busy={busy}
          onTitleChange={setGroupTitle}
          onCreate={() => void createGroup()}
          onClear={() => setSelectedCardIds(new Set())}
        />
      ) : null}

      {state.phase === "done" ? (
        <Surface className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-bold text-ink">AI-анализ итогов</h3>
            {canAnalyze ? (
              <AiSparkleButton onClick={() => void analyze()} loading={busy} disabled={state.cards.length === 0}>
                {effectiveAi ? "Перегенерировать" : "Проанализировать через AI"}
              </AiSparkleButton>
            ) : null}
          </div>
          {state.cards.length === 0 ? (
            <p className="text-sm text-ink3">Нет карточек для анализа.</p>
          ) : null}
          {busy && aiProgress ? <AiGenerationProgress message={aiProgress} /> : null}
          {effectiveAi ? <RetroAiView summary={effectiveAi} /> : null}
        </Surface>
      ) : null}
    </div>
  );
}

function ManagerControls({
  state,
  busy,
  countdown,
  onOpenSection,
  onCloseSection,
  onStartVoting,
  onStartDiscussion,
  onFinalize,
}: {
  state: RetroLiveState;
  busy: boolean;
  countdown: string | null;
  onOpenSection: (sectionId: string) => void;
  onCloseSection: () => void;
  onStartVoting: () => void;
  onStartDiscussion: () => void;
  onFinalize: () => void;
}) {
  const visited = new Set(state.visited_section_ids ?? []);
  const allSectionsOpened = allRetroSectionsOpened(state);
  const nextSection = nextUnopenedSection(state);

  return (
    <Surface className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink3">Управление ходом ретро</p>
        {state.phase === "collecting" && countdown ? (
          <Badge tone={countdown === "0:00" ? "danger" : "neutral"}>Осталось на мысли: {countdown}</Badge>
        ) : null}
      </div>

      {state.phase === "lobby" || state.phase === "collecting" ? (
        <div className="space-y-3">
          <div>
            <p className="text-xs text-ink3">Откройте секции по очереди для сбора карточек:</p>
            <p className="mt-1 text-xs text-ink4">
              {allSectionsOpened
                ? "Все блоки были открыты, можно переходить к голосованию."
                : nextSection
                  ? `Следующий блок: ${nextSection.title}`
                  : "Выберите первый блок."}
            </p>
          </div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {state.sections.map((section, index) => {
              const active = state.active_section_id === section.section_id;
              const done = visited.has(section.section_id) && !active;
              const next = nextSection?.section_id === section.section_id;
              const status = active ? "открыта" : done ? "пройдено" : next ? "следующая" : "ожидает";
              const tone = active ? "info" : done ? "success" : next ? "warning" : "neutral";
              const stateClass = active
                ? "border-blue/40 bg-blue/10"
                : done
                  ? "border-green/35 bg-green/10"
                  : next
                    ? "border-amber/35 bg-amber/10"
                    : "border-line bg-surface hover:bg-line2";

              return (
                <button
                  key={section.section_id}
                  type="button"
                  onClick={() => onOpenSection(section.section_id)}
                  disabled={busy}
                  className={[
                    "rounded-lg border px-3 py-2 text-left transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue/30",
                    stateClass,
                    busy ? "cursor-not-allowed opacity-60" : "",
                  ].join(" ")}
                >
                  <span className="text-[10px] font-bold uppercase tracking-wide text-ink4">Блок {index + 1}</span>
                  <span className="mt-1 block text-sm font-semibold text-ink">{section.title}</span>
                  <span className="mt-2 inline-flex">
                    <Badge tone={tone}>{status}</Badge>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {state.phase === "collecting" ? (
              <Button size="sm" variant="ghost" onClick={onCloseSection} disabled={busy}>
                Приостановить сбор
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="primary"
              onClick={onStartVoting}
              disabled={busy || state.phase === "lobby" || !allSectionsOpened}
              title={!allSectionsOpened ? "Сначала откройте все блоки ретро" : undefined}
            >
              Перейти к голосованию →
            </Button>
            {!allSectionsOpened ? (
              <span className="self-center text-xs text-ink3">Голосование откроется после всех блоков.</span>
            ) : null}
          </div>
        </div>
      ) : null}

      {state.phase === "voting" ? (
        <Button size="sm" variant="primary" onClick={onStartDiscussion} disabled={busy}>
          Перейти к обсуждению →
        </Button>
      ) : null}

      {state.phase === "discussing" ? (
        <Button size="sm" variant="primary" onClick={onFinalize} disabled={busy}>
          Завершить ретро ✓
        </Button>
      ) : null}

      {state.phase === "done" ? <Badge tone="success">Ретро завершено</Badge> : null}
    </Surface>
  );
}

function ActionItemsPanel({
  state,
  busy,
  onAdd,
  onRemove,
}: {
  state: RetroLiveState;
  busy: boolean;
  onAdd: (text: string, assignee: string | null) => void;
  onRemove: (itemId: string) => void;
}) {
  const [text, setText] = useState("");
  const [assignee, setAssignee] = useState("");

  function submit() {
    const clean = text.trim();
    if (!clean) return;
    onAdd(clean, assignee.trim() || null);
    setText("");
    setAssignee("");
  }

  return (
    <Surface className="space-y-3 p-4">
      <p className="text-sm font-semibold text-ink3">Задачи по итогам</p>
      {state.action_items.length === 0 ? (
        <p className="text-xs text-ink4">Пока нет зафиксированных действий.</p>
      ) : (
        <ul className="space-y-2">
          {state.action_items.map((item) => (
            <li
              key={item.item_id}
              className="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
            >
              <span className="min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                {item.text}
                {item.assignee ? <span className="ml-2 text-ink3">· {item.assignee}</span> : null}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onRemove(item.item_id)}
                disabled={busy}
                aria-label="Удалить задачу по итогам"
              >
                ✕
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <TextField
          className="flex-1"
          label="Задача"
          reserveMessageSpace={false}
          placeholder="Что сделаем по итогам?"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <TextField
          label="Ответственный"
          reserveMessageSpace={false}
          placeholder="Ответственный (опц.)"
          value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
        />
        <Button variant="secondary" size="sm" onClick={submit} disabled={busy || !text.trim()}>
          Добавить
        </Button>
      </div>
    </Surface>
  );
}

function isRetroAnalyzeResult(response: RetroAnalyzeStartResponse): response is RetroAiAnalyzeResult {
  return "ai_summary" in response;
}
