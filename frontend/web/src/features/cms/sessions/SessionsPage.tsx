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
import { useVirtualizer } from "@tanstack/react-virtual";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { cmsFetch, cmsSessionsApi, cmsTasksApi, type CmsTaskBody } from "../api/cmsClient";
import { managerApi } from "../../manager/api/managerClient";
import { storeManagerSession } from "../../manager/ManagerPage";
import type {
  CmsPrincipal,
  JiraPreview,
  ParticipantItem,
  SessionDetail,
  SessionItem,
  TaskItem,
  WebParticipantItem,
} from "../api/cmsTypes";
import { TeamBadge } from "../components/TeamBadge";
import { TeamFilter, teamFilterParams } from "../components/TeamFilter";
import { TeamSelect, needsTeamPicker, resolveDefaultTeamId } from "../components/TeamSelect";
import { useCmsTeams } from "../hooks/useCmsTeams";
import { Alert, Badge, BottomSheet, Button, ConfirmDialog, EmptyState, ScrollArea, SelectField, Surface, TextField } from "../../../design-system";
import {
  CompactList,
  DataTable,
  HelpCallout,
  InlineError,
  LoadMoreFooter,
  MobileRecordCard,
  MobileRecordField,
  SectionHeader,
  Skeleton,
  Status,
  Toolbar,
} from "../components/CmsPrimitives";
import { useCmsList } from "../hooks/useCmsList";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { useUnsavedChangesGuard } from "../hooks/useUnsavedChangesGuard";
import { formatDate, shortHash } from "../../../shared/lib/format";
import { displaySessionTitle, sessionKeyChip } from "./sessionTitle";
import { normalizeOptionalNumber, normalizeOptionalText } from "./taskInput";
import { canUseFullReorder, reorderedTaskIds } from "./taskQueueList";

interface SessionsPageProps {
  principal: CmsPrincipal;
  canManageTasks: boolean;
  canManageSessions: boolean;
}

