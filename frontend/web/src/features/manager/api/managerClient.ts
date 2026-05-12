import { appUrl } from "../../../app/config";
import { requestJson } from "../../../shared/api/http";
import type { JiraPreview, ManagerSession, TaskMutation, TaskPage } from "./managerTypes";

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
  createSession: (title: string) =>
    appFetch<ManagerSession>("/sessions", {
      method: "POST",
      body: JSON.stringify({ title }),
    }),

  demoSession: (reset = false) =>
    appFetch<ManagerSession>(`/demo-session${query({ reset: reset ? "true" : "false" })}`, {
      method: "POST",
    }),

  state: (chatId: number, title: string, topicId: number | null = null) =>
    appFetch<ManagerSession>(`/sessions/${chatId}/state${query({ topic_id: topicId, title })}`),

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

  addTasksBulk: (
    chatId: number,
    tasks: Array<{ summary: string; jira_key?: string | null; url?: string | null; story_points?: number | null }>,
    expectedVersion?: number | null,
  ) =>
    appFetch<TaskMutation>(`/sessions/${chatId}/tasks/bulk`, {
      method: "POST",
      body: JSON.stringify({ tasks, expected_version: expectedVersion ?? null }),
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

  start: (chatId: number) => appFetch<ManagerSession>(`/sessions/${chatId}/start`, { method: "POST" }),
  reveal: (chatId: number) => appFetch<ManagerSession>(`/sessions/${chatId}/reveal`, { method: "POST" }),
  next: (chatId: number) => appFetch<ManagerSession>(`/sessions/${chatId}/next`, { method: "POST" }),
  skip: (chatId: number) => appFetch<ManagerSession>(`/sessions/${chatId}/skip`, { method: "POST" }),
  finish: (chatId: number) => appFetch<ManagerSession>(`/sessions/${chatId}/finish`, { method: "POST" }),
  finalEstimate: (chatId: number, value: number) =>
    appFetch<ManagerSession>(`/sessions/${chatId}/final-estimate`, {
      method: "POST",
      body: JSON.stringify({ value }),
    }),
};
