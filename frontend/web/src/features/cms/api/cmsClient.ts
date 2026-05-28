import { CMS_PAGE_LIMIT, cmsUrl } from "../../../app/config";
import { ApiError, requestJson } from "../../../shared/api/http";
import type { Page, ParamValue } from "../../../shared/types/pagination";
import type { AuditEvent, CmsAdmin, CmsPageAccess, CmsPermission, CmsPrincipal, CmsRole, JiraPreview, TaskItem, ThemeMode } from "./cmsTypes";

const CMS_AUTH_HINT_KEY = "planning_poker_cms_auth";

function getStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function hasCmsAuthHint(): boolean {
  return getStorage()?.getItem(CMS_AUTH_HINT_KEY) === "1";
}

function markCmsAuthHint() {
  getStorage()?.setItem(CMS_AUTH_HINT_KEY, "1");
}

export function clearCmsAuthHint() {
  getStorage()?.removeItem(CMS_AUTH_HINT_KEY);
}

export function buildQuery(
  params: Record<string, ParamValue>,
  cursor: string | null,
  limit = CMS_PAGE_LIMIT
): string {
  const query = new URLSearchParams();
  query.set("limit", String(limit));
  if (cursor) query.set("cursor", cursor);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, String(value));
    }
  }
  return query.toString();
}

export async function cmsFetch<T>(path: string, init?: RequestInit): Promise<T> {
  return requestJson<T>(cmsUrl(path), {
    ...init,
    credentials: "include",
  });
}

export async function cmsList<T>(
  path: string,
  params: Record<string, ParamValue>,
  cursor: string | null,
  init?: { signal?: AbortSignal }
): Promise<Page<T>> {
  const query = buildQuery(params, cursor);
  return cmsFetch<Page<T>>(`${path}?${query}`, init);
}

export const cmsAuthApi = {
  me: async () => {
    try {
      const principal = await cmsFetch<CmsPrincipal>("/auth/me");
      markCmsAuthHint();
      return principal;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearCmsAuthHint();
      }
      throw err;
    }
  },
  login: async (username: string, password: string) => {
    try {
      const result = await cmsFetch<{ ok: boolean; expires_in: number }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      markCmsAuthHint();
      return result;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearCmsAuthHint();
      }
      throw err;
    }
  },
  logout: async () => {
    try {
      return await cmsFetch<{ ok: boolean }>("/auth/logout", { method: "POST" });
    } finally {
      clearCmsAuthHint();
    }
  },
  updatePreferences: (payload: { theme_preference: ThemeMode }) =>
    cmsFetch<{ ok: boolean }>("/auth/me/preferences", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
};