export default function SessionsPage({ principal, canManageTasks, canManageSessions }: SessionsPageProps) {
  const { teams } = useCmsTeams(principal);
  const [q, setQ] = useState("");
  const [active, setActive] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const [teamSort, setTeamSort] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [confirmAction, setConfirmAction] = useState<
    | { kind: "close"; item: SessionItem }
    | { kind: "delete"; item: SessionItem }
    | null
  >(null);
  const [actionBusy, setActionBusy] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionInfo, setActionInfo] = useState<string | null>(null);
  // CMS-native session creation (Option B follow-up): instead of
  // bouncing the user out of CMS into `/manage`, we create the
  // session in-place and navigate straight to its cockpit. Three
  // separate state slots keep the dialog dumb — open/closed, draft
  // title, and an in-flight indicator.
  const [createOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createTeamId, setCreateTeamId] = useState<number | "">("");
  const createSessionGuard = useUnsavedChangesGuard({
    when: createOpen && (createTitle.trim().length > 0 || createTeamId !== "") && !createBusy,
  });
  const debouncedQ = useDebouncedValue(q);
  const params = useMemo(
    () => ({
      q: debouncedQ,
      active: active === "" ? undefined : active === "true",
      ...teamFilterParams(teamFilter),
      sort: teamSort && principal.is_superuser ? "team_then_updated" : undefined,
    }),
    [active, debouncedQ, principal.is_superuser, teamFilter, teamSort]
  );
  const list = useCmsList<SessionItem>("/sessions", params, { scrollKey: "cms-sessions" });
  const navigate = useNavigate();
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const focusSearch = () => searchInputRef.current?.focus();

  // Option B navigation: every session detail lives under
  // `/cms/sessions/:id/...`. Completed sessions auto-route to the
  // report tab; active ones open the cockpit. Both new URLs map to
  // the same components as before — only the address changed.
  function openCockpit(item: SessionItem) {
    if (item.batch_completed && !item.is_active) {
      navigate(`/cms/sessions/${item.chat_id}/report`);
      return;
    }
    navigate(`/cms/sessions/${item.chat_id}/cockpit`);
  }

  async function submitCreate(event: FormEvent) {
    event.preventDefault();
    if (createBusy) return;
    setCreateBusy(true);
    setCreateError(null);
    const title = createTitle.trim() || "Planning Poker";
    const teamId = createTeamId === "" ? undefined : createTeamId;
    if (needsTeamPicker(teams, principal.is_superuser) && teamId == null) {
      setCreateError("Выберите команду");
      setCreateBusy(false);
      return;
    }
    try {
      const session = await managerApi.createSession(title, teamId);
      // Cache the just-minted invite token so the cockpit doesn't
      // immediately call regenerate-invite (which would burn the
      // token we just got from the create response).
      storeManagerSession(session);
      setCreateOpen(false);
      setCreateTitle("");
      createSessionGuard.runWithoutPrompt(() => navigate(`/cms/sessions/${session.chat_id}/cockpit`));
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Не удалось создать сессию");
    } finally {
      setCreateBusy(false);
    }
  }

  async function runSessionAction(kind: "close" | "delete", item: SessionItem) {
    setActionBusy(item.id);
    setActionError(null);
    setActionInfo(null);
    try {
      if (kind === "close") {
        const result = await cmsSessionsApi.close(item.id);
        setActionInfo(`Сессия закрыта. Обработано задач: ${result.completed_count}.`);
      } else {
        await cmsSessionsApi.delete(item.id);
        setActionInfo("Сессия удалена из истории.");
        if (selectedId === item.id) {
          setSelectedId(null);
        }
      }
      await list.reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Действие не удалось");
    } finally {
      setActionBusy(null);
      setConfirmAction(null);
    }
  }

  return (
    <section className="space-y-4">
      <SectionHeader
        title="Сессии"
        description="Все планинг-покер сессии. «Открыть» ведёт в cockpit (или отчёт, если сессия завершена). «Подробнее» открывает карточку с переименованием, закрытием и удалением."
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setCreateTitle("");
              setCreateTeamId(resolveDefaultTeamId(teams));
              setCreateError(null);
              setCreateOpen(true);
            }}
          >
            Новая сессия
          </Button>
        }
      />
      <HelpCallout title="Подсказки">
        <p>«Открыть cockpit» — фасилитаторский экран для управления сессией: ставить SP, переключать задачи, видеть голоса участников.</p>
        <p>«Открыть отчёт» — итоги завершённой сессии с экспортом в CSV. Работает даже если сессия ещё не закрыта (покажет текущие голосования).</p>
        <p>«Закрыть» переносит все оставшиеся задачи в last_batch и фиксирует консенсус — после этого сессия доступна только для чтения.</p>
        <p>«Удалить из истории» прячет сессию вместе с её задачами, голосами и invite-ссылками; запись в журнал действий остаётся.</p>
      </HelpCallout>
      {actionInfo ? <Alert tone="success">{actionInfo}</Alert> : null}
      {actionError ? <InlineError text={actionError} /> : null}

      <Toolbar>
        <TextField
          ref={searchInputRef}
          className="md:max-w-sm"
          aria-label="Поиск сессии"
          placeholder="Поиск по названию или идентификатору"
          value={q}
          onChange={(event) => setQ(event.target.value)}
        />
        <SelectField
          className="md:max-w-[200px]"
          aria-label="Статус сессии"
          value={active}
          onChange={(event) => setActive(event.target.value)}
        >
          <option value="">Все статусы</option>
          <option value="true">Идут сейчас</option>
          <option value="false">Завершены / не запущены</option>
        </SelectField>
        {principal.is_superuser ? (
          <>
            <TeamFilter teams={teams} value={teamFilter} onChange={setTeamFilter} />
            <SelectField
              className="md:max-w-[220px]"
              aria-label="Сортировка"
              value={teamSort ? "team" : "updated"}
              onChange={(event) => setTeamSort(event.target.value === "team")}
            >
              <option value="updated">По дате обновления</option>
              <option value="team">По команде</option>
            </SelectField>
          </>
        ) : null}
        <Button variant="ghost" size="sm" className="whitespace-nowrap" onClick={list.reload}>Обновить</Button>
      </Toolbar>

      <DataTable
        error={list.error}
        loading={list.loading}
        loadingMore={list.loadingMore}
        hasMore={list.hasMore}
        reachedCap={list.reachedCap}
        loadedCount={list.items.length}
        total={list.total}
        onMore={list.loadMore}
        onFocusSearch={focusSearch}
        itemNoun="сессий"
        columns={["Сессия", "Участники", "Задачи", "Голоса", "Статус", "Обновлена", "Действия"]}
        empty={
          list.items.length === 0 && !list.loading ? (
            // Branching on filter state: with active filters the next
            // logical action is to clear them; on a clean slate the
            // next logical action is to create the very first session.
            // Either way the user always has a CTA — no dead-end.
            (q.trim() || active) ? (
              <EmptyState
                title="Ничего не найдено"
                description="По текущим фильтрам сессий нет. Сбросьте фильтры, чтобы увидеть полный список."
                action={
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setQ(""); setActive(""); }}
                  >
                    Сбросить фильтры
                  </Button>
                }
              />
            ) : (
              <EmptyState
                title="Ещё нет ни одной сессии"
                description="Создайте первую planning-сессию — позже сюда попадут все ваши прошедшие и активные."
                action={
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      setCreateTitle("");
                      setCreateError(null);
                      setCreateOpen(true);
                    }}
                  >
                    Создать первую сессию
                  </Button>
                }
              />
            )
          ) : null
        }
        mobileCards={list.items.map((item) => (
          <MobileRecordCard
            key={item.id}
            title={
              <button
                type="button"
                className="text-left text-base font-bold text-blue underline-offset-2 hover:underline"
                onClick={() => setSelectedId(item.id)}
              >
                {displaySessionTitle(item)}
              </button>
            }
            meta={
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink3">
                <TeamBadge teamId={item.team_id} team={item.team} />
                <span>id {item.id}</span>
                <span aria-hidden>·</span>
                <span>{sessionKeyChip(item)}</span>
                <span aria-hidden>·</span>
                <span>обновлена {formatDate(item.updated_at)}</span>
              </span>
            }
            action={<Status active={item.is_active} done={item.batch_completed} />}
            footer={
              // Simplified list-card: one primary CTA "Открыть" that
              // routes by status. Detailed actions (Закрыть / Удалить
              // / Переименовать) moved into the drawer below — same
              // place where the full session preview lives, so the
              // list stays scannable.
              <>
                <Button
                  size="sm"
                  variant="primary"
                  className="flex-1 min-w-[120px]"
                  onClick={() => openCockpit(item)}
                >
                  {item.batch_completed && !item.is_active ? "Открыть отчёт" : "Открыть"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="flex-1 min-w-[120px]"
                  onClick={() => setSelectedId(item.id)}
                >
                  Подробнее
                </Button>
              </>
            }
          >
            <MobileRecordField label="Участники" value={item.participants_count} />
            <MobileRecordField label="Задачи" value={item.total_tasks} />
            <MobileRecordField label="Голоса" value={item.total_votes} />
          </MobileRecordCard>
        ))}
      >
        {list.items.map((item) => (
          <tr key={item.id} className="border-t border-line hover:bg-line2/60">
            <td className="px-3 py-2 align-top">
              <button
                type="button"
                className="block w-full max-w-[22rem] break-words text-left font-semibold text-blue"
                onClick={() => setSelectedId(item.id)}
              >
                {displaySessionTitle(item)}
              </button>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink3">
                <TeamBadge teamId={item.team_id} team={item.team} />
                <span>id {item.id} · {sessionKeyChip(item)}</span>
              </p>
            </td>
            <td className="px-3 py-2 align-top tabular-nums">{item.participants_count}</td>
            <td className="px-3 py-2 align-top tabular-nums">{item.total_tasks}</td>
            <td className="px-3 py-2 align-top tabular-nums">{item.total_votes}</td>
            <td className="px-3 py-2 align-top"><Status active={item.is_active} done={item.batch_completed} /></td>
            <td className="px-3 py-2 align-top text-ink3 whitespace-nowrap">{formatDate(item.updated_at)}</td>
            <td className="px-3 py-2 align-top">
              {/* List rows: one primary action + a quieter "Подробнее"
                  that opens the drawer with everything else (rename,
                  close, delete, participants, queue editor). This
                  removes 2–3 duplicate buttons per row that were
                  competing for the user's attention. */}
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" variant="primary" onClick={() => openCockpit(item)}>
                  {item.batch_completed && !item.is_active ? "Открыть отчёт" : "Открыть"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelectedId(item.id)}>
                  Подробнее
                </Button>
              </div>
            </td>
          </tr>
        ))}
      </DataTable>

      <ConfirmDialog
        open={confirmAction?.kind === "close"}
        title="Закрыть сессию?"
        description={
          confirmAction?.kind === "close"
            ? `Все оставшиеся задачи сессии «${displaySessionTitle(confirmAction.item)}» будут зафиксированы как завершённые. Действие безопасно — повторное закрытие ничего не сломает.`
            : ""
        }
        confirmLabel="Закрыть"
        cancelLabel="Отмена"
        tone="primary"
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => {
          if (confirmAction?.kind === "close") {
            void runSessionAction("close", confirmAction.item);
          }
        }}
      />
      <ConfirmDialog
        open={confirmAction?.kind === "delete"}
        title="Удалить сессию из истории?"
        description={
          confirmAction?.kind === "delete"
            ? `Сессия «${displaySessionTitle(confirmAction.item)}», её задачи, голоса и invite-ссылки исчезнут из CMS. Запись в журнале действий сохранится. Действие отменить из интерфейса нельзя.`
            : ""
        }
        confirmLabel="Удалить"
        cancelLabel="Отмена"
        tone="danger"
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => {
          if (confirmAction?.kind === "delete") {
            void runSessionAction("delete", confirmAction.item);
          }
        }}
      />

      <CreateSessionDialog
        open={createOpen}
        title={createTitle}
        teamId={createTeamId}
        teams={teams}
        showTeamPicker={needsTeamPicker(teams, principal.is_superuser)}
        busy={createBusy}
        error={createError}
        onTitleChange={setCreateTitle}
        onTeamIdChange={setCreateTeamId}
        onCancel={() => createSessionGuard.confirmIfNeeded(() => {
          if (createBusy) return;
          setCreateOpen(false);
          setCreateError(null);
        })}
        onSubmit={submitCreate}
      />
      {createSessionGuard.dialog}

      {selectedId ? (
        <SessionDetails
          sessionId={selectedId}
          canManageTasks={canManageTasks}
          canManageSessions={canManageSessions}
          onClose={() => setSelectedId(null)}
          onRenamed={() => {
            void list.reload();
          }}
          onOpenCockpit={(detail) => {
            if (detail.batch_completed && !detail.is_active) {
              navigate(`/cms/sessions/${detail.chat_id}/report`);
              return;
            }
            navigate(`/cms/sessions/${detail.chat_id}/cockpit`);
          }}
          onOpenReport={(detail) => navigate(`/cms/sessions/${detail.chat_id}/report`)}
          onSessionAction={(kind, detail) => setConfirmAction({ kind, item: detail })}
          actionBusyId={actionBusy}
        />
      ) : null}
    </section>
  );
}

