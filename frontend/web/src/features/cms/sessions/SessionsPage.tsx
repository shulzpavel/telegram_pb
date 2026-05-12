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
import { cmsFetch, cmsTasksApi, type CmsTaskBody } from "../api/cmsClient";
import type { JiraPreview, ParticipantItem, SessionDetail, SessionItem, TaskItem } from "../api/cmsTypes";
import { Alert, Button, ConfirmDialog, EmptyState, SelectField, Surface, TextareaField, TextField } from "../../../design-system";
import { CompactList, DataTable, InlineError, MobileRecordCard, MobileRecordField, Skeleton, Status, Toolbar } from "../components/CmsPrimitives";
import { useCmsList } from "../hooks/useCmsList";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { formatDate } from "../../../shared/lib/format";
import { normalizeOptionalNumber, normalizeOptionalText, parseBulkTasks } from "./taskInput";
import { canUseFullReorder, reorderedTaskIds } from "./taskQueueList";

export default function SessionsPage({ canManageTasks }: { canManageTasks: boolean }) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const debouncedQ = useDebouncedValue(q);
  const params = useMemo(
    () => ({ q: debouncedQ, active: active === "" ? undefined : active === "true" }),
    [active, debouncedQ]
  );
  const list = useCmsList<SessionItem>("/sessions", params);

  return (
    <section className="space-y-4">
      <Toolbar>
        <TextField className="md:max-w-sm" aria-label="Search session" placeholder="Search session" value={q} onChange={(event) => setQ(event.target.value)} />
        <SelectField className="md:max-w-[180px]" aria-label="Session status" value={active} onChange={(event) => setActive(event.target.value)}>
          <option value="">All statuses</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </SelectField>
        <Button variant="ghost" size="md" onClick={list.reload}>Refresh</Button>
      </Toolbar>
      <DataTable
        error={list.error}
        loading={list.loading}
        hasMore={Boolean(list.cursor)}
        onMore={list.loadMore}
        columns={["Session", "Users", "Tasks", "Votes", "State", "Updated"]}
        empty={
          list.items.length === 0 && !list.loading ? (
            <EmptyState title="No sessions found" description="Try a different search or status filter." />
          ) : null
        }
        mobileCards={list.items.map((item) => (
          <MobileRecordCard
            key={item.id}
            title={
              <button className="text-left text-blue" onClick={() => setSelectedId(item.id)}>
                {item.session_key}
              </button>
            }
            meta={`chat ${item.chat_id} · topic ${item.topic_id ?? "none"}`}
            action={<Status active={item.is_active} done={item.batch_completed} />}
          >
            <MobileRecordField label="Users" value={item.participants_count} />
            <MobileRecordField label="Tasks" value={item.total_tasks} />
            <MobileRecordField label="Votes" value={item.total_votes} />
            <MobileRecordField label="Updated" value={formatDate(item.updated_at)} />
          </MobileRecordCard>
        ))}
      >
        {list.items.map((item) => (
          <tr key={item.id} className="border-t border-line hover:bg-line2/60">
            <td className="px-3 py-2">
              <button className="text-left font-semibold text-blue" onClick={() => setSelectedId(item.id)}>
                {item.session_key}
              </button>
              <p className="text-xs text-ink3">chat {item.chat_id} · topic {item.topic_id ?? "none"}</p>
            </td>
            <td className="px-3 py-2">{item.participants_count}</td>
            <td className="px-3 py-2">{item.total_tasks}</td>
            <td className="px-3 py-2">{item.total_votes}</td>
            <td className="px-3 py-2"><Status active={item.is_active} done={item.batch_completed} /></td>
            <td className="px-3 py-2 text-ink3">{formatDate(item.updated_at)}</td>
          </tr>
        ))}
      </DataTable>
      {selectedId ? (
        <SessionDetails
          sessionId={selectedId}
          canManageTasks={canManageTasks}
          onClose={() => setSelectedId(null)}
        />
      ) : null}
    </section>
  );
}

