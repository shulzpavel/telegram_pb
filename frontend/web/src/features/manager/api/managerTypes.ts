import type { Page } from "../../../shared/types/pagination";
import type { JiraPreview, TaskItem } from "../../cms/api/cmsTypes";
import type { WebSessionState } from "../../../hooks/useSession";

/** Per-participant vote for one task. The manager sees real votes during
 *  the voting phase — participants see only `voted: true/false` until reveal. */
export interface NamedVote {
  name: string;
  value: string;
}

export interface AiTaskSummary {
  description: string;
  methods: string[];
  complexity: string;
  sp_dev?: number;
  sp_test?: number;
  sp_final?: number;
  scale_label?: string;
  confidence?: "low" | "medium" | "high";
  assumptions?: string[];
  estimation_model?: string;
  generated_at?: string;
  source?: string;
}

/** A task that has already been played in the current batch. Used by the
 *  HistoryStrip under the central card, by Backlog SP chips, and by the
 *  finished-session summary page. */
export interface CompletedTask {
  task_id: string;
  jira_key: string | null;
  summary: string;
  url: string | null;
  story_points: number | null;
  source: string;
  completed_at: string | null;
  bucket_index: number | null;
  votes: NamedVote[];
  distribution: Record<string, number>;
  voter_count: number;
  consensus: boolean;
  ai_summary?: AiTaskSummary | null;
}

export interface ManagerSession {
  chat_id: number;
  topic_id: number | null;
  title: string;
  token: string | null;
  invite_url: string | null;
  tasks_version: number;
  tasks_queue_count: number;
  current_task_id: string | null;
  current_batch_started_at: string | null;
  state: WebSessionState;
  /** Manager-only: actual votes cast for the live task (with names). */
  current_task_votes: NamedVote[];
  /**
   * Already-played tasks in this batch, oldest first. When the manager
   * requested paginated state (`completed_limit` query parameter), this is
   * the first page only — the rest is fetched lazily via the `completed`
   * endpoint. The full count is in `completed_count`.
   */
  completed_tasks: CompletedTask[];
  /**
   * Total number of completed tasks in the *active batch*. Set when the
   * server is asked for paginated state. WebSocket pushes always carry the
   * full `completed_tasks` list, in which case this is normalized to the
   * length of that list (see ManagerPage WS merge).
   */
  completed_count?: number;
  /** Cursor for the next page of `completed_tasks`. */
  completed_next_cursor?: string | null;
}

/** Paginated chunk of completed tasks for the active batch. */
export interface CompletedTasksPage {
  items: CompletedTask[];
  next_cursor: string | null;
  limit: number;
  total: number;
}

/** Aggregate stats + completed task list for the finished-session screen. */
export interface SessionSummary {
  chat_id: number;
  topic_id: number | null;
  title: string;
  phase: "complete" | "in_progress" | "fresh";
  started_at: string | null;
  finished_at: string | null;
  tasks_queue_count: number;
  /**
   * Either the full list of completed tasks (legacy default) or the first
   * paginated page when `tasks_limit` is supplied. `stats.total_completed`
   * is always the *exact* count over the full batch.
   */
  completed_tasks: CompletedTask[];
  /** Cursor for paginated tasks. Present when `tasks_limit` was requested. */
  completed_next_cursor?: string | null;
  participants: string[];
  stats: {
    total_completed: number;
    with_estimate: number;
    consensus_count: number;
    votes_cast: number;
    total_story_points: number;
  };
}

/** Result of POST /sessions/{chatId}/jira-story-points/sync after Finish. */
export interface JiraStoryPointsSyncResult {
  updated: number;
  failed: string[];
  skipped: string[];
}

export interface ManagerSessionRef {
  chatId: number;
  topicId: number | null;
  title: string;
  token: string | null;
  inviteUrl: string | null;
}

export interface TaskMutation {
  ok: boolean;
  tasks_version: number;
  current_task_id: string | null;
  tasks_queue_count: number;
  task: TaskItem | null;
  tasks: TaskItem[];
  deleted_task_id: string | null;
}

export type TaskPage = Page<TaskItem>;

export type { JiraPreview, TaskItem };