/**
 * Minimal modal for creating a new planning-poker session directly
 * from CMS. Reuses the design-system surface + an auto-focused
 * single-line text field. The default name ("Planning Poker") is
 * applied server-side if the user submits an empty value, mirroring
 * the legacy `/manage` flow so behaviour stays predictable.
 *
 * Implemented as the shared bottom sheet rather than a custom modal so
 * mobile session creation uses the same interaction pattern as menus.
 */
function CreateSessionDialog({
  open,
  title,
  teamId,
  teams,
  showTeamPicker,
  busy,
  error,
  onTitleChange,
  onTeamIdChange,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  title: string;
  teamId: number | "";
  teams: import("../api/cmsTypes").CmsTeam[];
  showTeamPicker: boolean;
  busy: boolean;
  error: string | null;
  onTitleChange: (next: string) => void;
  onTeamIdChange: (next: number | "") => void;
  onCancel: () => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <BottomSheet
      open={open}
      onClose={() => {
        if (!busy) onCancel();
      }}
      title="Новая сессия"
      description="Создадим пустую сессию и сразу откроем cockpit, чтобы вы могли добавить задачи и пригласить участников."
      footer={
        <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
          <Button
            type="button"
            variant="ghost"
            size="md"
            disabled={busy}
            onClick={onCancel}
            className="w-full md:w-auto"
          >
            Отмена
          </Button>
          <Button
            type="submit"
            form="cms-create-session-form"
            variant="primary"
            size="md"
            loading={busy}
            disabled={busy}
            className="w-full md:w-auto"
          >
            Создать и открыть
          </Button>
        </div>
      }
    >
      <form
        id="cms-create-session-form"
        className="space-y-3 px-3 pb-3 pt-1"
        onSubmit={onSubmit}
      >
        <TextField
          label="Название сессии"
          placeholder="Planning Poker"
          value={title}
          maxLength={200}
          autoFocus
          disabled={busy}
          onChange={(event) => onTitleChange(event.target.value)}
          hint="Можно оставить пустым — подставим «Planning Poker»."
        />
        {showTeamPicker ? (
          <TeamSelect
            teams={teams}
            value={teamId}
            required={teams.length > 1}
            disabled={busy}
            allowEmpty={teams.length === 0}
            onChange={onTeamIdChange}
          />
        ) : null}
        {error ? <Alert tone="danger">{error}</Alert> : null}
      </form>
    </BottomSheet>
  );
}