function SessionDetails({
  sessionId,
  canManageTasks,
  onClose,
}: {
  sessionId: number;
  canManageTasks: boolean;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bucket, setBucket] = useState("tasks_queue");
  const [taskSearch, setTaskSearch] = useState("");
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
      setError(err instanceof Error ? err.message : "Session failed");
    }
  }, [sessionId]);

  useEffect(() => {
    void refreshDetail();
  }, [refreshDetail]);

  const refreshTasks = useCallback(async () => {
    await refreshDetail();
    await taskList.reload();
  }, [refreshDetail, taskList]);

  return (
    <section className="rounded-lg border border-line bg-surface">
      <div className="px-4 py-3 border-b border-line flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-base font-bold text-ink">Session {detail?.session_key ?? sessionId}</h2>
          <p className="text-xs text-ink3">
            {detail ? `${formatDate(detail.updated_at)} · queue v${detail.tasks_version}` : "Loading"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => void refreshTasks()}>Refresh</Button>
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </div>
      </div>
      {error ? <div className="p-4"><InlineError text={error} /></div> : null}
      {detail ? (
        <div className="grid xl:grid-cols-[minmax(260px,360px)_1fr] gap-4 p-4">
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-ink">Participants</h3>
            <CompactList
              loading={participantList.loading}
              error={participantList.error}
              hasMore={Boolean(participantList.cursor)}
              onMore={participantList.loadMore}
            >
              {participantList.items.map((item) => (
                <div key={item.user_id} className="grid grid-cols-[1fr_auto] gap-3 py-2 border-b border-line last:border-b-0">
                  <div>
                    <p className="text-sm font-semibold text-ink">{item.name}</p>
                    <p className="text-xs text-ink3">{item.user_id} · {item.source}</p>
                  </div>
                  <p className="text-xs font-semibold text-ink3">{item.role}</p>
                </div>
              ))}
            </CompactList>
          </div>
          <TaskQueueEditor
            sessionId={sessionId}
            detail={detail}
            tasks={taskList.items}
            loading={taskList.loading}
            error={taskList.error}
            hasMore={Boolean(taskList.cursor)}
            bucket={bucket}
            search={taskSearch}
            canManage={canManageTasks}
            onBucketChange={setBucket}
            onSearchChange={setTaskSearch}
            onMore={taskList.loadMore}
            onChanged={refreshTasks}
          />
          <pre className="xl:col-span-2 max-h-80 overflow-auto rounded-lg bg-line2 p-3 text-xs text-ink2">
            {JSON.stringify(detail.raw, null, 2)}
          </pre>
        </div>
      ) : (
        <Skeleton height="h-40" />
      )}
    </section>
  );
}

