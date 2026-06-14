import { useMemo, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  Spinner,
  TextareaField,
  cn,
} from "../../../design-system";
import type {
  ScopeBoardIssue,
  ScopeBoardSnapshot,
  ScopePriorityQueue,
  ScopePriorityQueueHistoryEntry,
  ScopePriorityQueueKind,
} from "../api/cmsClient";
import { formatScopeSp, jiraPriorityRank, priorityBadgeTone } from "./scopeBoardHelpers";
import {
  formatQueueTimelineDate,
  formatReorderLine,
  lastReorderForIssue,
  resolveQueueIssueMilestone,
  type QueueIssueMilestone,
} from "./scopePriorityQueueTimeline";
import { useIncrementalList } from "./scopeListPaging";
import { ScopeIncrementalFooter } from "./ScopeIncrementalFooter";
import { PlanFieldBadges } from "./scopePlanInsights";
import { RoleContributorsBadges } from "./scopeRoleContributors";

const QUEUE_META: Record<
  ScopePriorityQueueKind,
  { title: string; subtitle: string; jqlHint: string }
> = {
  todo: {
    title: "Задачи к выполнению",
    subtitle: "На груминге с PO меняйте порядок — разработке будет понятно, что брать следующим.",
    jqlHint: "JQL для задач в работе / ready for dev",
  },
  test: {
    title: "Задачи к тестированию",
    subtitle: "Приоритет очереди на тест — что проверять следующим после груминга.",
    jqlHint: "JQL для задач в статусах тестирования",
  },
};

function emptyQueue(): ScopePriorityQueue {
  return { order: [], issues: [], history: [] };
}

function resolveQueue(snapshot: ScopeBoardSnapshot, kind: ScopePriorityQueueKind): ScopePriorityQueue {
  const queue = snapshot.priority_queues?.[kind];
  if (!queue) return emptyQueue();
  return {
    order: queue.order ?? [],
    issues: queue.issues ?? [],
    history: queue.history ?? [],
  };
}

function formatHistoryTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export function ScopePriorityQueuesSection({
  snapshot,
  todoJql,
  testJql,
  canManage,
  onReorderQueue,
  onAddQueueComment,
}: {
  snapshot: ScopeBoardSnapshot;
  todoJql: string;
  testJql: string;
  canManage: boolean;
  onReorderQueue: (queue: ScopePriorityQueueKind, order: string[], comment: string, movedKey: string) => Promise<void>;
  onAddQueueComment: (queue: ScopePriorityQueueKind, issueKey: string, text: string) => Promise<void>;
}) {
  return (
    <div className="space-y-3">
      <PriorityQueueBlock
        kind="todo"
        queue={resolveQueue(snapshot, "todo")}
        jql={todoJql}
        canManage={canManage}
        onReorderQueue={onReorderQueue}
        onAddQueueComment={onAddQueueComment}
      />
      <PriorityQueueBlock
        kind="test"
        queue={resolveQueue(snapshot, "test")}
        jql={testJql}
        canManage={canManage}
        onReorderQueue={onReorderQueue}
        onAddQueueComment={onAddQueueComment}
      />
    </div>
  );
}