function SessionDetails({
  sessionId,
  canManageTasks,
  canManageSessions,
  onClose,
  onRenamed,
  onOpenCockpit,
  onOpenReport,
  onSessionAction,
  actionBusyId,
}: {
  sessionId: number;
  canManageTasks: boolean;
  canManageSessions: boolean;
  onClose: () => void;
  onRenamed?: (sessionId: number) => void;
  onOpenCockpit: (detail: SessionDetail) => void;
  onOpenReport: (detail: SessionDetail) => void;
  onSessionAction: (kind: "close" | "delete", detail: SessionDetail) => void;
  actionBusyId: number | null;
}) {
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bucket, setBucket] = useState("tasks_queue");
  const [taskSearch, setTaskSearch] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const debouncedTaskSearch = useDebouncedValue(taskSearch);
  const participantList = useCmsList<ParticipantItem>(`/sessions/${sessionId}/participants`, {});
  const taskParams = useMemo(
    () => ({ bucket: bucket || undefined, q: debouncedTaskSearch || undefined }),
    [bucket, debouncedTaskSearch]
  );
  const taskList = useCmsList<TaskItem>(`/sessions/${sessionId}/tasks`, taskParams);

  const refreshDetail = useCallback(async () => {
    setError(null);
    try {
      setDetail(await cmsFetch<SessionDetail>(`/sessions/${sessionId}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить сессию");
    }
  }, [sessionId]);

  useEffect(() => {
    void refreshDetail();
  }, [refreshDetail]);

  const refreshTasks = useCallback(async () => {
    await refreshDetail();
    await taskList.reload();
  }, [refreshDetail, taskList]);

  function startRename() {
    if (!detail) return;
    setRenameDraft(detail.title ?? "");
    setRenameError(null);
    setRenaming(true);
  }

  function cancelRename() {
    setRenaming(false);
    setRenameError(null);
    setRenameDraft("");
  }

  async function submitRename(event: FormEvent) {
    event.preventDefault();
    if (!detail || renameBusy) return;
    const trimmed = renameDraft.trim();
    if (trimmed.length > 200) {
      setRenameError("Название не должно превышать 200 символов.");
      return;
    }
    setRenameBusy(true);
    setRenameError(null);
    try {
      await cmsSessionsApi.rename(detail.id, trimmed.length > 0 ? trimmed : null);
      await refreshDetail();
      onRenamed?.(detail.id);
      setRenaming(false);
      setRenameDraft("");
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : "Не удалось переименовать сессию");
    } finally {
      setRenameBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-line bg-surface shadow-card">
      <header className="border-b border-line px-4 py-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            {renaming && detail ? (
              <form className="space-y-2" onSubmit={submitRename}>
                <TextField
                  aria-label="Название сессии"
                  placeholder={`Сессия #${detail.id}`}
                  value={renameDraft}
                  maxLength={200}
                  autoFocus
                  disabled={renameBusy}
                  onChange={(event) => setRenameDraft(event.target.value)}
                />
                <p className="text-xs text-ink3">
                  Оставьте пусто, чтобы вернуть стандартное название «Сессия #{detail.id}». Не более 200 символов.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" variant="primary" size="sm" disabled={renameBusy} loading={renameBusy}>
                    Сохранить
                  </Button>
                  <Button type="button" variant="ghost" size="sm" disabled={renameBusy} onClick={cancelRename}>
                    Отмена
                  </Button>
                </div>
                {renameError ? <InlineError text={renameError} /> : null}
              </form>
            ) : (
              <>
                <h3 className="break-words text-base font-bold text-ink">
                  {detail ? displaySessionTitle(detail) : `Сессия #${sessionId}`}
                </h3>
                <p className="text-xs text-ink3">
                  {detail
                    ? `обновлена ${formatDate(detail.updated_at)} · версия очереди v${detail.tasks_version} · id ${detail.id} · ${sessionKeyChip(detail)}`
                    : "Загрузка"}
                </p>
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Primary path: jump to the detail screens with tabs.
                The drawer keeps these two as quick-shortcuts; full
                page navigation is one click away. */}
            {detail ? (
              <>
                <Button variant="primary" size="sm" onClick={() => onOpenCockpit(detail)}>
                  Открыть cockpit
                </Button>
                <Button variant="ghost" size="sm" onClick={() => onOpenReport(detail)}>
                  Открыть отчёт
                </Button>
              </>
            ) : null}
            <Button variant="ghost" size="sm" className="whitespace-nowrap" onClick={() => void refreshTasks()}>
              Обновить
            </Button>
            {canManageSessions && detail && !renaming ? (
              <Button variant="ghost" size="sm" onClick={startRename}>
                Переименовать
              </Button>
            ) : null}
            {/* Destructive actions live here — moved out of the list
                rows so each session card stays scannable. They retain
                their colour (secondary / danger) so weight matches
                intent. */}
            {canManageSessions && detail && detail.is_active ? (
              <Button
                variant="secondary"
                size="sm"
                disabled={actionBusyId === detail.id}
                loading={actionBusyId === detail.id}
                onClick={() => onSessionAction("close", detail)}
              >
                Закрыть сессию
              </Button>
            ) : null}
            {canManageSessions && detail ? (
              <Button
                variant="danger"
                size="sm"
                disabled={actionBusyId === detail.id}
                onClick={() => onSessionAction("delete", detail)}
              >
                Удалить из истории
              </Button>
            ) : null}
            {/* Renamed from "Закрыть карточку" — the old label
                clashed with "Закрыть сессию" right next to it. */}
            <Button variant="ghost" size="sm" onClick={onClose}>
              Свернуть
            </Button>
          </div>
        </div>
      </header>
      {error ? <div className="p-4"><InlineError text={error} /></div> : null}
      {detail ? (
        <div className="grid gap-4 p-4 xl:grid-cols-[minmax(280px,360px)_1fr]">
          <div className="space-y-4">
            <ParticipantsBlock
              participants={participantList.items}
              loading={participantList.loading}
              loadingMore={participantList.loadingMore}
              error={participantList.error}
              hasMore={participantList.hasMore}
              reachedCap={participantList.reachedCap}
              total={participantList.total}
              onMore={participantList.loadMore}
            />
            <WebInviteesBlock sessionKey={detail.session_key} canManageSessions={canManageSessions} />
          </div>
          <TaskQueueEditor
            sessionId={sessionId}
            detail={detail}
            tasks={taskList.items}
            loading={taskList.loading}
            loadingMore={taskList.loadingMore}
            error={taskList.error}
            hasMore={taskList.hasMore}
            reachedCap={taskList.reachedCap}
            total={taskList.total}
            bucket={bucket}
            search={taskSearch}
            canManage={canManageTasks}
            onBucketChange={setBucket}
            onSearchChange={setTaskSearch}
            onMore={taskList.loadMore}
            onChanged={refreshTasks}
          />
        </div>
      ) : (
        <Skeleton height="h-40" />
      )}
    </section>
  );
}

function ParticipantsBlock({
  participants,
  loading,
  loadingMore,
  error,
  hasMore,
  reachedCap,
  total,
  onMore,
}: {
  participants: ParticipantItem[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  reachedCap: boolean;
  total: number | null;
  onMore: () => void;
}) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-bold text-ink">Участники</h4>
      <p className="text-xs text-ink3">Кто сейчас в сессии и какие у них роли. Имена обновляются при каждом подключении.</p>
      <CompactList
        loading={loading}
        loadingMore={loadingMore}
        error={error}
        hasMore={hasMore}
        reachedCap={reachedCap}
        loadedCount={participants.length}
        total={total}
        itemNoun="участников"
        onMore={onMore}
      >
        {participants.length === 0 && !loading ? (
          <p className="py-3 text-xs text-ink3">Пока никто не присоединился.</p>
        ) : null}
        {participants.map((item) => (
          <div
            key={item.user_id}
            className="grid grid-cols-[1fr_auto] gap-3 border-b border-line py-2 last:border-b-0"
          >
            <div className="min-w-0">
              <p className="break-words text-sm font-semibold text-ink">{item.name}</p>
              <p className="text-xs text-ink3">id {item.user_id}</p>
            </div>
            <Badge tone={item.role === "lead" ? "info" : "neutral"}>{item.role}</Badge>
          </div>
        ))}
      </CompactList>
    </div>
  );
}

function WebInviteesBlock({
  sessionKey,
  canManageSessions,
}: {
  sessionKey: string;
  canManageSessions: boolean;
}) {
  const params = useMemo(() => ({}), []);
  // The CMS API filters by token_hash; we instead pull recent entries and
  // narrow client-side by chat_id+topic_id from session_key (cheap for the
  // typical < 200 row payload). Saves another bespoke endpoint.
  const list = useCmsList<WebParticipantItem>("/web-participants", params);
  const [chatRaw, topicRaw] = sessionKey.split(":");
  const expectedChatId = Number(chatRaw);
  const expectedTopic = topicRaw === "none" ? null : Number(topicRaw);
  const filtered = list.items.filter((item) => {
    if (item.chat_id !== expectedChatId) return false;
    if ((item.topic_id ?? null) !== expectedTopic) return false;
    return true;
  });

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-bold text-ink">Заходили по invite-ссылке</h4>
      <p className="text-xs text-ink3">
        Лог веб-участников, которые открыли invite-ссылку и присоединились к сессии. Помогает понять, кто кого пригласил.
        {canManageSessions ? " Управление самими ссылками — в разделе «Invite-ссылки»." : ""}
      </p>
      <CompactList
        loading={list.loading}
        loadingMore={list.loadingMore}
        error={list.error}
        hasMore={list.hasMore}
        reachedCap={list.reachedCap}
        loadedCount={filtered.length}
        total={list.total}
        itemNoun="приглашений"
        onMore={list.loadMore}
      >
        {filtered.length === 0 && !list.loading ? (
          <p className="py-3 text-xs text-ink3">Никто не присоединялся по invite-ссылке.</p>
        ) : null}
        {filtered.map((item) => (
          <div key={item.id} className="grid grid-cols-[1fr_auto] gap-3 border-b border-line py-2 last:border-b-0">
            <div className="min-w-0">
              <p className="break-words text-sm font-semibold text-ink">{item.name}</p>
              <p className="text-xs text-ink3">
                {item.role} · присоединился {formatDate(item.joined_at)}
              </p>
              <p className="text-xs text-ink4">токен {shortHash(item.token_hash)}</p>
            </div>
            <Status active={item.is_active} label={item.is_active ? "активен" : "истёк"} />
          </div>
        ))}
      </CompactList>
    </div>
  );
}