function TaskQueueEditor({
  sessionId,
  detail,
  tasks,
  loading,
  error,
  hasMore,
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
  error: string | null;
  hasMore: boolean;
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
      setMessage("Task queue updated.");
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : "Task update failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3 min-w-0">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="text-sm font-bold text-ink">Tasks</h3>
          <p className="text-xs text-ink3">
            Loaded {tasks.length} · queue {detail.tasks_queue_count} · version {detail.tasks_version}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(180px,1fr)_170px] lg:min-w-[420px]">
          <TextField aria-label="Search tasks" placeholder="Search tasks" value={search} onChange={(event) => onSearchChange(event.target.value)} />
          <SelectField aria-label="Task bucket" value={bucket} onChange={(event) => onBucketChange(event.target.value)}>
            <option value="tasks_queue">Queue</option>
            <option value="history">History</option>
            <option value="last_batch">Last batch</option>
            <option value="">All buckets</option>
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
        <Alert>You can view tasks, but cannot manage the queue.</Alert>
      )}

      {message ? <Alert tone="success">{message}</Alert> : null}
      {mutationError ? <InlineError text={mutationError} /> : null}

      <TaskVirtualList
        sessionId={sessionId}
        detail={detail}
        tasks={tasks}
        loading={loading}
        error={error}
        hasMore={hasMore}
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
  error,
  hasMore,
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
  error: string | null;
  hasMore: boolean;
  bucket: string;
  search: string;
  canManage: boolean;
  busy: string | null;
  reduceMotion: boolean;
  onMore: () => void;
  onRun: (action: string, mutation: () => Promise<unknown>) => Promise<void>;
}) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const queueMode = bucket === "tasks_queue";
  const sortableTasks = tasks.filter((task) => task.task_uid);
  const sortableIds = sortableTasks.map((task) => task.task_uid);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const rowVirtualizer = useVirtualizer({
    count: tasks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 112,
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

  const content = (
    <div ref={parentRef} className="max-h-[640px] overflow-auto">
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
                {queueMode && canManage ? (
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
                )}
              </div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );

  return (
    <div className="rounded-lg border border-line px-3">
      {error ? <InlineError text={error} /> : null}
      {tasks.length === 0 && !loading ? <p className="py-4 text-sm text-ink3">No tasks found.</p> : null}
      {queueMode && canManage ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event) => void handleDragEnd(event)}>
          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            {content}
          </SortableContext>
        </DndContext>
      ) : (
        content
      )}
      <div className="py-2 flex items-center justify-between">
        <p className="text-xs text-ink3">{loading ? "Loading" : hasMore ? "More rows available" : "End"}</p>
        <Button variant="ghost" size="sm" onClick={onMore} disabled={loading || !hasMore}>More</Button>
      </div>
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
  const [bulk, setBulk] = useState("");

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

  async function submitBulk(event: FormEvent) {
    event.preventDefault();
    const tasks = parseBulkTasks(bulk);
    if (tasks.length === 0) return;
    await onRun("bulk", async () => cmsTasksApi.createBulk(sessionId, tasks, expectedVersion));
    setBulk("");
  }

  return (
    <div className="grid gap-3 xl:grid-cols-3">
      <Surface as="form" className="p-3 space-y-3" onSubmit={submitManual}>
        <div className="grid gap-2 sm:grid-cols-[1fr_130px]">
          <TextField label="Task summary" placeholder="Checkout edge case" value={summary} onChange={(event) => setSummary(event.target.value)} />
          <TextField label="SP" inputMode="numeric" value={storyPoints} onChange={(event) => setStoryPoints(event.target.value)} />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <TextField label="Jira key" placeholder="PROJ-123" value={jiraKey} onChange={(event) => setJiraKey(event.target.value)} />
          <TextField label="URL" placeholder="https://..." value={url} onChange={(event) => setUrl(event.target.value)} />
        </div>
        <Button type="submit" variant="primary" className="w-full" disabled={busy !== null || !summary.trim()}>
          Add task
        </Button>
      </Surface>
      <Surface as="form" className="p-3 space-y-3" onSubmit={submitBulk}>
        <TextareaField
          label="Bulk paste"
          placeholder="Paste tasks, one per line"
          value={bulk}
          onChange={(event) => setBulk(event.target.value)}
        />
        <Button type="submit" variant="secondary" className="w-full" disabled={busy !== null || parseBulkTasks(bulk, 1).length === 0}>
          Add pasted tasks
        </Button>
      </Surface>
      <JiraImportPanel
        sessionId={sessionId}
        expectedVersion={expectedVersion}
        busy={busy}
        onRun={onRun}
      />
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
      setPreviewError(err instanceof Error ? err.message : "Jira preview failed");
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
    <Surface as="form" className="p-3 space-y-3" onSubmit={loadPreview}>
      <div className="grid gap-2 sm:grid-cols-[1fr_110px]">
        <TextField label="Jira JQL" placeholder="project = APP order by rank" value={jql} onChange={(event) => setJql(event.target.value)} />
        <TextField label="Limit" inputMode="numeric" value={maxResults} onChange={(event) => setMaxResults(event.target.value)} />
      </div>
      <Button type="submit" variant="secondary" className="w-full" disabled={busy !== null || previewBusy || !jql.trim()} loading={previewBusy}>
        {previewBusy ? "Loading Jira" : "Preview Jira import"}
      </Button>
      {previewError ? <InlineError text={previewError} /> : null}
      {preview ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 text-xs text-ink3">
            <span>{preview.importable}/{preview.total} importable · {selectedKeys.length} selected</span>
            <button
              type="button"
              className="font-semibold text-blue"
              onClick={() => setSelected(new Set(importable.map((item) => item.key)))}
            >
              Select all
            </button>
          </div>
          <div className="max-h-56 overflow-auto rounded-lg border border-line px-2">
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
                  <span className="block text-xs font-bold text-ink">{item.key}{item.duplicate ? " · duplicate" : ""}</span>
                  <span className="block truncate text-xs text-ink3">{item.summary}</span>
                </span>
              </label>
            ))}
          </div>
          <Button
            type="button"
            variant="primary"
            className="w-full"
            disabled={busy !== null || selectedKeys.length === 0}
            onClick={() => void importSelected()}
          >
            Import selected
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
      className="py-3 border-b border-line last:border-b-0"
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
            <Button type="submit" variant="primary" size="sm" disabled={busy !== null || !summary.trim()}>Save</Button>
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </form>
      ) : (
        <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-ink truncate">{task.jira_key ?? `manual ${task.bucket_index + 1}`}</p>
              <Status active={task.bucket === "tasks_queue"} done={task.bucket !== "tasks_queue"} label={task.source} />
              {isCurrent ? <Status active done={false} label="current" /> : null}
            </div>
            <p className="text-sm text-ink2 break-words">{task.summary || "No summary"}</p>
            <p className="text-xs text-ink4">
              #{task.bucket_index + 1} · {task.bucket} · {task.votes_count} votes · avg {task.numeric_avg ?? "-"} · max {task.numeric_max ?? "-"}
            </p>
          </div>
          {canManage ? (
            <div className="grid grid-cols-4 gap-1 sm:flex sm:flex-wrap sm:justify-end sm:max-w-[340px]">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={dragHandleProps?.isDragging ? "bg-line2 text-blue" : ""}
                disabled={disabled || !dragHandleProps}
                title="Drag to reorder"
                {...(dragHandleProps?.attributes ?? {})}
                {...(dragHandleProps?.listeners ?? {})}
              >
                Drag
              </Button>
              <Button variant="ghost" size="sm" disabled={disabled || task.bucket_index === 0} title="Move to top" onClick={() => void move(0)}>Top</Button>
              <Button variant="ghost" size="sm" disabled={disabled || task.bucket_index === 0} title="Move up" onClick={() => void move(task.bucket_index - 1)}>Up</Button>
              <Button variant="ghost" size="sm" disabled={disabled || task.bucket_index >= detail.tasks_queue_count - 1} title="Move down" onClick={() => void move(task.bucket_index + 1)}>Down</Button>
              <Button variant="ghost" size="sm" disabled={disabled || task.bucket_index >= detail.tasks_queue_count - 1} title="Move to bottom" onClick={() => void move(detail.tasks_queue_count - 1)}>End</Button>
              <Button variant="ghost" size="sm" className="sm:min-w-[72px]" disabled={busy !== null || !canManage} onClick={() => setEditing(true)}>Edit</Button>
              <Button variant="danger" size="sm" className="sm:min-w-[72px]" disabled={disabled} onClick={() => setDeleteOpen(true)}>Delete</Button>
            </div>
          ) : null}
          {currentLocked ? (
            <p className="text-xs text-ink4 lg:col-span-2">Current active task is locked while voting is running.</p>
          ) : null}
        </div>
      )}
      <ConfirmDialog
        open={deleteOpen}
        title="Delete task"
        description="This removes the task from the active queue. The action cannot be undone from the CMS screen."
        confirmLabel="Delete"
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => void remove()}
      />
    </motion.div>
  );
}
