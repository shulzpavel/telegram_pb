import { appUrl } from "../../../app/config";
import type { EstimationMode } from "../../../shared/lib/estimationModes";
import { requestJson } from "../../../shared/api/http";
import type { AiJobResponse } from "../../../shared/lib/pollAiJob";
import type {
  CompletedTasksPage,
  JiraPreview,
  JiraStoryPointsSyncResult,
  ManagerSession,
  SessionSummary,
  TaskMutation,
  TaskPage,
} from "./managerTypes";

export type SessionAiSummaryResult = {
  session: ManagerSession;
  cached?: boolean;
};

export type SessionAiSummaryStartResponse =
  | ManagerSession
  | AiJobResponse<SessionAiSummaryResult>;

function appFetch<T>(path: string, init?: RequestInit): Promise<T> {
  return requestJson<T>(appUrl(path), {
    ...init,
    credentials: "include",
  });
}

function query(params: Record<string, string | number | null | undefined>): string {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") q.set(key, String(value));
  }
  const text = q.toString();
  return text ? `?${text}` : "";
}

export const managerApi = {
  createSession: (title: string, teamId?: number | null, estimationMode?: EstimationMode) =>
    appFetch<ManagerSession>("/sessions", {
      method: "POST",
      body: JSON.stringify({
        title,
        team_id: teamId ?? undefined,
        estimation_mode: estimationMode ?? undefined,
      }),
    }),

  demoSession: (reset = false) =>
    appFetch<ManagerSession>(`/demo-session${query({ reset: reset ? "true" : "false" })}`, {
      method: "POST",
    }),

  /**
   * Fetch the cockpit state. When `completedLimit` is provided the response
   * is paginated: `completed_tasks` carries only the first page (oldest
   * first), and the response gains `completed_count` plus
   * `completed_next_cursor`. Pass `null` (default) to keep the legacy
   * unpaginated payload.
   */
  state: (
    chatId: number,
    title: string,
    topicId: number | null = null,
    completedLimit: number | null = null,
    init?: { signal?: AbortSignal },
  ) =>
    appFetch<ManagerSession>(
      `/sessions/${chatId}/state${query({ topic_id: topicId, title, completed_limit: completedLimit })}`,
      init,
    ),

  /**
   * Paginated chunk of already-played tasks for the active batch. Uses an
   * opaque cursor; pass the `next_cursor` returned by the previous call.
   */
  completed: (
    chatId: number,
    opts: { cursor?: string | null; limit?: number; topicId?: number | null } = {},
    init?: { signal?: AbortSignal },
  ) =>
    appFetch<CompletedTasksPage>(
      `/sessions/${chatId}/completed${query({
        topic_id: opts.topicId ?? null,
        cursor: opts.cursor ?? null,
        limit: opts.limit ?? 20,
      })}`,
      init,
    ),

  /** Mint a fresh invite token + URL for an existing session. Used to recover
   *  from an expired/missing token without recreating the whole session. */
  regenerateInvite: (chatId: number, title: string, topicId: number | null = null) =>
    appFetch<{ token: string; invite_url: string }>(
      `/sessions/${chatId}/invite${query({ topic_id: topicId, title })}`,
      { method: "POST" },
    ),

  /** Rename an active session. The title is also persisted to CMS so the
   *  read model (`cms_sessions.title`) stays in sync — manual renames here
   *  always win over the value provided at session-create time. */
  renameSession: (chatId: number, title: string, topicId: number | null = null) =>
    appFetch<{ chat_id: number; topic_id: number | null; title: string }>(
      `/sessions/${chatId}/title${query({ topic_id: topicId })}`,
      {
        method: "PATCH",
        body: JSON.stringify({ title }),
      },
    ),

  tasks: (chatId: number, cursor: string | null = null, q = "", topicId: number | null = null) =>
    appFetch<TaskPage>(`/sessions/${chatId}/tasks${query({ topic_id: topicId, cursor, q, limit: 100 })}`),

  addTask: (
    chatId: number,
    body: { summary: string; jira_key?: string | null; url?: string | null; story_points?: number | null; expected_version?: number | null },
  ) =>
    appFetch<TaskMutation>(`/sessions/${chatId}/tasks`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updateTask: (
    chatId: number,
    taskId: string,
    body: { summary: string; jira_key?: string | null; url?: string | null; story_points?: number | null; expected_version?: number | null },
  ) =>
    appFetch<TaskMutation>(`/sessions/${chatId}/tasks/${encodeURIComponent(taskId)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  deleteTask: (chatId: number, taskId: string, expectedVersion?: number | null) =>
    appFetch<TaskMutation>(`/sessions/${chatId}/tasks/${encodeURIComponent(taskId)}${query({ expected_version: expectedVersion })}`, {
      method: "DELETE",
    }),

  moveTask: (chatId: number, taskId: string, targetIndex: number, expectedVersion?: number | null) =>
    appFetch<TaskMutation>(`/sessions/${chatId}/tasks/${encodeURIComponent(taskId)}/move`, {
      method: "POST",
      body: JSON.stringify({ target_index: targetIndex, expected_version: expectedVersion ?? null }),
    }),

  jiraPreview: (chatId: number, jql: string, maxResults = 500) =>
    appFetch<JiraPreview>(`/sessions/${chatId}/tasks/jira-preview`, {
      method: "POST",
      body: JSON.stringify({ jql, max_results: maxResults }),
    }),

  jiraImport: (
    chatId: number,
    body: { jql: string; selected_keys?: string[]; max_results?: number; expected_version?: number | null },
  ) =>
    appFetch<TaskMutation>(`/sessions/${chatId}/tasks/jira-import`, {
      method: "POST",
      body: JSON.stringify({
        jql: body.jql,
        selected_keys: body.selected_keys ?? [],
        max_results: body.max_results ?? 500,
        expected_version: body.expected_version ?? null,
      }),
    }),

  start: (chatId: number, estimationMode?: EstimationMode) =>
    appFetch<ManagerSession>(`/sessions/${chatId}/start`, {
      method: "POST",
      body: JSON.stringify({ estimation_mode: estimationMode ?? undefined }),
    }),
  generateAiSummary: (chatId: number, topicId: number | null = null) =>
    appFetch<ManagerSession>(`/sessions/${chatId}/ai-summary${query({ topic_id: topicId })}`, { method: "POST" }),
  startAiSummary: (chatId: number, topicId: number | null = null) =>
    appFetch<SessionAiSummaryStartResponse>(
      `/sessions/${chatId}/ai-summary${query({ topic_id: topicId, async: "1" })}`,
      { method: "POST" }
    ),
  getAiSummaryJob: (chatId: number, jobId: string, topicId: number | null = null) =>
    appFetch<AiJobResponse<SessionAiSummaryResult>>(
      `/sessions/${chatId}/ai-summary/jobs/${encodeURIComponent(jobId)}${query({ topic_id: topicId })}`
    ),
  next: (chatId: number) => appFetch<ManagerSession>(`/sessions/${chatId}/next`, { method: "POST" }),
  skip: (chatId: number) => appFetch<ManagerSession>(`/sessions/${chatId}/skip`, { method: "POST" }),
  finish: (chatId: number) => appFetch<ManagerSession>(`/sessions/${chatId}/finish`, { method: "POST" }),
  syncJiraStoryPoints: (chatId: number, topicId: number | null = null) =>
    appFetch<JiraStoryPointsSyncResult>(`/sessions/${chatId}/jira-story-points/sync${query({ topic_id: topicId })}`, {
      method: "POST",
      body: JSON.stringify({ skip_errors: true }),
    }),
  finalEstimate: (chatId: number, value: number) =>
    appFetch<ManagerSession>(`/sessions/${chatId}/final-estimate`, {
      method: "POST",
      body: JSON.stringify({ value }),
    }),

  finalEstimateTracks: (chatId: number, tracks: Record<string, number>) =>
    appFetch<ManagerSession>(`/sessions/${chatId}/final-estimate`, {
      method: "POST",
      body: JSON.stringify({ tracks }),
    }),

  reopenCompletedTask: (
    chatId: number,
    taskId: string,
    topicId: number | null = null,
    expectedVersion?: number | null,
  ) =>
    appFetch<ManagerSession>(
      `/sessions/${chatId}/completed/${encodeURIComponent(taskId)}/reopen${query({
        topic_id: topicId,
      })}`,
      {
        method: "POST",
        body: JSON.stringify({
          expected_version: expectedVersion ?? null,
        }),
      },
    ),

  /**
   * Detailed report for the finished session screen. Returns completed
   * tasks with full vote breakdowns, aggregate stats and timing.
   *
   * When `tasksLimit` is provided, `completed_tasks` is the first page
   * only and the response gains `completed_next_cursor`. Stats fields are
   * always exact (computed against the full batch on the server).
   */
  summary: (
    chatId: number,
    title: string,
    topicId: number | null = null,
    tasksLimit: number | null = null,
    init?: { signal?: AbortSignal },
  ) =>
    appFetch<SessionSummary>(
      `/sessions/${chatId}/summary${query({ topic_id: topicId, title, tasks_limit: tasksLimit })}`,
      init,
    ),

  /** Paginated completed-tasks list for the finished-session screen. */
  summaryTasks: (
    chatId: number,
    opts: { cursor?: string | null; limit?: number; topicId?: number | null } = {},
    init?: { signal?: AbortSignal },
  ) =>
    appFetch<CompletedTasksPage>(
      `/sessions/${chatId}/summary/tasks${query({
        topic_id: opts.topicId ?? null,
        cursor: opts.cursor ?? null,
        limit: opts.limit ?? 20,
      })}`,
      init,
    ),

  /** Direct CSV download URL — opened via window.location.assign so the
   *  browser triggers an "attach" download with the session-cookie auth. */
  summaryCsvUrl: (chatId: number, title: string, topicId: number | null = null) =>
    appUrl(`/sessions/${chatId}/summary.csv${query({ topic_id: topicId, title })}`),

  /** Confluence-friendly Markdown report download. */
  summaryMarkdownUrl: (chatId: number, title: string, topicId: number | null = null) =>
    appUrl(`/sessions/${chatId}/summary.md${query({ topic_id: topicId, title })}`),
};