function TaskQueueEditor({
  sessionId,
  detail,
  tasks,
  loading,
  loadingMore,
  error,
  hasMore,
  reachedCap,
  total,
  bucket,
  search,
  canManage,
  onBucketChange,
  onSearchChange,
  onMore,
  onChanged,
}: {
  sessionId: number;
  detail: SessionDetail;
  tasks: TaskItem[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  reachedCap: boolean;
  total: number | null;
  bucket: string;
  search: string;
  canManage: boolean;
  onBucketChange: (value: string) => void;
  onSearchChange: (value: string) => void;
  onMore: () => void;
  onChanged: () => Promise<void>;
}) {
  const reduceMotion = useReducedMotion();
  const [message, setMessage] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function run(action: string, mutation: () => Promise<unknown>) {
    setBusy(action);
    setMutationError(null);
    setMessage(null);
    try {
      await mutation();
      await onChanged();
      setMessage("Очередь обновлена.");
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : "Не удалось обновить очередь");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3 min-w-0">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h4 className="text-sm font-bold text-ink">Задачи</h4>
          <p className="text-xs text-ink3">
            Показано {tasks.length} · в очереди {detail.tasks_queue_count} · версия очереди v{detail.tasks_version}
          </p>
        </div>
        <div className="grid w-full max-w-full grid-cols-1 gap-2 sm:grid-cols-[minmax(180px,1fr)_180px]">
          <TextField
            aria-label="Поиск задач"
            placeholder="Поиск по summary, jira_key, id"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
          <SelectField
            aria-label="Раздел очереди"
            value={bucket}
            onChange={(event) => onBucketChange(event.target.value)}
          >
            <option value="tasks_queue">Очередь</option>
            <option value="history">История</option>
            <option value="last_batch">Последняя пачка</option>
            <option value="">Все разделы</option>
          </SelectField>
        </div>
      </div>

      {canManage ? (
        <ManualTaskPanel
          sessionId={sessionId}
          expectedVersion={detail.tasks_version}
          busy={busy}
          onRun={run}
        />
      ) : (
        <Alert>Просмотр доступен, но изменение очереди — нет.</Alert>
      )}

      {message ? <Alert tone="success">{message}</Alert> : null}
      {mutationError ? <InlineError text={mutationError} /> : null}

      <TaskVirtualList
        sessionId={sessionId}
        detail={detail}
        tasks={tasks}
        loading={loading}
        loadingMore={loadingMore}
        error={error}
        hasMore={hasMore}
        reachedCap={reachedCap}
        total={total}
        bucket={bucket}
        search={search}
        canManage={canManage}
        busy={busy}
        reduceMotion={Boolean(reduceMotion)}
        onMore={onMore}
        onRun={run}
      />
    </div>
  );
}

function TaskVirtualList({
  sessionId,
  detail,
  tasks,
  loading,
  loadingMore,
  error,
  hasMore,
  reachedCap,
  total,
  bucket,
  search,
  canManage,
  busy,
  reduceMotion,
  onMore,
  onRun,
}: {
  sessionId: number;
  detail: SessionDetail;
  tasks: TaskItem[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  reachedCap: boolean;
  total: number | null;
  bucket: string;
  search: string;
  canManage: boolean;
  busy: string | null;
  reduceMotion: boolean;
  onMore: () => void;
  onRun: (action: string, mutation: () => Promise<unknown>) => Promise<void>;
}) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const queueMode = bucket === "tasks_queue";

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    function sync() {
      setIsMobile(media.matches);
    }
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  const sortableTasks = tasks.filter((task) => task.task_uid);
  const sortableIds = sortableTasks.map((task) => task.task_uid);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const rowVirtualizer = useVirtualizer({
    count: tasks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 128,
    overscan: 8,
  });

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeTask = tasks.find((task) => task.task_uid === active.id);
    const overTask = tasks.find((task) => task.task_uid === over.id);
    if (!activeTask || !overTask) return;

    const canFullReorder = canUseFullReorder({
      bucket,
      hasMore,
      search,
      tasks,
      queueCount: detail.tasks_queue_count,
    });

    if (canFullReorder) {
      const orderedTaskIds = reorderedTaskIds(tasks, String(active.id), String(over.id));
      await onRun("reorder", async () => cmsTasksApi.reorder(sessionId, orderedTaskIds, detail.tasks_version));
      return;
    }

    await onRun(`move:${activeTask.task_uid}`, async () =>
      cmsTasksApi.move(sessionId, activeTask.task_uid, overTask.bucket_index, detail.tasks_version)
    );
  }

  const renderTask = (item: TaskItem) => (
    queueMode && canManage ? (
      <SortableTaskRow
        sessionId={sessionId}
        detail={detail}
        task={item}
        canManage={canManage && item.bucket === "tasks_queue" && Boolean(item.task_uid)}
        busy={busy}
        reduceMotion={reduceMotion}
        onRun={onRun}
      />
    ) : (
      <TaskRow
        sessionId={sessionId}
        detail={detail}
        task={item}
        canManage={false}
        busy={busy}
        reduceMotion={reduceMotion}
        onRun={onRun}
      />
    )
  );

  const mobileContent = (
    <div className="space-y-2">
      <AnimatePresence initial={false}>
        {tasks.map((item) => (
          <div key={`${item.bucket}:${item.task_uid || item.id}`}>
            {renderTask(item)}
          </div>
        ))}
      </AnimatePresence>
    </div>
  );

  const virtualizedContent = (
    <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: "relative" }}>
      <AnimatePresence initial={false}>
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const item = tasks[virtualRow.index];
          return (
            <div
              key={`${item.bucket}:${item.task_uid || item.id}`}
              ref={rowVirtualizer.measureElement}
              data-index={virtualRow.index}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {renderTask(item)}
            </div>
          );
        })}
      </AnimatePresence>
    </div>
  );

  const content = isMobile ? (
    mobileContent
  ) : (
    <ScrollArea
      className="max-h-[min(640px,70dvh)]"
      viewportClassName="max-h-[min(640px,70dvh)]"
      viewportRef={parentRef}
      hint="Ещё задачи"
    >
      {virtualizedContent}
    </ScrollArea>
  );

  return (
    <div className="rounded-lg border border-line px-3">
      {error ? <InlineError text={error} /> : null}
      {tasks.length === 0 && !loading ? <p className="py-4 text-sm text-ink3">Задач не найдено.</p> : null}
      {queueMode && canManage ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event) => void handleDragEnd(event)}>
          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            {content}
          </SortableContext>
        </DndContext>
      ) : (
        content
      )}
      <LoadMoreFooter
        variant="compact"
        loading={loading}
        loadingMore={loadingMore}
        hasMore={hasMore}
        reachedCap={reachedCap}
        loadedCount={tasks.length}
        total={total}
        onMore={onMore}
        itemNoun="задач"
      />
    </div>
  );
}

