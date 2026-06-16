import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import {
  Alert,
  AiGenerationProgress,
  AiSparkleButton,
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  SelectField,
  Spinner,
  Surface,
  TextField,
  TextareaField,
  useToast,
} from "../../../design-system";
import {
  cmsScopeApi,
  type ScopeAiAnalyzeResult,
  type ScopeAnalyzeStartResponse,
  type ScopeBoardIssue,
  type ScopeBoardRecord,
  type ScopeBoardSnapshot,
  type ScopePriorityQueueKind,
  type ScopeReleaseQuery,
  type ScopeReleaseSlot,
} from "../api/cmsClient";
import { AI_JOB_POLL_INTERVAL_MS, pollAiJob, SCOPE_AI_POLL_TIMEOUT_MS } from "../../../shared/lib/pollAiJob";
import type { CmsPrincipal } from "../api/cmsTypes";
import {
  HelpCallout,
  InlineError,
  MobileRecordCard,
  MobileRecordField,
  SectionHeader,
  Skeleton,
  Toolbar,
} from "../components/CmsPrimitives";
import { TeamBadge } from "../components/TeamBadge";
import { TeamFilter, teamFilterParams } from "../components/TeamFilter";
import {
  TeamSelect,
  useTeamIdState,
} from "../components/TeamSelect";
import { useCmsTeams } from "../hooks/useCmsTeams";
import { useUnsavedChangesGuard } from "../hooks/useUnsavedChangesGuard";
import {
  currentMonthValue,
  computeScopeReport,
  formatScopeDisplayMonth,
  formatScopeSp,
  intakeStatusMeta,
  normalizeScopeReport,
  resolveOpenQuestions,
} from "./scopeBoardHelpers";
import { ScopeActivityFeed } from "./ScopeActivityFeed";
import { ScopeAiPanel } from "./ScopeAiPanel";
import { ScopeFloatingTodo } from "./ScopeFloatingTodo";
import { ScopeIncrementalFooter } from "./ScopeIncrementalFooter";
import { ScopePriorityQueuesSection } from "./ScopePriorityQueuesSection";
import { ScopeReportSection } from "./ScopeReportSection";
import { ScopeTopItemsSection } from "./ScopeTopItemsSection";
import { ScopeSectionEditor } from "./ScopeSectionEditor";
import { ScopeAssigneeCharts } from "./ScopeAssigneeCharts";
import { ScopePlanInsights, planChangeReasonLabel } from "./scopePlanInsights";
import { ScopeVisualDashboard, type ScopeDataQualityDetails, type ScopeReportSummary } from "./ScopeVisualDashboard";
import { SortableScopeBlock } from "./SortableScopeBlock";
import {
  DEFAULT_SCOPE_LAYOUT_ORDER,
  mergeScopeLayoutOrder,
  reorderScopeLayoutOrder,
  type ScopeLayoutBlockKey,
} from "./scopeLayoutOrder";
import {
  defaultScopeSections,
  normalizeScopeSectionOrder,
  resolveScopeSections,
  resolveSnapshotSections,
  validateScopeSections,
} from "./scopeSectionHelpers";
import { useIncrementalList } from "./scopeListPaging";
import type { ScopeAiSummary, ScopeAiHistoryEntry } from "./scopeAiTypes";
import { printScopeReport } from "./scopeReportPrint";
import type { ScopeSectionConfig } from "../api/cmsClient";

interface ScopeBoardShellProps {
  principal: CmsPrincipal;
  canManage: boolean;
}

interface ScopeBoardForm {
  name: string;
  month: string;
  capacity_sp: string;
  scope_sections: ScopeSectionConfig[];
  todo_jql: string;
  test_jql: string;
  previous_release_jql: string;
  next_release_jql: string;
  custom_release_name: string;
  custom_release_jql: string;
  release_queries: ScopeReleaseQuery[];
  release_comment: string;
  previous_release_comment: string;
  next_release_comment: string;
  custom_release_comment: string;
}