export const cmsAccessApi = {
  permissions: () => cmsFetch<{ items: CmsPermission[] }>("/access/permissions"),
  pages: () => cmsFetch<{ items: CmsPageAccess[] }>("/access/pages"),
  roles: () => cmsFetch<{ items: CmsRole[] }>("/access/roles"),
  admins: (params: Record<string, ParamValue> = {}, cursor: string | null = null) =>
    cmsList<CmsAdmin>("/access/admins", params, cursor),
  createRole: (body: {
    key: string;
    name: string;
    description: string;
    permission_keys: string[];
  }) =>
    cmsFetch<CmsRole>("/access/roles", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateRole: (
    roleId: number,
    body: {
      name: string;
      description: string;
      permission_keys: string[];
    }
  ) =>
    cmsFetch<CmsRole>(`/access/roles/${roleId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  createAdmin: (body: {
    username: string;
    password: string;
    display_name: string | null;
    is_active: boolean;
    role_ids: number[];
  }) =>
    cmsFetch<CmsAdmin>("/access/admins", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateAdmin: (
    adminId: number,
    body: {
      display_name: string | null;
      is_active: boolean;
      role_ids: number[];
      password?: string;
    }
  ) =>
    cmsFetch<CmsAdmin>(`/access/admins/${adminId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
};

export interface CmsTaskMutation {
  ok: boolean;
  tasks_version: number;
  current_task_id: string | null;
  tasks_queue_count: number;
  task: TaskItem | null;
  tasks: TaskItem[];
  deleted_task_id: string | null;
}

export interface CmsTaskBody {
  summary: string;
  jira_key?: string | null;
  url?: string | null;
  story_points?: number | null;
  expected_version?: number | null;
}

export const cmsSessionsApi = {
  close: (sessionId: number) =>
    cmsFetch<{ ok: boolean; session_id: number; completed_count: number; batch_completed: boolean }>(
      `/sessions/${sessionId}/close`,
      { method: "POST" }
    ),
  delete: (sessionId: number) =>
    cmsFetch<{ ok: boolean; session_id: number; deleted: boolean }>(`/sessions/${sessionId}`, {
      method: "DELETE",
    }),
  rename: (sessionId: number, title: string | null) =>
    cmsFetch<{ ok: boolean; session_id: number; title: string | null }>(`/sessions/${sessionId}`, {
      method: "PATCH",
      body: JSON.stringify({ title }),
    }),
};

export interface CmsEventsListParams {
  /** Exact-match actor username; used by per-user mini-journal. */
  actor?: string | null;
  action?: string | null;
  status?: string | null;
  ts_from?: string | null;
  ts_to?: string | null;
  limit?: number;
}

export const cmsEventsApi = {
  /**
   * Paged audit-events feed. Mirrors the shape used by `useCmsList` so the
   * audit page can keep its progressive-list wiring, while a one-shot call
   * is cheap to make from the Access UI for the per-user mini-journal.
   */
  list: (params: CmsEventsListParams = {}, cursor: string | null = null) => {
    const apiParams: Record<string, ParamValue> = {
      actor: params.actor ?? undefined,
      action: params.action ?? undefined,
      status: params.status ?? undefined,
      ts_from: params.ts_from ?? undefined,
      ts_to: params.ts_to ?? undefined,
      // `buildQuery` initializes `limit` from its own arg, but any key on
      // params overrides it. Pass through so the mini-journal can request
      // a smaller page than the default 50.
      limit: params.limit ?? undefined,
    };
    return cmsList<AuditEvent>("/events", apiParams, cursor);
  },
};

export const cmsUsersApi = {
  hardDelete: (userId: string, confirmName: string) =>
    cmsFetch<{
      ok: boolean;
      user_id: string;
      deleted: boolean;
      votes_deleted: number;
      session_participants_deleted: number;
      web_participants_deleted: number;
    }>("/users", {
      method: "DELETE",
      body: JSON.stringify({ user_id: userId, confirm_name: confirmName }),
    }),
};

export const cmsTokensApi = {
  revoke: (tokenId: number) =>
    cmsFetch<{ ok: boolean; token_id: number; revoked: boolean }>(`/tokens/${tokenId}`, {
      method: "DELETE",
    }),
};

export interface SprintPlanRoleInput {
  name: string;
  headcount: number;
  absences: number;
}

export interface SprintPlanHistoryEntry {
  label: string;
  /** Legacy field — populated for plans saved before the dev/test split. */
  story_points?: number;
  story_points_dev?: number;
  story_points_test?: number;
}

export interface SprintPlanPayload {
  working_days: number;
  average_capacity: number;
  buffer_percent: number;
  velocity_history: SprintPlanHistoryEntry[];
  roles: SprintPlanRoleInput[];
  notes: string;
  result_summary?: string | null;
}

export interface SprintPlanRecord {
  id: number;
  name: string;
  payload: SprintPlanPayload;
  created_by: number | null;
  created_by_username: string | null;
  created_by_display_name: string | null;
  created_at: string;
  updated_at: string;
}

export const cmsPlannerApi = {
  list: () => cmsFetch<{ items: SprintPlanRecord[] }>("/sprint-plans"),
  get: (planId: number) => cmsFetch<SprintPlanRecord>(`/sprint-plans/${planId}`),
  create: (body: { name: string; payload: SprintPlanPayload }) =>
    cmsFetch<SprintPlanRecord>("/sprint-plans", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  update: (planId: number, body: { name: string; payload: SprintPlanPayload }) =>
    cmsFetch<SprintPlanRecord>(`/sprint-plans/${planId}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  delete: (planId: number) =>
    cmsFetch<{ ok: boolean; id: number }>(`/sprint-plans/${planId}`, {
      method: "DELETE",
    }),
};

export const cmsTasksApi = {
  create: (sessionId: number, body: CmsTaskBody) =>
    cmsFetch<CmsTaskMutation>(`/sessions/${sessionId}/tasks`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  update: (sessionId: number, taskId: string, body: CmsTaskBody) =>
    cmsFetch<CmsTaskMutation>(`/sessions/${sessionId}/tasks/${encodeURIComponent(taskId)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  delete: (sessionId: number, taskId: string, expectedVersion?: number | null) => {
    const query = expectedVersion === undefined || expectedVersion === null ? "" : `?expected_version=${expectedVersion}`;
    return cmsFetch<CmsTaskMutation>(`/sessions/${sessionId}/tasks/${encodeURIComponent(taskId)}${query}`, {
      method: "DELETE",
    });
  },
  move: (sessionId: number, taskId: string, targetIndex: number, expectedVersion?: number | null) =>
    cmsFetch<CmsTaskMutation>(`/sessions/${sessionId}/tasks/${encodeURIComponent(taskId)}/move`, {
      method: "POST",
      body: JSON.stringify({ target_index: targetIndex, expected_version: expectedVersion ?? null }),
    }),
  reorder: (sessionId: number, orderedTaskIds: string[], expectedVersion?: number | null) =>
    cmsFetch<CmsTaskMutation>(`/sessions/${sessionId}/tasks/reorder`, {
      method: "POST",
      body: JSON.stringify({ ordered_task_ids: orderedTaskIds, expected_version: expectedVersion ?? null }),
    }),
  jiraPreview: (sessionId: number, jql: string, maxResults = 500) =>
    cmsFetch<JiraPreview>(`/sessions/${sessionId}/tasks/jira-preview`, {
      method: "POST",
      body: JSON.stringify({ jql, max_results: maxResults }),
    }),
  jiraImport: (
    sessionId: number,
    body: {
      jql: string;
      max_results?: number;
      selected_keys?: string[];
      expected_version?: number | null;
    }
  ) =>
    cmsFetch<CmsTaskMutation>(`/sessions/${sessionId}/tasks/jira-import`, {
      method: "POST",
      body: JSON.stringify({
        jql: body.jql,
        max_results: body.max_results ?? 500,
        selected_keys: body.selected_keys ?? [],
        expected_version: body.expected_version ?? null,
      }),
    }),
};