function SortableTaskRow(props: {
  sessionId: number;
  detail: SessionDetail;
  task: TaskItem;
  canManage: boolean;
  busy: string | null;
  reduceMotion: boolean;
  onRun: (action: string, mutation: () => Promise<unknown>) => Promise<void>;
}) {
  const isCurrent = props.detail.current_task_id === props.task.task_uid;
  const currentLocked = props.detail.is_active && isCurrent;
  const sortable = useSortable({
    id: props.task.task_uid,
    disabled: !props.canManage || currentLocked || props.busy !== null,
  });
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0.72 : 1,
  };

  return (
    <div ref={sortable.setNodeRef} style={style}>
      <TaskRow
        {...props}
        dragHandleProps={{
          attributes: sortable.attributes as unknown as Record<string, unknown>,
          listeners: sortable.listeners as unknown as Record<string, unknown>,
          isDragging: sortable.isDragging,
        }}
      />
    </div>
  );
}

function ManualTaskPanel({
  sessionId,
  expectedVersion,
  busy,
  onRun,
}: {
  sessionId: number;
  expectedVersion: number;
  busy: string | null;
  onRun: (action: string, mutation: () => Promise<unknown>) => Promise<void>;
}) {
  const [summary, setSummary] = useState("");
  const [jiraKey, setJiraKey] = useState("");
  const [url, setUrl] = useState("");
  const [storyPoints, setStoryPoints] = useState("");

  function taskBody(): CmsTaskBody {
    return {
      summary: summary.trim(),
      jira_key: normalizeOptionalText(jiraKey),
      url: normalizeOptionalText(url),
      story_points: normalizeOptionalNumber(storyPoints),
      expected_version: expectedVersion,
    };
  }

  async function submitManual(event: FormEvent) {
    event.preventDefault();
    const body = taskBody();
    if (!body.summary) return;
    await onRun("create", async () => cmsTasksApi.create(sessionId, body));
    setSummary("");
    setJiraKey("");
    setUrl("");
    setStoryPoints("");
  }

  return (
    <div className="grid gap-3 xl:grid-cols-2">
      <JiraImportPanel
        sessionId={sessionId}
        expectedVersion={expectedVersion}
        busy={busy}
        onRun={onRun}
      />
      <Surface as="form" className="space-y-3 p-3" onSubmit={submitManual}>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink3">Добавить задачу вручную</p>
        <div className="grid gap-2 sm:grid-cols-[1fr_120px]">
          <TextField label="Summary" placeholder="Кейс или фича" value={summary} onChange={(event) => setSummary(event.target.value)} />
          <TextField label="SP" inputMode="numeric" value={storyPoints} onChange={(event) => setStoryPoints(event.target.value)} />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <TextField label="Jira key" placeholder="PROJ-123" value={jiraKey} onChange={(event) => setJiraKey(event.target.value)} />
          <TextField label="URL" placeholder="https://..." value={url} onChange={(event) => setUrl(event.target.value)} />
        </div>
        <Button type="submit" variant="primary" className="w-full" disabled={busy !== null || !summary.trim()}>
          Добавить задачу
        </Button>
      </Surface>
    </div>
  );
}