function PriorityQueueBlock({
  kind,
  queue,
  jql,
  canManage,
  onReorderQueue,
  onAddQueueComment,
}: {
  kind: ScopePriorityQueueKind;
  queue: ScopePriorityQueue;
  jql: string;
  canManage: boolean;
  onReorderQueue: (queue: ScopePriorityQueueKind, order: string[], comment: string, movedKey: string) => Promise<void>;
  onAddQueueComment: (queue: ScopePriorityQueueKind, issueKey: string, text: string) => Promise<void>;
}) {
  const meta = QUEUE_META[kind];
  const [pendingOrder, setPendingOrder] = useState<string[] | null>(null);
  const [pendingMovedKey, setPendingMovedKey] = useState<string | null>(null);
  const [reorderComment, setReorderComment] = useState("");
  const [reordering, setReordering] = useState(false);
  const [reorderError, setReorderError] = useState<string | null>(null);

  const issues = queue.issues;
  const { visibleItems, hasMore, loadMore, loadedCount, total } = useIncrementalList(issues);
  const sortableIds = useMemo(() => visibleItems.map((issue) => issue.key), [visibleItems]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    if (!canManage || reordering) return;
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    if (!overId || activeId === overId) return;

    const oldIndex = issues.findIndex((issue) => issue.key === activeId);
    const newIndex = issues.findIndex((issue) => issue.key === overId);
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;

    const nextOrder = arrayMove(issues, oldIndex, newIndex).map((issue) => issue.key);
    setPendingOrder(nextOrder);
    setPendingMovedKey(activeId);
    setReorderComment("");
    setReorderError(null);
  }

  async function confirmReorder() {
    if (!pendingOrder || !pendingMovedKey) return;
    const comment = reorderComment.trim();
    if (!comment) {
      setReorderError("Комментарий обязателен — зафиксируйте решение груминга.");
      return;
    }
    setReordering(true);
    setReorderError(null);
    try {
      await onReorderQueue(kind, pendingOrder, comment, pendingMovedKey);
      setPendingOrder(null);
      setPendingMovedKey(null);
      setReorderComment("");
    } catch (err) {
      setReorderError(err instanceof Error ? err.message : "Не удалось сохранить порядок.");
    } finally {
      setReordering(false);
    }
  }

  return (
    <>
      <details className="rounded-lg border border-line bg-surface">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-ink marker:content-none sm:px-5">
          {meta.title} · {issues.length}
        </summary>
        <div className="space-y-4 border-t border-line px-4 py-4 sm:px-5">
          <p className="text-sm text-ink2">{meta.subtitle}</p>
          {jql.trim() ? (
            <p className="rounded-md border border-line bg-bg px-3 py-2 font-mono text-xs text-ink3">{jql.trim()}</p>
          ) : (
            <p className="text-xs text-ink3">JQL не задан — добавьте в «Настройки и JQL» и нажмите «Обновить из Jira».</p>
          )}

          {issues.length === 0 ? (
            <EmptyState title="Список пуст" description={`Задайте JQL (${meta.jqlHint}) и обновите board из Jira.`} />
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
                <ol className="space-y-2">
                  {visibleItems.map((issue) => (
                    <SortableQueueIssueCard
                      key={issue.key}
                      issue={issue}
                      index={issues.findIndex((item) => item.key === issue.key)}
                      history={queue.history}
                      canManage={canManage}
                      draggable={canManage}
                      onAddComment={(text) => onAddQueueComment(kind, issue.key, text)}
                    />
                  ))}
                </ol>
              </SortableContext>
              <ScopeIncrementalFooter
                loadedCount={loadedCount}
                total={total}
                hasMore={hasMore}
                onMore={loadMore}
              />
            </DndContext>
          )}
        </div>
      </details>

      <ConfirmDialog
        open={pendingOrder !== null}
        title="Сохранить новый порядок?"
        tone="primary"
        confirmLabel="Сохранить"
        cancelLabel="Отмена"
        busy={reordering}
        confirmDisabled={reorderComment.trim().length === 0}
        description={
          <div className="space-y-3 text-left">
            <p className="text-sm text-ink2">
              Комментарий обязателен: он сохранится в истории и уйдёт в Jira для перемещённой задачи.
            </p>
            <TextareaField
              label="Комментарий груминга"
              rows={3}
              value={reorderComment}
              disabled={reordering}
              onChange={(event) => setReorderComment(event.target.value)}
            />
            {reorderError ? <p className="text-sm text-danger">{reorderError}</p> : null}
          </div>
        }
        onCancel={() => {
          if (reordering) return;
          setPendingOrder(null);
          setPendingMovedKey(null);
          setReorderComment("");
          setReorderError(null);
        }}
        onConfirm={() => void confirmReorder()}
      />
    </>
  );
}

function SortableQueueIssueCard({
  issue,
  index,
  history,
  canManage,
  draggable,
  onAddComment,
}: {
  issue: ScopeBoardIssue;
  index: number;
  history: ScopePriorityQueueHistoryEntry[];
  canManage: boolean;
  draggable: boolean;
  onAddComment: (text: string) => Promise<void>;
}) {
  const sortable = useSortable({ id: issue.key, disabled: !draggable });
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0.72 : 1,
  };

  return (
    <li ref={sortable.setNodeRef} style={style} className="list-none">
      <QueueIssueCard
        issue={issue}
        index={index}
        history={history}
        canManage={canManage}
        dragHandleProps={
          draggable
            ? {
                attributes: sortable.attributes as unknown as Record<string, unknown>,
                listeners: sortable.listeners as unknown as Record<string, unknown>,
                isDragging: sortable.isDragging,
              }
            : undefined
        }
        onAddComment={onAddComment}
      />
    </li>
  );
}