function createReleaseQuery(type: ScopeReleaseQuery["type"] = "future"): ScopeReleaseQuery {
  const id =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `release-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return { id, type, label: "", jql: "" };
}

function normalizeReleaseQueries(
  queries: ScopeReleaseQuery[] | null | undefined,
  legacy?: {
    previous_release_jql?: string;
    next_release_jql?: string;
    custom_release_name?: string;
    custom_release_jql?: string;
  },
): ScopeReleaseQuery[] {
  const normalized: ScopeReleaseQuery[] = (queries ?? [])
    .filter((query) => query && typeof query.jql === "string")
    .map((query, index) => ({
      id: query.id || `release-${index + 1}`,
      type: query.type === "past" ? "past" : "future",
      label: query.label ?? "",
      jql: query.jql ?? "",
    }));
  if (normalized.length > 0) return normalized;

  const legacyQueries: ScopeReleaseQuery[] = [];
  if (legacy?.previous_release_jql?.trim()) {
    legacyQueries.push({ id: "previous", type: "past", label: "Предыдущий релиз", jql: legacy.previous_release_jql });
  }
  if (legacy?.next_release_jql?.trim()) {
    legacyQueries.push({ id: "next", type: "future", label: "Следующий релиз", jql: legacy.next_release_jql });
  }
  if (legacy?.custom_release_jql?.trim()) {
    legacyQueries.push({
      id: "custom",
      type: "future",
      label: legacy.custom_release_name?.trim() || "Дополнительный релиз",
      jql: legacy.custom_release_jql,
    });
  }
  return legacyQueries;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function formatCreated(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("ru-RU");
  } catch {
    return iso;
  }
}

function boardToForm(board: ScopeBoardRecord): ScopeBoardForm {
  const legacyReleaseQueries = normalizeReleaseQueries(board.release_queries, {
    previous_release_jql: board.previous_release_jql ?? "",
    next_release_jql: board.next_release_jql ?? "",
    custom_release_name: board.custom_release_name ?? "",
    custom_release_jql: board.custom_release_jql ?? "",
  });
  return {
    name: board.name,
    month: board.month,
    capacity_sp: String(board.capacity_sp),
    scope_sections: normalizeScopeSectionOrder(resolveScopeSections(board)),
    todo_jql: board.todo_jql ?? "",
    test_jql: board.test_jql ?? "",
    previous_release_jql: legacyReleaseQueries.length > 0 ? "" : board.previous_release_jql ?? "",
    next_release_jql: legacyReleaseQueries.length > 0 ? "" : board.next_release_jql ?? "",
    custom_release_name: legacyReleaseQueries.length > 0 ? "" : board.custom_release_name ?? "",
    custom_release_jql: legacyReleaseQueries.length > 0 ? "" : board.custom_release_jql ?? "",
    release_queries: legacyReleaseQueries,
    release_comment: board.release_comment ?? "",
    previous_release_comment: board.previous_release_comment ?? "",
    next_release_comment: board.next_release_comment ?? "",
    custom_release_comment: board.custom_release_comment ?? "",
  };
}

function defaultForm(): ScopeBoardForm {
  return {
    name: "",
    month: currentMonthValue(),
    capacity_sp: "80",
    scope_sections: defaultScopeSections(),
    todo_jql: "",
    test_jql: "",
    previous_release_jql: "",
    next_release_jql: "",
    custom_release_name: "",
    custom_release_jql: "",
    release_queries: [],
    release_comment: "",
    previous_release_comment: "",
    next_release_comment: "",
    custom_release_comment: "",
  };
}

function parseCapacity(raw: string): number | null {
  const value = Number(raw.replace(",", "."));
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

function sumIssueSp(issues: ScopeBoardIssue[]): number {
  return issues.reduce((sum, issue) => {
    const sp = issue.story_points;
    return sum + (typeof sp === "number" && sp > 0 ? sp : 0);
  }, 0);
}

function isReleaseTemplateTeam(team: { slug?: string; name?: string } | null | undefined): boolean {
  if (!team) return false;
  const haystack = `${team.slug ?? ""} ${team.name ?? ""}`.toLowerCase();
  return haystack.includes("ios") || haystack.includes("android") || haystack.includes("igaming");
}

function hasRoleAttribution(issue: ScopeBoardIssue, role: "front" | "back"): boolean {
  const contributor = issue.role_contributors?.[role];
  if (contributor?.name?.trim()) return true;
  return (issue.role_evidence ?? []).some(
    (item) => item.role === role && !item.unresolved_reason && (item.name?.trim() || item.source_url?.trim())
  );
}

function isStaleOppositeRoleGap(issue: ScopeBoardIssue, role: string): boolean {
  if (role !== "front" && role !== "back") return false;
  const oppositeRole = role === "front" ? "back" : "front";
  return hasRoleAttribution(issue, oppositeRole);
}

function buildReportSummary(snapshot: ScopeBoardSnapshot): ScopeReportSummary {
  const report = snapshot.report ? normalizeScopeReport(snapshot.report) : computeScopeReport(snapshot);
  const sections = report.sections ?? [report.plan, report.unplan];
  return sections.reduce<ScopeReportSummary>(
    (summary, section) => ({
      inWorkSp: summary.inWorkSp + sumIssueSp(section.in_work ?? []),
      doneSp: summary.doneSp + sumIssueSp(section.done ?? []),
    }),
    { inWorkSp: 0, doneSp: 0 }
  );
}

function buildDataQualityDetails(snapshot: ScopeBoardSnapshot): ScopeDataQualityDetails {
  const unestimated = (snapshot.metrics?.unestimated_tasks ?? []).map((issue) => ({
    key: issue.key,
    summary: issue.summary,
    url: issue.url,
    status: issue.status,
    section: issue.section_name || issue.bucket,
    storyPoints: issue.story_points,
  }));
  const roleByKey = new Map<string, ScopeDataQualityDetails["roleIssues"][number]>();

  for (const section of resolveSnapshotSections(snapshot)) {
    for (const issue of section.issues) {
      const reasons = (issue.role_evidence ?? [])
        .filter((item) => item.unresolved_reason && !isStaleOppositeRoleGap(issue, item.role))
        .map((item) => `${item.role}: ${item.unresolved_reason}`);
      if (reasons.length === 0) continue;
      const existing = roleByKey.get(issue.key);
      const mergedReasons = Array.from(new Set([...(existing?.reasons ?? []), ...reasons]));
      roleByKey.set(issue.key, {
        key: issue.key,
        summary: issue.summary,
        url: issue.url,
        status: issue.status,
        section: issue.section_name || section.name,
        storyPoints: issue.story_points,
        reasons: mergedReasons,
      });
    }
  }

  return {
    unestimated,
    roleIssues: Array.from(roleByKey.values()),
  };
}

export default function ScopeBoardShell({ principal, canManage }: ScopeBoardShellProps) {
  return (
    <Routes>
      <Route index element={<ScopeBoardListPage principal={principal} canManage={canManage} />} />
      <Route path="new" element={<ScopeBoardEditorPage principal={principal} canManage={canManage} mode="create" />} />
      <Route path=":boardId" element={<ScopeBoardEditorPage principal={principal} canManage={canManage} mode="edit" />} />
      <Route path="*" element={<Navigate to="." replace />} />
    </Routes>
  );
}

function ScopeBoardListPage({ principal, canManage }: { principal: CmsPrincipal; canManage: boolean }) {
  const navigate = useNavigate();
  const { teams } = useCmsTeams(principal);
  const [teamFilter, setTeamFilter] = useState("");
  const [teamSort, setTeamSort] = useState(false);
  const [items, setItems] = useState<ScopeBoardRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ScopeBoardRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await cmsScopeApi.list({
        ...teamFilterParams(teamFilter),
        sort: teamSort && principal.is_superuser ? "team_then_updated" : undefined,
      });
      setItems(res.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить отчёты.");
    } finally {
      setLoading(false);
    }
  }, [principal.is_superuser, teamFilter, teamSort]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await cmsScopeApi.delete(pendingDelete.id);
      setItems((current) => current.filter((item) => item.id !== pendingDelete.id));
      setPendingDelete(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось удалить отчёт.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="space-y-5">
      <SectionHeader
        title="Отчёт месяца"
        description="JQL-секции, буфер capacity, статус задач и очереди на груминг — по команде."
        actions={
          canManage ? (
            <Button variant="primary" size="sm" onClick={() => navigate("new")}>
              Новый отчёт
            </Button>
          ) : undefined
        }
      />

      <HelpCallout title="Кратко">
        <p>
          Создайте отчёт для команды, задайте capacity и JQL-секции. Нажмите «Обновить из Jira» —
          несохранённые JQL применятся автоматически. Другие команды ваш отчёт не видят.
        </p>
      </HelpCallout>

      {error ? <InlineError text={error} /> : null}

      {principal.is_superuser ? (
        <Toolbar>
          <TeamFilter teams={teams} value={teamFilter} onChange={setTeamFilter} />
          <SelectField
            aria-label="Сортировка boards"
            value={teamSort ? "team" : "updated"}
            onChange={(event) => setTeamSort(event.target.value === "team")}
          >
            <option value="updated">По дате обновления</option>
            <option value="team">По команде</option>
          </SelectField>
        </Toolbar>
      ) : null}

      {loading ? (
        <Skeleton height="h-40" />
      ) : items.length === 0 ? (
        <EmptyState
          title="Ещё нет ни одного отчёта"
          description="Создайте первый отчёт месяца для вашей команды."
          action={
            canManage ? (
              <Button variant="primary" onClick={() => navigate("new")}>
                Новый отчёт
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ScopeBoardList items={items} canManage={canManage} onOpen={(id) => navigate(`${id}`)} onDelete={setPendingDelete} />
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Удалить отчёт?"
        description={
          pendingDelete ? (
            <span>
              Отчёт <b>«{pendingDelete.name}»</b> будет удалён без возможности восстановить.
            </span>
          ) : (
            <span />
          )
        }
        confirmLabel="Удалить"
        cancelLabel="Отмена"
        tone="danger"
        busy={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </section>
  );
}

function ScopeBoardList({
  items,
  canManage,
  onOpen,
  onDelete,
}: {
  items: ScopeBoardRecord[];
  canManage: boolean;
  onOpen: (id: number) => void;
  onDelete: (record: ScopeBoardRecord) => void;
}) {
  const { visibleItems, hasMore, loadMore, loadedCount, total } = useIncrementalList(items);

  return (
    <div className="space-y-3 lg:space-y-0">
      <div className="grid grid-cols-1 gap-3 lg:hidden">
        {visibleItems.map((item) => {
          const metrics = item.snapshot?.metrics;
          const intake = metrics ? intakeStatusMeta(metrics.intake_status, metrics) : null;
          return (
            <MobileRecordCard
              key={item.id}
              title={item.name}
              meta={
                <span className="flex flex-wrap items-center gap-2">
                  <TeamBadge teamId={item.team_id} team={item.team} />
                  <span>{formatScopeDisplayMonth(item.month)}</span>
                  {intake ? <Badge tone={intake.tone}>{intake.label}</Badge> : null}
                </span>
              }
              footer={
                <>
                  <Button size="sm" variant="primary" className="w-full min-[420px]:w-auto" onClick={() => onOpen(item.id)}>
                    Открыть
                  </Button>
                  {canManage ? (
                    <Button size="sm" variant="ghost" className="w-full min-[420px]:w-auto" onClick={() => onDelete(item)}>
                      Удалить
                    </Button>
                  ) : null}
                </>
              }
            >
              <MobileRecordField label="Capacity" value={metrics ? `${formatScopeSp(metrics.capacity_sp)} SP` : "—"} />
              <MobileRecordField label="Буфер" value={metrics ? `${formatScopeSp(metrics.buffer_sp)} SP` : "—"} />
              <MobileRecordField label="Обновлён" value={formatDate(item.updated_at)} />
            </MobileRecordCard>
          );
        })}
      </div>

      <div className="hidden overflow-hidden rounded-lg border border-line bg-surface shadow-card lg:block">
        <table className="w-full table-auto text-sm">
          <thead className="bg-line2 text-xs uppercase text-ink3">
            <tr>
              <th className="px-3 py-2 text-left font-bold">Название</th>
              <th className="px-3 py-2 text-left font-bold">Месяц</th>
              <th className="px-3 py-2 text-left font-bold">Буфер</th>
              <th className="px-3 py-2 text-left font-bold">Intake</th>
              <th className="px-3 py-2 text-left font-bold">Обновлён</th>
              <th className="px-3 py-2 text-right font-bold">Действия</th>
            </tr>
          </thead>
          <tbody>
            {visibleItems.map((item) => {
              const metrics = item.snapshot?.metrics;
              const intake = metrics ? intakeStatusMeta(metrics.intake_status, metrics) : null;
              return (
                <tr key={item.id} className="border-t border-line">
                  <td className="px-3 py-2 align-top">
                    <button
                      type="button"
                      onClick={() => onOpen(item.id)}
                      className="text-left font-semibold text-ink hover:text-blue focus-visible:outline-none focus-visible:underline"
                    >
                      {item.name}
                    </button>
                    <p className="mt-1">
                      <TeamBadge teamId={item.team_id} team={item.team} />
                    </p>
                  </td>
                  <td className="px-3 py-2 align-top text-ink2">{formatScopeDisplayMonth(item.month)}</td>
                  <td className="px-3 py-2 align-top text-ink2">
                    {metrics ? `${formatScopeSp(metrics.buffer_sp)} SP` : "—"}
                  </td>
                  <td className="px-3 py-2 align-top">
                    {intake ? <Badge tone={intake.tone}>{intake.label}</Badge> : "—"}
                  </td>
                  <td className="px-3 py-2 align-top text-ink3">{formatDate(item.updated_at)}</td>
                  <td className="px-3 py-2 align-top text-right">
                    <div className="inline-flex gap-1.5">
                      <Button size="sm" variant="ghost" onClick={() => onOpen(item.id)}>
                        Открыть
                      </Button>
                      {canManage ? (
                        <Button size="sm" variant="danger" onClick={() => onDelete(item)}>
                          Удалить
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ScopeIncrementalFooter
        loadedCount={loadedCount}
        total={total}
        hasMore={hasMore}
        onMore={loadMore}
        itemNoun="отчётов"
      />
    </div>
  );
}

interface ScopeBoardPayload {
  name: string;
  month: string;
  capacity_sp: number;
  scope_sections: ScopeSectionConfig[];
  todo_jql: string;
  test_jql: string;
  previous_release_jql: string;
  next_release_jql: string;
  custom_release_name: string;
  custom_release_jql: string;
  release_queries: ScopeReleaseQuery[];
  release_comment: string;
  previous_release_comment: string;
  next_release_comment: string;
  custom_release_comment: string;
}

function validateScopeForm(form: ScopeBoardForm): { error: string } | { payload: ScopeBoardPayload } {
  const capacity = parseCapacity(form.capacity_sp);
  if (!form.name.trim()) {
    return { error: "Укажите название board." };
  }
  if (!form.month.match(/^\d{4}-\d{2}$/)) {
    return { error: "Месяц должен быть в формате YYYY-MM." };
  }
  if (capacity === null) {
    return { error: "Capacity должен быть неотрицательным числом." };
  }
  const sectionError = validateScopeSections(form.scope_sections);
  if (sectionError) {
    return { error: sectionError };
  }
  return {
    payload: {
      name: form.name.trim(),
      month: form.month.trim(),
      capacity_sp: capacity,
      scope_sections: normalizeScopeSectionOrder(form.scope_sections),
      todo_jql: form.todo_jql.trim(),
      test_jql: form.test_jql.trim(),
      previous_release_jql: form.previous_release_jql.trim(),
      next_release_jql: form.next_release_jql.trim(),
      custom_release_name: form.custom_release_name.trim(),
      custom_release_jql: form.custom_release_jql.trim(),
      release_queries: form.release_queries
        .map((query) => ({
          id: query.id,
          type: query.type,
          label: (query.label ?? "").trim(),
          jql: query.jql.trim(),
        }))
        .filter((query) => query.jql.length > 0),
      release_comment: form.release_comment.trim(),
      previous_release_comment: form.previous_release_comment.trim(),
      next_release_comment: form.next_release_comment.trim(),
      custom_release_comment: form.custom_release_comment.trim(),
    },
  };
}

function ReleaseQueriesEditor({
  queries,
  disabled,
  onChange,
}: {
  queries: ScopeReleaseQuery[];
  disabled: boolean;
  onChange: (queries: ScopeReleaseQuery[]) => void;
}) {
  function updateQuery(index: number, patch: Partial<ScopeReleaseQuery>) {
    onChange(queries.map((query, currentIndex) => (currentIndex === index ? { ...query, ...patch } : query)));
  }

  function addQuery() {
    onChange([...queries, createReleaseQuery("future")]);
  }

  function removeQuery(index: number) {
    onChange(queries.filter((_, currentIndex) => currentIndex !== index));
  }

  return (
    <div className="space-y-3 rounded-2xl border border-line bg-bg/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink">Дополнительные релизы</p>
          <p className="mt-1 text-xs text-ink3">
            Прошедшие релизы появятся над текущим, будущие — после текущего.
          </p>
        </div>
        <Button size="sm" variant="ghost" disabled={disabled} onClick={addQuery}>
          + Добавить запрос
        </Button>
      </div>

      {queries.length > 0 ? (
        <div className="space-y-3">
          {queries.map((query, index) => (
            <div key={query.id} className="rounded-xl border border-line bg-surface p-3">
              <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)_auto]">
                <SelectField
                  label="Тип релиза"
                  value={query.type}
                  disabled={disabled}
                  onChange={(event) => updateQuery(index, { type: event.target.value === "past" ? "past" : "future" })}
                >
                  <option value="past">Прошедший релиз</option>
                  <option value="future">Будущий релиз</option>
                </SelectField>
                <TextField
                  label="Название (необязательно)"
                  value={query.label ?? ""}
                  disabled={disabled}
                  placeholder={query.type === "past" ? "Например: 0.689" : "Например: 0.691"}
                  onChange={(event) => updateQuery(index, { label: event.target.value })}
                />
                <div className="flex items-end">
                  <Button size="sm" variant="ghost" disabled={disabled} onClick={() => removeQuery(index)}>
                    Удалить
                  </Button>
                </div>
              </div>
              <div className="mt-3">
                <TextareaField
                  label="JQL"
                  rows={2}
                  value={query.jql}
                  disabled={disabled}
                  placeholder="project = AIG2 AND fixVersion = 12076"
                  onChange={(event) => updateQuery(index, { jql: event.target.value })}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-xl bg-line2/40 px-4 py-5 text-center text-sm text-ink3">
          Дополнительных релизов пока нет. Текущий релиз задаётся JQL выше.
        </p>
      )}
    </div>
  );
}

function ScopeBoardEditorPage({
  principal,
  canManage,
  mode,
}: {
  principal: CmsPrincipal;
  canManage: boolean;
  mode: "create" | "edit";
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const { boardId: boardIdParam } = useParams();
  const boardId = mode === "edit" ? Number(boardIdParam) : null;
  const { teams } = useCmsTeams(principal);
  const [teamId, setTeamId] = useTeamIdState(teams, mode === "create");
  const selectedTeam = useMemo(
    () => teams.find((t) => t.id === (typeof teamId === "number" ? teamId : -1)) ?? null,
    [teams, teamId]
  );

  const [loading, setLoading] = useState(mode === "edit");
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiProgress, setAiProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [board, setBoard] = useState<ScopeBoardRecord | null>(null);
  const [aiSummary, setAiSummary] = useState<ScopeAiSummary | null>(null);
  const [aiSummaryHistory, setAiSummaryHistory] = useState<ScopeAiHistoryEntry[]>([]);
  const [selectedAiHistoryId, setSelectedAiHistoryId] = useState<string | null>(null);
  const [aiPanelOpenSignal, setAiPanelOpenSignal] = useState(0);
  const [form, setForm] = useState<ScopeBoardForm>(defaultForm);
  const [savedForm, setSavedForm] = useState<ScopeBoardForm>(defaultForm);
  const [layoutOrder, setLayoutOrder] = useState<ScopeLayoutBlockKey[]>(DEFAULT_SCOPE_LAYOUT_ORDER);
  const [layoutDragging, setLayoutDragging] = useState(false);
  const printRootRef = useRef<HTMLDivElement>(null);
  const aiReportRef = useRef<HTMLDivElement>(null);

  const inferredReportType: "monthly" | "release" = useMemo(() => {
    if (mode === "edit") return (board?.report_type ?? "monthly") as "monthly" | "release";
    return isReleaseTemplateTeam(selectedTeam) ? "release" : "monthly";
  }, [board?.report_type, mode, selectedTeam]);
  const isReleaseTemplate = inferredReportType === "release";

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(savedForm), [form, savedForm]);
  const unsavedGuard = useUnsavedChangesGuard({ when: dirty && canManage });

  const loadBoard = useCallback(async () => {
    if (boardId === null || Number.isNaN(boardId)) return;
    setLoading(true);
    setError(null);
    try {
      const record = await cmsScopeApi.get(boardId);
      setBoard(record);
      setAiSummary(record.ai_summary ?? null);
      setAiSummaryHistory(record.ai_summary_history ?? []);
      setSelectedAiHistoryId(null);
      const nextForm = boardToForm(record);
      setForm(nextForm);
      setSavedForm(nextForm);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить board.");
    } finally {
      setLoading(false);
    }
  }, [boardId]);

  useEffect(() => {
    if (mode === "edit") {
      void loadBoard();
    }
  }, [loadBoard, mode]);

  useEffect(() => {
    setLayoutOrder(mergeScopeLayoutOrder(board?.layout_order));
  }, [board?.layout_order]);

  useEffect(() => {
    if (mode !== "create") return;
    setForm((current) => {
      if (isReleaseTemplate) {
        const currentReleaseJql = current.scope_sections?.[0]?.jql ?? "";
        return {
          ...current,
          scope_sections: [
            {
              id: "release",
              name: "Текущий релиз",
              kind: "planned",
              order: 0,
              jql: currentReleaseJql,
            },
          ],
        };
      }
      return {
        ...current,
        scope_sections: defaultScopeSections(),
      };
    });
  }, [mode, isReleaseTemplate]);

  const persistBoardConfig = useCallback(async (): Promise<ScopeBoardRecord | null> => {
    if (mode !== "edit" || boardId === null || Number.isNaN(boardId) || !canManage) {
      return board;
    }
    const validated = validateScopeForm(form);
    if ("error" in validated) {
      setError(validated.error);
      return null;
    }
    setError(null);
    const updated = await cmsScopeApi.update(boardId, validated.payload);
    setBoard(updated);
    const nextForm = boardToForm(updated);
    setForm(nextForm);
    setSavedForm(nextForm);
    return updated;
  }, [board, boardId, canManage, form, mode]);

  const refreshFromJira = useCallback(
    async () => {
      if (boardId === null || Number.isNaN(boardId)) return;
      setRefreshing(true);
      setError(null);
      let configBaseline = savedForm;
      try {
        if (dirty && canManage && mode === "edit") {
          const saved = await persistBoardConfig();
          if (!saved) {
            toast.error("Исправьте настройки — JQL не сохранён, refresh отменён");
            return;
          }
          configBaseline = boardToForm(saved);
        }
        const record = await cmsScopeApi.refresh(boardId);
        setBoard(record);
        setAiSummary(record.ai_summary ?? null);
        setAiSummaryHistory(record.ai_summary_history ?? []);
        setSelectedAiHistoryId(null);
        const nextForm = boardToForm(record);
        setSavedForm(nextForm);
        setForm((current) =>
          JSON.stringify(current) === JSON.stringify(configBaseline) ? nextForm : current
        );
        const m = record.snapshot?.metrics;
        const totalTasks = (m?.plan_count ?? 0) + (m?.unplan_count ?? 0);
        const todoCount = record.snapshot?.priority_queues?.todo?.issues?.length ?? 0;
        const testCount = record.snapshot?.priority_queues?.test?.issues?.length ?? 0;
        toast.success(
          totalTasks > 0 || todoCount > 0 || testCount > 0
            ? `Обновлено: плановых ${m?.plan_count ?? 0}, внеплановых ${m?.unplan_count ?? 0}, очереди ${todoCount}+${testCount}`
            : "Jira вернул 0 задач — проверьте JQL"
        );
        const openCount = record.snapshot ? resolveOpenQuestions(record.snapshot).length : 0;
        if (openCount > 0) {
          toast.info(`Открытые вопросы: ${openCount} задач в паузе`);
        }
        const truncated = record.snapshot?.jira_fetch_warnings ?? [];
        if (truncated.length > 0) {
          toast.warning(
            `Jira вернула лимит ${truncated[0]?.count ?? 500}+ задач по JQL — отчёт может быть неполным`,
            { title: "Обрезка выборки" }
          );
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Не удалось обновить из Jira.";
        setError(message);
        toast.error(message);
      } finally {
        setRefreshing(false);
      }
    },
    [boardId, canManage, dirty, mode, persistBoardConfig, savedForm, toast]
  );

  const analyzeScope = useCallback(async () => {
    if (boardId === null || Number.isNaN(boardId)) return;
    setAnalyzing(true);
    setAiProgress("Запускаем AI...");
    setError(null);
    window.setTimeout(() => {
      aiReportRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
    try {
      const started = await cmsScopeApi.startAnalyze(boardId);
      const applyResult = (result: ScopeAiAnalyzeResult) => {
        setBoard((prev) => {
          if (!prev) return result.board;
          return {
            ...prev,
            ai_summary: result.board.ai_summary ?? result.ai_summary,
            ai_summary_history: result.board.ai_summary_history ?? prev.ai_summary_history,
          };
        });
        setAiSummary(result.ai_summary);
        setAiSummaryHistory(result.board.ai_summary_history ?? []);
        setSelectedAiHistoryId(null);
        setAiPanelOpenSignal((value) => value + 1);
        window.setTimeout(() => {
          aiReportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 80);
      };

      if (isScopeAnalyzeResult(started)) {
        applyResult(started);
        toast.success(started.cached ? "AI-сводка уже актуальна" : "AI-анализ готов");
        return;
      }

      const jobId = started.job_id;
      if (!jobId) {
        throw new Error("AI job was not started");
      }

      const result = await pollAiJob<ScopeAiAnalyzeResult>(
        () => cmsScopeApi.getAnalyzeJob(boardId, jobId),
        {
          intervalMs: AI_JOB_POLL_INTERVAL_MS,
          timeoutMs: SCOPE_AI_POLL_TIMEOUT_MS,
          onProgress: (job) => setAiProgress(job.message ?? "AI готовит сводку..."),
        }
      );
      applyResult(result);
      toast.success(result.cached ? "AI-сводка уже актуальна" : "AI-анализ готов");
    } catch (err) {
      const message = err instanceof Error ? err.message : "AI-анализ не выполнен";
      setError(message);
      toast.error(message, { title: "Ошибка" });
    } finally {
      setAnalyzing(false);
      setAiProgress(null);
    }
  }, [boardId, toast]);

  const addManualQuestion = useCallback(
    async (text: string) => {
      if (boardId === null || Number.isNaN(boardId)) return;
      const record = await cmsScopeApi.addQuestion(boardId, text);
      setBoard(record);
      toast.success("Вопрос добавлен");
    },
    [boardId, toast]
  );

  const resolveQuestion = useCallback(
    async (questionId: string, comment: string) => {
      if (boardId === null || Number.isNaN(boardId)) return;
      const record = await cmsScopeApi.resolveQuestion(boardId, questionId, comment);
      setBoard(record);
      toast.success("Вопрос закрыт");
    },
    [boardId, toast]
  );

  const addTopItem = useCallback(
    async (text: string) => {
      if (boardId === null || Number.isNaN(boardId)) return;
      const record = await cmsScopeApi.addTopItem(boardId, text);
      setBoard(record);
      toast.success("Пункт добавлен");
    },
    [boardId, toast]
  );

  const removeTopItem = useCallback(
    async (itemId: string) => {
      if (boardId === null || Number.isNaN(boardId)) return;
      const record = await cmsScopeApi.deleteTopItem(boardId, itemId);
      setBoard(record);
      toast.success("Пункт удалён");
    },
    [boardId, toast]
  );

  const saveReleaseComment = useCallback(
    async (slot: ScopeReleaseSlot, text: string) => {
      if (boardId === null || Number.isNaN(boardId)) return;
      const trimmed = text.trim();
      const payload = {
        release_comment: board?.release_comment ?? form.release_comment,
        previous_release_comment: board?.previous_release_comment ?? form.previous_release_comment,
        next_release_comment: board?.next_release_comment ?? form.next_release_comment,
        custom_release_comment: board?.custom_release_comment ?? form.custom_release_comment,
      };
      if (slot === "current") payload.release_comment = trimmed;
      if (slot === "previous") payload.previous_release_comment = trimmed;
      if (slot === "next") payload.next_release_comment = trimmed;
      if (slot === "custom") payload.custom_release_comment = trimmed;

      const record = await cmsScopeApi.updateReleaseComments(boardId, payload);
      setBoard(record);
      const nextForm = boardToForm(record);
      setForm(nextForm);
      setSavedForm(nextForm);
      toast.success("Комментарий сохранён");
    },
    [
      board?.custom_release_comment,
      board?.next_release_comment,
      board?.previous_release_comment,
      board?.release_comment,
      boardId,
      form.custom_release_comment,
      form.next_release_comment,
      form.previous_release_comment,
      form.release_comment,
      toast,
    ]
  );

  const addTodoItem = useCallback(
    async (text: string) => {
      if (boardId === null || Number.isNaN(boardId)) return;
      const record = await cmsScopeApi.addTodoItem(boardId, text);
      setBoard(record);
    },
    [boardId]
  );

  const toggleTodoItem = useCallback(
    async (itemId: string, done: boolean) => {
      if (boardId === null || Number.isNaN(boardId)) return;
      const record = await cmsScopeApi.updateTodoItem(boardId, itemId, done);
      setBoard(record);
    },
    [boardId]
  );

  const deleteTodoItem = useCallback(
    async (itemId: string) => {
      if (boardId === null || Number.isNaN(boardId)) return;
      const record = await cmsScopeApi.deleteTodoItem(boardId, itemId);
      setBoard(record);
    },
    [boardId]
  );

  const reorderQueue = useCallback(
    async (queue: ScopePriorityQueueKind, order: string[], comment: string, movedKey: string) => {
      if (boardId === null || Number.isNaN(boardId)) return;
      const record = await cmsScopeApi.reorderQueue(boardId, queue, order, comment, movedKey);
      setBoard(record);
      toast.success("Порядок сохранён");
    },
    [boardId, toast]
  );

  const addQueueComment = useCallback(
    async (queue: ScopePriorityQueueKind, issueKey: string, text: string) => {
      if (boardId === null || Number.isNaN(boardId)) return;
      const record = await cmsScopeApi.addQueueIssueComment(boardId, queue, issueKey, text);
      setBoard(record);
      toast.success("Комментарий отправлен в Jira");
    },
    [boardId, toast]
  );

  const updateQueueDueDate = useCallback(
    async (queue: ScopePriorityQueueKind, issueKey: string, dueDate: string) => {
      if (boardId === null || Number.isNaN(boardId)) return;
      const record = await cmsScopeApi.updateQueueIssueDueDate(boardId, queue, issueKey, dueDate);
      setBoard(record);
      toast.success("Срок исполнения сохранён в Jira");
    },
    [boardId, toast]
  );

  async function handleSave() {
    const validated = validateScopeForm(form);
    if ("error" in validated) {
      setError(validated.error);
      return;
    }
    if (mode === "create" && teamId === "") {
      setError("Выберите команду — без неё отчёт увидят все админы.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (mode === "create") {
        const created = await cmsScopeApi.create({
          ...validated.payload,
          team_id: teamId === "" ? null : teamId,
        });
        toast.success("Отчёт создан");
        navigate(`../${created.id}`, { replace: true });
        return;
      }

      if (boardId === null) return;
      const updated = await cmsScopeApi.update(boardId, validated.payload);
      setBoard(updated);
      const nextForm = boardToForm(updated);
      setForm(nextForm);
      setSavedForm(nextForm);
      toast.success("Сохранено");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить.");
    } finally {
      setSaving(false);
    }
  }

  const metrics = board?.snapshot?.metrics ?? null;
  const snapshot = board?.snapshot ?? null;
  const reportSummary = useMemo(() => (snapshot ? buildReportSummary(snapshot) : null), [snapshot]);
  const dataQualityDetails = useMemo(() => (snapshot ? buildDataQualityDetails(snapshot) : null), [snapshot]);
  const snapshotRefreshedLabel = snapshot?.refreshed_at
    ? new Date(snapshot.refreshed_at).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })
    : null;

  const visibleBlockKeys = useMemo((): ScopeLayoutBlockKey[] => {
    if (mode !== "edit" || !snapshot || !metrics) return [];
    const keys: ScopeLayoutBlockKey[] = ["topItems", "capacity"];
    if (!isReleaseTemplate) {
      keys.push("roleWorkload", "planInsights");
    }
    keys.push("aiSummary", "report", "priorityQueues", "activity", "snapshotSections", "settings");
    return keys;
  }, [isReleaseTemplate, metrics, mode, snapshot]);

  const visibleLayoutOrder = useMemo(
    () => mergeScopeLayoutOrder(layoutOrder, visibleBlockKeys),
    [layoutOrder, visibleBlockKeys],
  );

  const layoutSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleLayoutDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setLayoutDragging(false);
      if (!canManage || boardId === null || Number.isNaN(boardId)) return;
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const previousOrder = layoutOrder;
      const nextOrder = reorderScopeLayoutOrder(
        layoutOrder,
        visibleBlockKeys,
        String(active.id),
        String(over.id),
      );
      setLayoutOrder(nextOrder);
      setBoard((current) => (current ? { ...current, layout_order: nextOrder } : current));

      try {
        const updated = await cmsScopeApi.updateLayout(boardId, nextOrder);
        setBoard(updated);
        setLayoutOrder(mergeScopeLayoutOrder(updated.layout_order));
      } catch (err) {
        setLayoutOrder(previousOrder);
        setBoard((current) => (current ? { ...current, layout_order: previousOrder } : current));
        toast.error(err instanceof Error ? err.message : "Не удалось сохранить порядок блоков.");
      }
    },
    [boardId, canManage, layoutOrder, toast, visibleBlockKeys],
  );

  function renderScopeLayoutBlock(key: ScopeLayoutBlockKey) {
    if (!snapshot || !metrics) return null;

    switch (key) {
      case "topItems":
        return (
          <ScopeTopItemsSection
            snapshot={snapshot}
            canManage={canManage}
            onAddItem={addTopItem}
            onRemoveItem={removeTopItem}
          />
        );
      case "capacity":
        return (
          <ScopeVisualDashboard
            metrics={metrics}
            reportSummary={reportSummary ?? undefined}
            dataQualityDetails={dataQualityDetails ?? undefined}
          />
        );
      case "roleWorkload":
        return <ScopeAssigneeCharts metrics={metrics} />;
      case "planInsights":
        return <ScopePlanInsights metrics={metrics} />;
      case "aiSummary":
        return (
          <div ref={aiReportRef} className="scroll-mt-24 space-y-3">
            {analyzing && aiProgress ? <AiGenerationProgress message={aiProgress} /> : null}
            <ScopeAiPanel
              summary={aiSummary}
              history={aiSummaryHistory}
              selectedHistoryId={selectedAiHistoryId}
              onSelectHistory={setSelectedAiHistoryId}
              metrics={metrics}
              openQuestionsCount={resolveOpenQuestions(snapshot).length}
              autoOpenSignal={aiPanelOpenSignal}
              analyzing={analyzing}
            />
          </div>
        );
      case "report":
        return (
          <ScopeReportSection
            snapshot={snapshot}
            canManage={canManage}
            showTechnicalFields
            isReleaseReport={isReleaseTemplate}
            releaseComments={{
              current: board?.release_comment ?? form.release_comment,
              previous: board?.previous_release_comment ?? form.previous_release_comment,
              next: board?.next_release_comment ?? form.next_release_comment,
              custom: board?.custom_release_comment ?? form.custom_release_comment,
            }}
            onSaveReleaseComment={saveReleaseComment}
            onAddQuestion={addManualQuestion}
            onResolveQuestion={resolveQuestion}
          />
        );
      case "priorityQueues":
        return (
          <ScopePriorityQueuesSection
            snapshot={snapshot}
            todoJql={board?.todo_jql ?? form.todo_jql}
            testJql={board?.test_jql ?? form.test_jql}
            canManage={canManage}
            onReorderQueue={reorderQueue}
            onAddQueueComment={addQueueComment}
            onUpdateQueueDueDate={updateQueueDueDate}
          />
        );
      case "activity":
        return <ScopeActivityFeed snapshot={snapshot} />;
      case "snapshotSections":
        return (
          <div className="space-y-4">
            {metrics.plan_count + metrics.unplan_count === 0 ? (
              <Alert tone="warning" title="Jira вернул 0 задач">
                Проверьте JQL в настройках.
              </Alert>
            ) : null}
            {resolveSnapshotSections(snapshot).map((section) => {
              const sectionMetrics = metrics.sections?.find((item) => item.id === section.id);
              return (
                <details key={section.id} className="scope-collapsible-card group overflow-hidden rounded-lg bg-surface">
                  <summary className="scope-section-header flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 marker:content-none sm:px-5">
                    <div>
                      <p className="text-base font-semibold text-ink">
                        {section.name} · {sectionMetrics?.count ?? section.issues.length} задач
                      </p>
                      {sectionMetrics?.by_status && Object.keys(sectionMetrics.by_status).length > 0 ? (
                        <p className="scope-section-header-subtitle mt-1 text-sm">
                          {Object.entries(sectionMetrics.by_status)
                            .map(([status, count]) => `${status}: ${count}`)
                            .join(" · ")}
                        </p>
                      ) : null}
                      <p className="scope-section-header-subtitle mt-1 text-xs">
                        Полный список задач, полученный по JQL-фильтру. На его основе собираются метрики и отчёт.
                      </p>
                    </div>
                    <span className="scope-section-header-icon inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-transform group-open:rotate-180">
                      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                        <path d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06z" />
                      </svg>
                    </span>
                  </summary>
                  <ScopeTasksSection
                    title={section.name}
                    issues={section.issues}
                    byStatus={sectionMetrics?.by_status ?? {}}
                    showTechnicalFields
                    embedded
                  />
                </details>
              );
            })}
          </div>
        );
      case "settings":
        return (
          <details className="scope-collapsible-card scope-no-print group overflow-hidden rounded-lg bg-surface">
            <summary className="scope-section-header flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-ink marker:content-none sm:px-5">
              <span>⚙ Настройки и JQL</span>
              <span className="scope-section-header-icon inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-transform group-open:rotate-180">
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                  <path d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06z" />
                </svg>
              </span>
            </summary>
            <div className="space-y-5 p-4 sm:p-6 lg:p-7">
              <div className="grid gap-4 md:grid-cols-2">
                <TextField
                  label="Название"
                  value={form.name}
                  disabled={!canManage}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                />
                <TextField
                  label="Месяц (YYYY-MM)"
                  value={form.month}
                  disabled={!canManage}
                  onChange={(event) => setForm((current) => ({ ...current, month: event.target.value }))}
                />
                <TextField
                  label="Capacity (SP)"
                  inputMode="decimal"
                  value={form.capacity_sp}
                  disabled={!canManage}
                  onChange={(event) => setForm((current) => ({ ...current, capacity_sp: event.target.value }))}
                />
              </div>
              {isReleaseTemplate ? (
                <div className="space-y-5">
                  <TextareaField
                    label="Введите релиз JQL"
                    rows={3}
                    value={form.scope_sections?.[0]?.jql ?? ""}
                    disabled={!canManage}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        scope_sections: [
                          {
                            id: "release",
                            name: "Текущий релиз",
                            kind: "planned",
                            order: 0,
                            jql: event.target.value,
                          },
                        ],
                      }))
                    }
                  />
                  <ReleaseQueriesEditor
                    queries={form.release_queries}
                    disabled={!canManage}
                    onChange={(release_queries) => setForm((current) => ({ ...current, release_queries }))}
                  />
                </div>
              ) : (
                <ScopeSectionEditor
                  sections={form.scope_sections}
                  disabled={!canManage}
                  onChange={(scope_sections) => setForm((current) => ({ ...current, scope_sections }))}
                />
              )}
              <TextareaField
                label="Задачи к выполнению — JQL"
                rows={3}
                value={form.todo_jql}
                disabled={!canManage}
                onChange={(event) => setForm((current) => ({ ...current, todo_jql: event.target.value }))}
              />
              <TextareaField
                label="Задачи к тестированию — JQL"
                rows={3}
                value={form.test_jql}
                disabled={!canManage}
                onChange={(event) => setForm((current) => ({ ...current, test_jql: event.target.value }))}
              />
            </div>
          </details>
        );
      default:
        return null;
    }
  }

  if (mode === "edit" && (boardId === null || Number.isNaN(boardId))) {
    return <Navigate to=".." replace />;
  }

  return (
    <section className="scope-board-shell min-w-0 space-y-5">
      <SectionHeader
        title={mode === "create" ? "Новый отчёт месяца" : board?.name ?? "Отчёт месяца"}
        description={
          mode === "edit" && board ? (
            <span className="flex flex-wrap items-center gap-2">
              <TeamBadge teamId={board.team_id} team={board.team} />
              <span>Месяц {formatScopeDisplayMonth(board.month)}</span>
              {snapshotRefreshedLabel ? (
                <span className="text-xs text-ink3">Snapshot Jira: {snapshotRefreshedLabel}</span>
              ) : (
                <span className="text-xs text-amber">Нет snapshot — обновите из Jira</span>
              )}
            </span>
          ) : (
            "Выберите команду и задайте capacity с JQL-секциями."
          )
        }
        actions={
          <div className="flex flex-wrap gap-2 scope-no-print">
            <Button size="sm" variant="ghost" onClick={() => navigate("..")}>
              Назад
            </Button>
            {mode === "edit" && snapshot ? (
              <AiSparkleButton
                size="sm"
                loading={analyzing}
                disabled={analyzing || refreshing || saving}
                onClick={() => void analyzeScope()}
              >
                {aiSummary ? "Обновить AI" : "AI-анализ"}
              </AiSparkleButton>
            ) : null}
            {mode === "edit" && canManage ? (
              <Button size="sm" variant="secondary" disabled={refreshing || saving} onClick={() => void refreshFromJira()}>
                {refreshing ? <Spinner size="sm" /> : null}
                Обновить из Jira
              </Button>
            ) : null}
            {canManage ? (
              <Button size="sm" variant="primary" disabled={saving || refreshing} onClick={() => void handleSave()}>
                {saving ? <Spinner size="sm" /> : null}
                {mode === "create" ? "Создать" : "Сохранить"}
              </Button>
            ) : null}
          </div>
        }
      />

      {error ? <InlineError text={error} /> : null}
      {loading ? <Skeleton height="h-64" /> : null}
      {mode === "edit" && snapshot && boardId !== null && !Number.isNaN(boardId) ? (
        <ScopeFloatingTodo
          key={boardId}
          boardId={boardId}
          items={snapshot.todo_items ?? []}
          onAdd={addTodoItem}
          onToggle={toggleTodoItem}
          onDelete={deleteTodoItem}
        />
      ) : null}

      {!loading ? (
        <>
          {mode === "create" ? (
            <Surface className="space-y-4 p-4 sm:p-5">
              <HelpCallout title="Команда">
                <p>
                  Отчёт привязан к команде — пользователи других команд его не увидят. Как при создании сессии
                  planning poker.
                </p>
              </HelpCallout>
              <div className="grid gap-4 md:grid-cols-2">
                <TextField
                  label="Название"
                  value={form.name}
                  disabled={!canManage}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                />
                <TextField
                  label="Месяц (YYYY-MM)"
                  value={form.month}
                  disabled={!canManage}
                  onChange={(event) => setForm((current) => ({ ...current, month: event.target.value }))}
                />
                <TeamSelect
                  teams={teams}
                  value={teamId}
                  disabled={!canManage}
                  forcePicker
                  required
                  onChange={setTeamId}
                />
                <TextField
                  label="Capacity (SP)"
                  inputMode="decimal"
                  value={form.capacity_sp}
                  disabled={!canManage}
                  onChange={(event) => setForm((current) => ({ ...current, capacity_sp: event.target.value }))}
                />
              </div>
            </Surface>
          ) : null}

          {mode === "edit" && snapshot && metrics ? (
            canManage ? (
              <DndContext
                sensors={layoutSensors}
                collisionDetection={closestCenter}
                onDragStart={() => setLayoutDragging(true)}
                onDragEnd={(event) => void handleLayoutDragEnd(event)}
                onDragCancel={() => setLayoutDragging(false)}
              >
                {layoutDragging ? (
                  <div className="scope-no-print pointer-events-none fixed inset-0 z-20 bg-bg/10 backdrop-blur-[2px]" />
                ) : null}
                <div ref={printRootRef} className="scope-report-print-root space-y-5">
                  <div className="scope-print-cover hidden">
                    <h1 className="text-xl font-bold text-ink">{board?.name ?? "Отчёт месяца"}</h1>
                    <p className="mt-1 text-sm text-ink3">
                      {board ? (
                        <>
                          Месяц {formatScopeDisplayMonth(board.month)}
                          {snapshotRefreshedLabel ? ` · Snapshot Jira: ${snapshotRefreshedLabel}` : null}
                        </>
                      ) : null}
                    </p>
                  </div>
                  <SortableContext items={visibleLayoutOrder} strategy={verticalListSortingStrategy}>
                    {visibleLayoutOrder.map((key) => (
                      <SortableScopeBlock key={key} id={key} canDrag>
                        {renderScopeLayoutBlock(key)}
                      </SortableScopeBlock>
                    ))}
                  </SortableContext>
                </div>
              </DndContext>
            ) : (
              <div ref={printRootRef} className="scope-report-print-root space-y-5">
                <div className="scope-print-cover hidden">
                  <h1 className="text-xl font-bold text-ink">{board?.name ?? "Отчёт месяца"}</h1>
                  <p className="mt-1 text-sm text-ink3">
                    {board ? (
                      <>
                        Месяц {formatScopeDisplayMonth(board.month)}
                        {snapshotRefreshedLabel ? ` · Snapshot Jira: ${snapshotRefreshedLabel}` : null}
                      </>
                    ) : null}
                  </p>
                </div>
                {visibleLayoutOrder.map((key) => (
                  <div key={key}>{renderScopeLayoutBlock(key)}</div>
                ))}
              </div>
            )
          ) : null}

          {mode === "create" ? (
            <details className="scope-collapsible-card scope-no-print group overflow-hidden rounded-lg bg-surface" open>
            <summary className="scope-section-header flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-ink marker:content-none sm:px-5">
              <span>
                <span className="group-open:hidden">⚙ Настройки и JQL</span>
                <span className="hidden group-open:inline">⚙ Настройки и JQL</span>
              </span>
              <span className="scope-section-header-icon inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-transform group-open:rotate-180">
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                  <path d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06z" />
                </svg>
              </span>
            </summary>
            <div className="space-y-5 p-4 sm:p-6 lg:p-7">
              {isReleaseTemplate ? (
                <div className="space-y-5">
                  <TextareaField
                    label="Введите релиз JQL"
                    rows={3}
                    value={form.scope_sections?.[0]?.jql ?? ""}
                    disabled={!canManage}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        scope_sections: [
                          {
                            id: "release",
                            name: "Текущий релиз",
                            kind: "planned",
                            order: 0,
                            jql: event.target.value,
                          },
                        ],
                      }))
                    }
                  />
                  <ReleaseQueriesEditor
                    queries={form.release_queries}
                    disabled={!canManage}
                    onChange={(release_queries) => setForm((current) => ({ ...current, release_queries }))}
                  />
                </div>
              ) : (
                <ScopeSectionEditor
                  sections={form.scope_sections}
                  disabled={!canManage}
                  onChange={(scope_sections) => setForm((current) => ({ ...current, scope_sections }))}
                />
              )}
              <TextareaField
                label="Задачи к выполнению — JQL"
                rows={3}
                value={form.todo_jql}
                disabled={!canManage}
                onChange={(event) => setForm((current) => ({ ...current, todo_jql: event.target.value }))}
              />
              <TextareaField
                label="Задачи к тестированию — JQL"
                rows={3}
                value={form.test_jql}
                disabled={!canManage}
                onChange={(event) => setForm((current) => ({ ...current, test_jql: event.target.value }))}
              />
            </div>
          </details>
          ) : null}

          {mode === "edit" && !metrics ? (
            <EmptyState
              title="Нет snapshot"
              description="Откройте настройки, вставьте JQL и нажмите «Обновить из Jira»."
            />
          ) : null}
        </>
      ) : null}

      {!loading && mode === "edit" && snapshot ? (
        <div className="scope-no-print flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
          <Button variant="secondary" disabled={!metrics} onClick={() => printScopeReport(printRootRef.current)}>
            Сохранить PDF
          </Button>
        </div>
      ) : null}

      {unsavedGuard.dialog}
    </section>
  );
}

function ScopeTasksSection({
  title,
  issues,
  byStatus,
  showTechnicalFields = false,
  embedded = false,
}: {
  title: string;
  issues: ScopeBoardIssue[];
  byStatus: Record<string, number>;
  showTechnicalFields?: boolean;
  embedded?: boolean;
}) {
  const { visibleItems, hasMore, loadMore, loadedCount, total } = useIncrementalList(issues);
  const statusSummary = Object.entries(byStatus)
    .map(([status, count]) => `${status}: ${count}`)
    .join(" · ");

  const body =
    issues.length === 0 ? (
      <p className="px-4 py-6 text-sm text-ink3 sm:px-5">Нет задач по JQL.</p>
    ) : (
      <>
        <div className="space-y-3 p-4 sm:p-5 lg:hidden">
          {visibleItems.map((issue) => (
            <MobileRecordCard
              key={issue.key}
              title={<IssueLink issue={issue} />}
              meta={
                <span className="flex flex-wrap items-center gap-2">
                  <Badge tone="neutral">{formatScopeSp(issue.story_points)} SP</Badge>
                  <span>{issue.status}</span>
                  {issue.priority ? <Badge tone="info">{issue.priority}</Badge> : null}
                  {issue.severity ? <Badge tone="danger">{issue.severity}</Badge> : null}
                  {showTechnicalFields && issue.scope_creep ? <Badge tone="warning">Добавлено после плана</Badge> : null}
                </span>
              }
            >
              <MobileRecordField label="Тип" value={issue.issue_type || "—"} />
              <MobileRecordField label="Owner" value={issue.assignee || "—"} />
              <MobileRecordField label="Epic / Sprint" value={[issue.epic_key || issue.parent_key, issue.sprint].filter(Boolean).join(" · ") || "—"} />
              <MobileRecordField
                label="Front / Back / QA"
                value={[issue.role_contributors?.front?.name, issue.role_contributors?.back?.name, issue.role_contributors?.qa?.name]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              />
              <MobileRecordField label="Создана" value={formatCreated(issue.created)} />
              {showTechnicalFields ? (
                <>
                  <MobileRecordField label="Domain / Plan" value={[issue.domain, issue.plan_status].filter(Boolean).join(" · ") || "—"} />
                  <MobileRecordField label="Причина изменения плана" value={planChangeReasonLabel(issue) || "—"} />
                </>
              ) : null}
            </MobileRecordCard>
          ))}
        </div>

        <div className="hidden overflow-x-auto p-4 sm:p-5 lg:block">
          <table className="w-full min-w-[980px] border-separate border-spacing-y-2 text-sm">
            <thead className="text-xs uppercase text-ink3">
              <tr>
                <th className="px-3 pb-2 text-left font-bold">Key</th>
                <th className="px-3 pb-2 text-left font-bold">Summary</th>
                <th className="px-3 pb-2 text-left font-bold">SP</th>
                <th className="px-3 pb-2 text-left font-bold">Status</th>
                <th className="px-3 pb-2 text-left font-bold">Priority</th>
                <th className="px-3 pb-2 text-left font-bold">Owner</th>
                <th className="px-3 pb-2 text-left font-bold">Epic / Sprint</th>
                {showTechnicalFields ? <th className="px-3 pb-2 text-left font-bold">Технические сигналы</th> : null}
                {showTechnicalFields ? <th className="px-3 pb-2 text-left font-bold">Добавлено после плана</th> : null}
              </tr>
            </thead>
            <tbody>
              {visibleItems.map((issue) => (
                <tr key={issue.key} className="bg-bg/70">
                  <td className="rounded-l-xl px-3 py-3 align-top">
                    <IssueLink issue={issue} />
                  </td>
                  <td className="px-3 py-3 align-top text-ink2">{issue.summary}</td>
                  <td className="px-3 py-3 align-top text-ink2">{formatScopeSp(issue.story_points)}</td>
                  <td className="px-3 py-3 align-top text-ink2">{issue.status || "—"}</td>
                  <td className="px-3 py-3 align-top text-ink2">
                    {[issue.priority, issue.severity || issue.final_priority].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td className="px-3 py-3 align-top text-ink2">{issue.assignee || "—"}</td>
                  <td className="px-3 py-3 align-top text-ink2">
                    {[issue.epic_key || issue.parent_key, issue.sprint].filter(Boolean).join(" · ") || "—"}
                  </td>
                  {showTechnicalFields ? (
                    <td className="px-3 py-3 align-top text-ink2">
                      {[issue.domain, issue.plan_status, planChangeReasonLabel(issue), issue.request_type]
                        .filter(Boolean)
                        .join(" · ") || issue.issue_type || "—"}
                    </td>
                  ) : null}
                  {showTechnicalFields ? (
                    <td className="rounded-r-xl px-3 py-3 align-top text-ink2">{issue.scope_creep ? "Да" : "—"}</td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 pb-4 lg:px-5">
          <ScopeIncrementalFooter
            loadedCount={loadedCount}
            total={total}
            hasMore={hasMore}
            onMore={loadMore}
          />
        </div>
      </>
    );

  if (embedded) {
    return <div className="overflow-hidden">{body}</div>;
  }

  return (
    <Surface className="overflow-hidden p-0">
      <div className="border-b border-line px-4 py-3 sm:px-5">
        <h3 className="text-sm font-bold uppercase tracking-wide text-ink3">{title}</h3>
        <p className="mt-1 text-xs text-ink3">
          {issues.length} задач{statusSummary ? ` · ${statusSummary}` : ""}
        </p>
      </div>
      {body}
    </Surface>
  );
}

function IssueLink({ issue }: { issue: ScopeBoardIssue }) {
  if (issue.url) {
    return (
      <a href={issue.url} target="_blank" rel="noreferrer" className="font-semibold text-blue hover:underline">
        {issue.key}
      </a>
    );
  }
  return <span className="font-semibold text-ink">{issue.key}</span>;
}

function isScopeAnalyzeResult(response: ScopeAnalyzeStartResponse): response is ScopeAiAnalyzeResult {
  return "ai_summary" in response && "board" in response;
}