function JiraImportPanel({
  sessionId,
  expectedVersion,
  busy,
  onRun,
}: {
  sessionId: number;
  expectedVersion: number;
  busy: string | null;
  onRun: (action: string, mutation: () => Promise<unknown>) => Promise<void>;
}) {
  const [jql, setJql] = useState("");
  const [maxResults, setMaxResults] = useState("500");
  const [preview, setPreview] = useState<JiraPreview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const importable = preview?.items.filter((item) => !item.duplicate) ?? [];
  const selectedKeys = Array.from(selected);

  async function loadPreview(event: FormEvent) {
    event.preventDefault();
    if (!jql.trim()) return;
    setPreviewBusy(true);
    setPreviewError(null);
    try {
      const result = await cmsTasksApi.jiraPreview(sessionId, jql.trim(), normalizeOptionalNumber(maxResults) ?? 500);
      setPreview(result);
      setSelected(new Set(result.items.filter((item) => !item.duplicate).map((item) => item.key)));
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : "Не удалось получить выборку из Jira");
    } finally {
      setPreviewBusy(false);
    }
  }

  async function importSelected() {
    if (!jql.trim() || selectedKeys.length === 0) return;
    await onRun("jira-import", async () =>
      cmsTasksApi.jiraImport(sessionId, {
        jql: jql.trim(),
        max_results: normalizeOptionalNumber(maxResults) ?? 500,
        selected_keys: selectedKeys,
        expected_version: expectedVersion,
      })
    );
    setPreview(null);
    setSelected(new Set());
  }

  function toggle(key: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  return (
    <Surface as="form" className="space-y-3 p-3" onSubmit={loadPreview}>
      <p className="text-xs font-semibold uppercase tracking-wide text-ink3">Импорт из Jira</p>
      <div className="grid gap-2 sm:grid-cols-[1fr_110px]">
        <TextField label="JQL" placeholder="Пользуйтесь поиском задач в Jira через JQL" value={jql} onChange={(event) => setJql(event.target.value)} />
        <TextField label="Лимит" inputMode="numeric" value={maxResults} onChange={(event) => setMaxResults(event.target.value)} />
      </div>
      <Button type="submit" variant="secondary" className="w-full" disabled={busy !== null || previewBusy || !jql.trim()} loading={previewBusy}>
        {previewBusy ? "Запрашиваем" : "Предпросмотр"}
      </Button>
      {previewError ? <InlineError text={previewError} /> : null}
      {preview ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink3">
            <span>можно импортировать {preview.importable} из {preview.total} · выбрано {selectedKeys.length}</span>
            <button
              type="button"
              className="font-semibold text-blue"
              onClick={() => setSelected(new Set(importable.map((item) => item.key)))}
            >
              Выбрать все
            </button>
          </div>
          <ScrollArea
            className="max-md:max-h-none max-md:rounded-lg max-md:border-0 md:max-h-56 md:rounded-lg md:border md:border-line"
            viewportClassName="max-md:max-h-none max-md:overflow-visible md:max-h-56 md:px-2"
            hint="Ещё задачи"
          >
            {preview.items.map((item) => (
              <label key={item.key} className="flex items-start gap-2 border-b border-line py-2 last:border-b-0">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={selected.has(item.key)}
                  disabled={item.duplicate}
                  onChange={() => toggle(item.key)}
                />
                <span className="min-w-0">
                  <span className="block text-xs font-bold text-ink">{item.key}{item.duplicate ? " · уже в очереди" : ""}</span>
                  <span className="block whitespace-normal break-words text-xs text-ink3">{item.summary}</span>
                </span>
              </label>
            ))}
          </ScrollArea>
          <Button
            type="button"
            variant="primary"
            className="w-full"
            disabled={busy !== null || selectedKeys.length === 0}
            onClick={() => void importSelected()}
          >
            Импортировать выбранные
          </Button>
        </div>
      ) : null}
    </Surface>
  );
}