function QueueIssueCard({
  issue,
  index,
  history,
  canManage,
  dragHandleProps,
  onAddComment,
}: {
  issue: ScopeBoardIssue;
  index: number;
  history: ScopePriorityQueueHistoryEntry[];
  canManage: boolean;
  dragHandleProps?: {
    attributes: Record<string, unknown>;
    listeners: Record<string, unknown>;
    isDragging: boolean;
  };
  onAddComment: (text: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const milestone = useMemo(() => resolveQueueIssueMilestone(issue, history), [issue, history]);
  const lastReorder = useMemo(() => lastReorderForIssue(history, issue.key), [history, issue.key]);

  async function submitComment() {
    const text = draft.trim();
    if (!text || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onAddComment(text);
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось отправить комментарий.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-line bg-bg px-3 py-3 sm:px-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(260px,360px)]">
        <div className="flex min-w-0 gap-3">
          <div className="flex shrink-0 flex-col items-center gap-1.5 pt-0.5">
            {dragHandleProps ? (
              <button
                type="button"
                className={cn(
                  "inline-flex h-7 w-7 cursor-grab items-center justify-center rounded-md border border-line bg-surface text-xs text-ink3 active:cursor-grabbing",
                  dragHandleProps.isDragging && "border-blue/30 bg-blue/10 text-blue"
                )}
                aria-label="Перетащить"
                {...dragHandleProps.attributes}
                {...dragHandleProps.listeners}
              >
                ⋮⋮
              </button>
            ) : null}
            <span
              className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-line2 text-sm font-bold tabular-nums text-ink"
              aria-label={`Позиция ${index + 1}`}
            >
              {index + 1}
            </span>
          </div>

          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <IssueLink issue={issue} className="text-sm" />
              <QueueIssueSpBadge storyPoints={issue.story_points} />
            </div>

            <p className="text-sm font-medium leading-snug text-ink">{issue.summary}</p>

            <QueueIssueMetaRow issue={issue} />
            <RoleContributorsBadges issue={issue} />
            <PlanFieldBadges issue={issue} />

            <QueueMilestoneLine milestone={milestone} />

            {issue.grooming_comment ? (
              <div className="rounded-md border border-blue/15 border-l-[3px] border-l-blue/60 bg-blue/[0.06] px-2.5 py-2">
                <p className="text-xs leading-snug text-ink">
                  <span className="font-semibold text-blue">Груминг: </span>
                  {issue.grooming_comment}
                </p>
                {issue.grooming_comment_by ? (
                  <p className="mt-1 text-[11px] text-ink3">
                    {issue.grooming_comment_by}
                    {issue.grooming_comment_at ? ` · ${formatHistoryTime(issue.grooming_comment_at)}` : ""}
                  </p>
                ) : null}
              </div>
            ) : null}

            {lastReorder || issue.assignee ? (
              <p className="text-[11px] leading-snug text-ink3/90">
                {issue.assignee ? <span>{issue.assignee}</span> : null}
                {issue.assignee && lastReorder ? <span className="mx-1.5 text-ink3/50">·</span> : null}
                {lastReorder ? <span>{formatReorderLine(lastReorder)}</span> : null}
              </p>
            ) : null}
          </div>
        </div>

        {canManage ? (
          <div className="lg:border-l lg:border-line lg:pl-3">
            <TextareaField
              label="Комментарий → Jira"
              rows={2}
              value={draft}
              disabled={saving}
              onChange={(event) => setDraft(event.target.value)}
            />
            {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
            <div className="mt-2 flex justify-end">
              <Button size="sm" variant="ghost" disabled={saving || draft.trim().length === 0} onClick={() => void submitComment()}>
                {saving ? <Spinner size="sm" /> : null}
                Добавить комментарий
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function QueueIssueSpBadge({ storyPoints }: { storyPoints: number | null | undefined }) {
  const hasEstimate = storyPoints !== null && storyPoints !== undefined && !Number.isNaN(storyPoints);
  const label = `${formatScopeSp(storyPoints)} SP`;

  return (
    <span
      className={cn(
        "shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums",
        hasEstimate ? "bg-line2 text-ink" : "border border-dashed border-line text-ink3/80"
      )}
      title={hasEstimate ? "Story points" : "Оценка не задана"}
    >
      {label}
    </span>
  );
}

function QueueIssueMetaRow({ issue }: { issue: ScopeBoardIssue }) {
  const priorityRank = jiraPriorityRank(issue.priority);
  const showPriorityBadge = issue.priority && priorityRank <= 2;

  if (!issue.status && !issue.priority) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {issue.status ? (
        <span className="text-xs text-ink3">{issue.status}</span>
      ) : null}
      {showPriorityBadge ? (
        <Badge tone={priorityBadgeTone(issue.priority)} className="min-h-5 px-1.5 text-[11px]">
          {issue.priority}
        </Badge>
      ) : issue.priority ? (
        <span className="text-xs text-ink3">· {issue.priority}</span>
      ) : null}
    </div>
  );
}

function QueueMilestoneLine({ milestone }: { milestone: QueueIssueMilestone }) {
  const hasDate = Boolean(milestone.at);
  const statusLabel = milestone.statusName ? `«${milestone.statusName}»` : "фильтре";
  const dateLabel = hasDate ? formatQueueTimelineDate(milestone.at) : null;

  return (
    <div
      className={cn(
        "rounded-md border-l-[3px] px-2.5 py-1.5",
        hasDate
          ? "border-green/70 bg-green/[0.07] text-ink"
          : "border-amber/70 bg-amber/[0.07] text-ink2"
      )}
    >
      {hasDate ? (
        <p className="text-xs leading-snug">
          <span className="text-ink3">В статусе {statusLabel} с </span>
          <span className="font-semibold tabular-nums text-ink">{dateLabel}</span>
        </p>
      ) : (
        <p className="text-xs leading-snug">
          <span className="text-ink2">В очереди в {statusLabel}</span>
          <span className="text-ink3"> · дата перехода не найдена в Jira</span>
        </p>
      )}
    </div>
  );
}

function IssueLink({ issue, className }: { issue: ScopeBoardIssue; className?: string }) {
  const classes = cn("font-semibold text-blue hover:underline", className);
  if (issue.url) {
    return (
      <a href={issue.url} target="_blank" rel="noreferrer" className={classes}>
        {issue.key}
      </a>
    );
  }
  return <span className={cn("font-semibold text-ink", className)}>{issue.key}</span>;
}