function TaskRow({
  sessionId,
  detail,
  task,
  canManage,
  busy,
  reduceMotion,
  onRun,
  dragHandleProps,
}: {
  sessionId: number;
  detail: SessionDetail;
  task: TaskItem;
  canManage: boolean;
  busy: string | null;
  reduceMotion: boolean;
  onRun: (action: string, mutation: () => Promise<unknown>) => Promise<void>;
  dragHandleProps?: {
    attributes: Record<string, unknown>;
    listeners?: Record<string, unknown>;
    isDragging: boolean;
  };
}) {
  const [editing, setEditing] = useState(false);
  const [summary, setSummary] = useState(task.summary);
  const [jiraKey, setJiraKey] = useState(task.jira_key ?? "");
  const [url, setUrl] = useState(task.url ?? "");
  const [storyPoints, setStoryPoints] = useState(task.story_points === null ? "" : String(task.story_points));
  const [deleteOpen, setDeleteOpen] = useState(false);
  const isCurrent = detail.current_task_id === task.task_uid;
  const currentLocked = detail.is_active && isCurrent;
  const disabled = busy !== null || !canManage || currentLocked;

  useEffect(() => {
    setSummary(task.summary);
    setJiraKey(task.jira_key ?? "");
    setUrl(task.url ?? "");
    setStoryPoints(task.story_points === null ? "" : String(task.story_points));
  }, [task]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!summary.trim()) return;
    await onRun(`edit:${task.task_uid}`, async () =>
      cmsTasksApi.update(sessionId, task.task_uid, {
        summary: summary.trim(),
        jira_key: normalizeOptionalText(jiraKey),
        url: normalizeOptionalText(url),
        story_points: normalizeOptionalNumber(storyPoints),
        expected_version: detail.tasks_version,
      })
    );
    setEditing(false);
  }

  async function move(targetIndex: number) {
    await onRun(`move:${task.task_uid}`, async () =>
      cmsTasksApi.move(sessionId, task.task_uid, targetIndex, detail.tasks_version)
    );
  }

  async function remove() {
    setDeleteOpen(false);
    await onRun(`delete:${task.task_uid}`, async () =>
      cmsTasksApi.delete(sessionId, task.task_uid, detail.tasks_version)
    );
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: reduceMotion ? 0 : 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.16 }}
      className="border-b border-line py-3 last:border-b-0"
    >
      {editing ? (
        <form className="space-y-2" onSubmit={save}>
          <TextField label="Summary" value={summary} onChange={(event) => setSummary(event.target.value)} />
          <div className="grid gap-2 sm:grid-cols-[140px_1fr_100px]">
            <TextField label="Jira key" placeholder="Jira key" value={jiraKey} onChange={(event) => setJiraKey(event.target.value)} />
            <TextField label="URL" placeholder="URL" value={url} onChange={(event) => setUrl(event.target.value)} />
            <TextField label="SP" placeholder="SP" inputMode="numeric" value={storyPoints} onChange={(event) => setStoryPoints(event.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="primary" size="sm" disabled={busy !== null || !summary.trim()}>Сохранить</Button>
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>Отмена</Button>
          </div>
        </form>
      ) : (
        <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="break-all text-sm font-semibold text-ink">{task.jira_key ?? `manual ${task.bucket_index + 1}`}</p>
              <Status active={task.bucket === "tasks_queue"} done={task.bucket !== "tasks_queue"} label={task.source} />
              {isCurrent ? <Badge tone="info">текущая</Badge> : null}
            </div>
            <p className="break-words text-sm text-ink2">{task.summary || "Без описания"}</p>
            <p className="text-xs text-ink4">
              #{task.bucket_index + 1} · {task.bucket} · {task.votes_count} голосов · среднее {task.numeric_avg ?? "—"} · максимум {task.numeric_max ?? "—"}
            </p>
          </div>
          {canManage ? (
            <div className="grid grid-cols-3 gap-1 sm:flex sm:flex-wrap sm:justify-end sm:max-w-[360px]">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={dragHandleProps?.isDragging ? "bg-line2 text-blue" : ""}
                disabled={disabled || !dragHandleProps}
                title="Перетащить"
                {...(dragHandleProps?.attributes ?? {})}
                {...(dragHandleProps?.listeners ?? {})}
              >
                Drag
              </Button>
              <Button variant="ghost" size="sm" disabled={disabled || task.bucket_index === 0} title="В начало" onClick={() => void move(0)}>В начало</Button>
              <Button variant="ghost" size="sm" disabled={disabled || task.bucket_index === 0} title="Вверх" onClick={() => void move(task.bucket_index - 1)}>↑</Button>
              <Button variant="ghost" size="sm" disabled={disabled || task.bucket_index >= detail.tasks_queue_count - 1} title="Вниз" onClick={() => void move(task.bucket_index + 1)}>↓</Button>
              <Button variant="ghost" size="sm" disabled={disabled || task.bucket_index >= detail.tasks_queue_count - 1} title="В конец" onClick={() => void move(detail.tasks_queue_count - 1)}>В конец</Button>
              <Button variant="ghost" size="sm" disabled={busy !== null || !canManage} onClick={() => setEditing(true)}>Изменить</Button>
              <Button variant="danger" size="sm" disabled={disabled} onClick={() => setDeleteOpen(true)}>Удалить</Button>
            </div>
          ) : null}
          {currentLocked ? (
            <p className="text-xs text-ink4 lg:col-span-2">Текущая задача заблокирована — идёт голосование.</p>
          ) : null}
        </div>
      )}
      <ConfirmDialog
        open={deleteOpen}
        title="Удалить задачу?"
        description="Задача будет убрана из активной очереди. Это действие нельзя отменить через CMS."
        confirmLabel="Удалить"
        cancelLabel="Отмена"
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => void remove()}
      />
    </motion.div>
  );
}
