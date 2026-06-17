import { CMS_PAGE_LIMIT, cmsUrl } from "../../../app/config";
import { ApiError, requestJson } from "../../../shared/api/http";
import type { Page, ParamValue } from "../../../shared/types/pagination";
import type {
  AuditEvent,
  CmsAdmin,
  CmsPageAccess,
  CmsPermission,
  CmsPrincipal,
  CmsRole,
  CmsTeam,
  JiraPreview,
  TaskItem,
  ThemeMode,
} from "./cmsTypes";
import type { RetroAiSummary, RetroLiveState } from "../retro/retroLogic";
import type { ScopeAiSummary, ScopeAiHistoryEntry } from "../scope/scopeAiTypes";
import type { AiJobResponse } from "../../../shared/lib/pollAiJob";

export type ScopeAiAnalyzeResult = {
  ai_summary: ScopeAiSummary;
  board: ScopeBoardRecord;
  cached?: boolean;
};

export type ScopeAnalyzeStartResponse =
  | ScopeAiAnalyzeResult
  | AiJobResponse<ScopeAiAnalyzeResult>;

export type RetroAiAnalyzeResult = {
  ai_summary: RetroAiSummary;
  cached?: boolean;
};

export type RetroAnalyzeStartResponse =
  | RetroAiAnalyzeResult
  | AiJobResponse<RetroAiAnalyzeResult>;

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
    team_ids?: number[];
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
      team_ids?: number[];
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

export interface SprintPlanTrack {
  /** Short slug used as the stable reference (e.g. "back", "front", "qa"). */
  id: string;
  /** Human-readable label. */
  label: string;
}

export interface SprintPlanRoleInput {
  name: string;
  headcount: number;
  absences: number;
  /** Tag-driven planner: which track this role belongs to. */
  track_id?: string;
}

export interface SprintPlanHistoryEntry {
  label: string;
  /** Closed SP per track id. Tag-driven planner. */
  by_track?: Record<string, number>;
  /** Legacy field — populated for plans saved before the tag split. */
  story_points?: number;
  /** Legacy field — populated for plans saved during the dev/test split phase. */
  story_points_dev?: number;
  story_points_test?: number;
}

export interface SprintPlanPayload {
  working_days: number;
  /** Legacy / deprecated — kept for back-compat with older payloads. */
  average_capacity: number;
  buffer_percent: number;
  /** Track definitions. Optional for back-compat with older payloads. */
  tracks?: SprintPlanTrack[];
  velocity_history: SprintPlanHistoryEntry[];
  roles: SprintPlanRoleInput[];
  /** Actual closed SP per track, entered by the manager at sprint end. */
  actual_by_track?: Record<string, number>;
  notes: string;
  result_summary?: string | null;
}

export interface SprintPlanRecord {
  id: number;
  name: string;
  payload: SprintPlanPayload;
  team_id: number | null;
  team: { id: number; slug?: string; name?: string } | null;
  created_by: number | null;
  created_by_username: string | null;
  created_by_display_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface CmsListTeamParams {
  team_id?: number;
  sort?: "team_then_updated";
}

export const cmsTeamsApi = {
  list: () => cmsFetch<{ items: CmsTeam[] }>("/teams"),
  create: (body: { slug?: string; name: string; description?: string }) =>
    cmsFetch<CmsTeam>("/teams", { method: "POST", body: JSON.stringify(body) }),
  update: (
    teamId: number,
    body: { name?: string; description?: string; is_active?: boolean }
  ) =>
    cmsFetch<CmsTeam>(`/teams/${teamId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
};

export const cmsPlannerApi = {
  list: (params: CmsListTeamParams = {}) => {
    const query = buildQuery(params as Record<string, ParamValue>, null);
    return cmsFetch<{ items: SprintPlanRecord[] }>(`/sprint-plans?${query}`);
  },
  get: (planId: number) => cmsFetch<SprintPlanRecord>(`/sprint-plans/${planId}`),
  create: (body: { name: string; payload: SprintPlanPayload; team_id?: number | null }) =>
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

export type ScopeIntakeStatus = "ok" | "warning" | "stop";
export type ScopeWorkloadMode = "sp" | "sp_dev_test";

export type ScopeSectionKind = "planned" | "unplanned";

export interface ScopeBoardIssue {
  key: string;
  summary: string;
  url: string;
  story_points: number | null;
  story_points_source?: string | null;
  story_points_plan?: number | null;
  story_points_fact?: number | null;
  story_points_dev?: number | null;
  story_points_test?: number | null;
  story_point_estimate?: number | null;
  estimated: boolean;
  missing_tracks?: string[];
  workload_attention_reasons?: string[];
  status: string;
  status_category: string;
  issue_type: string;
  labels: string[];
  epic_labels?: string[];
  created?: string | null;
  updated?: string | null;
  status_changed_at?: string | null;
  status_entered_at?: string | null;
  epic_linked_at?: string | null;
  due_date?: string | null;
  resolution?: string;
  resolution_date?: string | null;
  parent_key?: string | null;
  epic_key?: string | null;
  linked_epic_key?: string | null;
  priority?: string;
  assignee?: string;
  developer?: string;
  developer_source?: string;
  role_contributors?: Record<string, { name?: string; source?: string }>;
  jira_role_assignees?: Partial<Record<"front" | "back" | "qa", string>>;
  role_contributors_list?: ScopeRoleContributor[];
  role_workload_items?: ScopeRoleEvidence[];
  role_evidence?: ScopeRoleEvidence[];
  front?: string;
  back?: string;
  qa?: string;
  reporter?: string;
  components?: string[];
  fix_versions?: string[];
  versions?: string[];
  sprints?: string[];
  sprint?: string;
  team?: string;
  team_labels?: string[];
  plan_status?: string;
  plan_change_reason?: string;
  plan_change_reasons?: string[];
  final_priority?: string;
  severity?: string;
  domain?: string;
  request_type?: string;
  checklist_progress?: number | null;
  last_comment?: string;
  last_comment_author?: string;
  last_comment_at?: string | null;
  grooming_comment?: string;
  grooming_comment_by?: string;
  grooming_comment_at?: string | null;
  scope_creep?: boolean;
  bucket?: string;
  section_id?: string;
  section_name?: string;
  section_kind?: ScopeSectionKind;
}

export interface ScopeManualQuestion {
  id: string;
  summary: string;
  created_by?: string;
  created_at?: string;
  kind?: "manual";
}

export interface ScopeTopItem {
  id: string;
  text: string;
  created_by?: string;
  created_at?: string;
}

export interface ScopeResolvedQuestion {
  id: string;
  key?: string;
  summary: string;
  url?: string;
  status?: string;
  priority?: string;
  assignee?: string;
  bucket?: string;
  section_id?: string;
  section_name?: string;
  section_kind?: ScopeSectionKind;
  kind?: "jira" | "manual";
  comment: string;
  resolved_by?: string;
  resolved_at?: string;
}

export type ScopeReportBucket = "in_work" | "in_test" | "done" | "open_questions";

export interface ScopeEpicReportSection {
  in_work: ScopeBoardIssue[];
  in_test: ScopeBoardIssue[];
  done: ScopeBoardIssue[];
  counts: {
    in_work: number;
    in_test: number;
    done: number;
    total: number;
  };
}

export interface ScopeSectionConfig {
  id: string;
  name: string;
  jql: string;
  kind: ScopeSectionKind;
  order: number;
}

export interface ScopeSnapshotSection {
  id: string;
  name: string;
  kind: ScopeSectionKind;
  order: number;
  issues: ScopeBoardIssue[];
}

export interface ScopeSectionMetrics {
  id: string;
  name: string;
  kind: ScopeSectionKind;
  order: number;
  story_points: number;
  count: number;
  by_status: Record<string, number>;
}

export interface ScopeReportSectionBlock extends ScopeEpicReportSection {
  id: string;
  name: string;
  kind: ScopeSectionKind;
  order: number;
}

export interface ScopeBoardReport {
  sections?: ScopeReportSectionBlock[];
  plan: ScopeEpicReportSection;
  unplan: ScopeEpicReportSection;
  open_questions: ScopeBoardIssue[];
  counts: Record<ScopeReportBucket, number>;
}

export interface ScopeAssigneeBreakdown {
  assignee: string;
  story_points: number;
  count: number;
}

export interface ScopeDeveloperTaskSummary {
  key: string;
  summary: string;
  url: string;
  story_points?: number | null;
  status?: string;
  assignee?: string;
  developer_source?: string;
  status_entered_at?: string | null;
  status_changed_at?: string | null;
  updated?: string | null;
  front?: string;
  back?: string;
  qa?: string;
  role_contributors_list?: ScopeRoleContributor[];
  subtasks?: string[];
  role_unresolved?: Record<string, string>;
}

export interface ScopeRoleContributor {
  role: string;
  name: string;
  source?: string;
}

export interface ScopeRoleEvidence {
  role: string;
  name?: string;
  source?: string;
  jira_key?: string;
  source_url?: string;
  project_path?: string;
  confidence?: string;
  unresolved_reason?: string;
  subtask_key?: string;
}

export interface ScopeRoleBreakdownMap {
  front: ScopeDeveloperBreakdown[];
  back: ScopeDeveloperBreakdown[];
  qa: ScopeDeveloperBreakdown[];
}

export interface ScopeRoleCoverageDetail {
  attributed: number;
  total: number;
  confirmed?: number;
  estimated?: number;
  unattributed?: number;
  confirmed_jira?: number;
  confirmed_gitlab?: number;
  confirmed_jira_qa?: number;
  unresolved_no_gitlab_link?: number;
  unresolved_ambiguous_role?: number;
  unresolved_no_qa_transition?: number;
}

export interface ScopeRoleCoverageMap {
  front: ScopeRoleCoverageDetail;
  back: ScopeRoleCoverageDetail;
  qa: ScopeRoleCoverageDetail;
}

export interface ScopeDeveloperBreakdown {
  developer: string;
  story_points: number;
  count: number;
  issues: ScopeDeveloperTaskSummary[];
}

export interface ScopeBoardMetrics {
  workload_mode?: ScopeWorkloadMode;
  capacity_sp: number;
  capacity_sp_dev?: number | null;
  capacity_sp_test?: number | null;
  plan_sp: number;
  unplan_sp: number;
  buffer_sp: number;
  overfill_sp: number;
  plan_dev_sp?: number;
  unplan_dev_sp?: number;
  buffer_dev_sp?: number;
  overfill_dev_sp?: number;
  plan_test_sp?: number;
  unplan_test_sp?: number;
  buffer_test_sp?: number;
  overfill_test_sp?: number;
  intake_status: ScopeIntakeStatus;
  plan_count: number;
  unplan_count: number;
  unestimated_count: number;
  unestimated_tasks: ScopeBoardIssue[];
  scope_creep_count: number;
  plan_by_status: Record<string, number>;
  unplan_by_status: Record<string, number>;
  plan_by_assignee?: ScopeAssigneeBreakdown[];
  unplan_by_assignee?: ScopeAssigneeBreakdown[];
  plan_by_developer?: ScopeDeveloperBreakdown[];
  unplan_by_developer?: ScopeDeveloperBreakdown[];
  plan_by_role?: ScopeRoleBreakdownMap;
  unplan_by_role?: ScopeRoleBreakdownMap;
  plan_role_coverage?: ScopeRoleCoverageMap;
  unplan_role_coverage?: ScopeRoleCoverageMap;
  plan_status_counts?: Record<string, number>;
  plan_change_reason_counts?: Record<string, number>;
  sections?: ScopeSectionMetrics[];
  section_count?: number;
  month: string;
  month_start: string;
}

export interface ScopeRefreshEvent {
  type: string;
  message: string;
  at?: string | null;
  key?: string;
  bucket?: string;
  story_points?: number | null;
  summary?: string;
  buffer_from?: number;
  buffer_to?: number;
  from_sp?: number | null;
  to_sp?: number | null;
}

export interface ScopeRefreshDelta {
  plan_sp: number;
  unplan_sp: number;
  buffer_sp: number;
  plan_count: number;
  unplan_count: number;
  from: {
    plan_sp: number;
    unplan_sp: number;
    buffer_sp: number;
    plan_count: number;
    unplan_count: number;
  };
  to: {
    plan_sp: number;
    unplan_sp: number;
    buffer_sp: number;
    plan_count: number;
    unplan_count: number;
  };
}

export interface ScopeRefreshLogEntry {
  at: string;
  delta: ScopeRefreshDelta | null;
  events: ScopeRefreshEvent[];
  metrics_summary: {
    plan_sp: number;
    unplan_sp: number;
    buffer_sp: number;
    plan_count: number;
    unplan_count: number;
    intake_status: ScopeIntakeStatus;
  };
}

export type ScopePriorityQueueKind = "todo" | "test";

export interface ScopePriorityQueueHistoryEntry {
  type: "reorder" | "comment" | "refresh" | "appeared";
  at: string;
  by: string;
  comment?: string;
  issue_key?: string;
  status_name?: string;
  from_index?: number;
  to_index?: number;
  order?: string[];
  added?: string[];
  removed?: string[];
  message: string;
}

export interface ScopePriorityQueue {
  order: string[];
  issues: ScopeBoardIssue[];
  history: ScopePriorityQueueHistoryEntry[];
  filter_seen_at?: Record<string, string>;
}

export interface ScopePriorityQueues {
  todo: ScopePriorityQueue;
  test: ScopePriorityQueue;
}

export interface ScopeTodoItem {
  id: string;
  text: string;
  done: boolean;
  created_by?: string;
  created_at?: string;
  done_by?: string;
  done_at?: string;
}

export interface ScopeBoardSnapshot {
  sections?: ScopeSnapshotSection[];
  plan_issues: ScopeBoardIssue[];
  unplan_issues: ScopeBoardIssue[];
  metrics: ScopeBoardMetrics;
  report?: ScopeBoardReport;
  jira_role_fields_configured?: Partial<Record<"front" | "back" | "qa", boolean>>;
  release_context?: ScopeReleaseContext;
  manual_questions?: ScopeManualQuestion[];
  top_items?: ScopeTopItem[];
  todo_items?: ScopeTodoItem[];
  resolved_questions?: ScopeResolvedQuestion[];
  priority_queues?: ScopePriorityQueues;
  refreshed_at: string;
  delta?: ScopeRefreshDelta | null;
  events?: ScopeRefreshEvent[];
  refresh_log?: ScopeRefreshLogEntry[];
  jira_fetch_warnings?: ScopeJiraFetchWarning[];
}

export type ScopeReleaseContext = {
  current: ScopeReleaseBucket;
  previous?: ScopeReleaseBucket;
  next?: ScopeReleaseBucket;
  custom?: ScopeReleaseBucket;
  releases?: ScopeReleaseBucket[];
};

export type ScopeReleaseSlot = string;
export type ScopeReleaseQueryType = "past" | "future";

export interface ScopeReleaseQuery {
  id: string;
  type: ScopeReleaseQueryType;
  label?: string;
  jql: string;
}

export interface ScopeReleaseVersionMeta {
  id: string;
  name: string;
  released: boolean;
  archived?: boolean;
  overdue?: boolean;
  start_date?: string | null;
  release_date?: string | null;
  description?: string;
  project_key?: string;
  project_id?: string | null;
}

export interface ScopeReleaseBucket {
  slot: ScopeReleaseSlot;
  label: string;
  jql: string;
  relation?: ScopeReleaseQueryType;
  order?: number;
  project_key: string;
  version_id: string;
  version_name: string;
  version_meta?: ScopeReleaseVersionMeta;
  issues: ScopeBoardIssue[];
  story_points?: number;
  counts: {
    total: number;
    in_work: number;
    in_test: number;
    done: number;
    open_questions: number;
  };
  by_status: Record<string, number>;
  by_issue_type?: Record<string, number>;
  in_work: ScopeBoardIssue[];
  in_test: ScopeBoardIssue[];
  done: ScopeBoardIssue[];
  open_questions: ScopeBoardIssue[];
}

export interface ScopeJiraFetchWarning {
  jql: string;
  truncated: boolean;
  count: number;
}

export interface ScopeBoardRecord {
  id: number;
  name: string;
  month: string;
  report_type?: "monthly" | "release";
  workload_mode?: ScopeWorkloadMode;
  capacity_sp: number;
  capacity_sp_dev?: number | null;
  capacity_sp_test?: number | null;
  plan_jql: string;
  unplan_jql: string;
  scope_sections: ScopeSectionConfig[] | null;
  previous_release_jql?: string;
  next_release_jql?: string;
  custom_release_name?: string;
  custom_release_jql?: string;
  release_queries?: ScopeReleaseQuery[];
  release_comment?: string;
  previous_release_comment?: string;
  next_release_comment?: string;
  custom_release_comment?: string;
  todo_jql: string;
  test_jql: string;
  snapshot: ScopeBoardSnapshot | null;
  ai_summary: ScopeAiSummary | null;
  ai_summary_history?: ScopeAiHistoryEntry[];
  layout_order?: string[];
  team_id: number | null;
  team: { id: number; slug?: string; name?: string } | null;
  created_by: number | null;
  created_by_username: string | null;
  created_by_display_name: string | null;
  created_at: string;
  updated_at: string;
}

export const cmsScopeApi = {
  list: (params: CmsListTeamParams = {}) => {
    const query = buildQuery(params as Record<string, ParamValue>, null);
    return cmsFetch<{ items: ScopeBoardRecord[] }>(`/scope-boards?${query}`);
  },
  get: (boardId: number) => cmsFetch<ScopeBoardRecord>(`/scope-boards/${boardId}`),
  create: (body: {
    name: string;
    month: string;
    capacity_sp: number;
    capacity_sp_dev?: number | null;
    capacity_sp_test?: number | null;
    workload_mode?: ScopeWorkloadMode;
    scope_sections: ScopeSectionConfig[];
    todo_jql?: string;
    test_jql?: string;
    previous_release_jql?: string;
    next_release_jql?: string;
    custom_release_name?: string;
    custom_release_jql?: string;
    release_queries?: ScopeReleaseQuery[];
    release_comment?: string;
    previous_release_comment?: string;
    next_release_comment?: string;
    custom_release_comment?: string;
    team_id?: number | null;
  }) =>
    cmsFetch<ScopeBoardRecord>("/scope-boards", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  update: (
    boardId: number,
    body: {
      name: string;
      month: string;
      capacity_sp: number;
      capacity_sp_dev?: number | null;
      capacity_sp_test?: number | null;
      workload_mode?: ScopeWorkloadMode;
      scope_sections: ScopeSectionConfig[];
      todo_jql?: string;
      test_jql?: string;
      previous_release_jql?: string;
      next_release_jql?: string;
      custom_release_name?: string;
      custom_release_jql?: string;
      release_queries?: ScopeReleaseQuery[];
      release_comment?: string;
      previous_release_comment?: string;
      next_release_comment?: string;
      custom_release_comment?: string;
    }
  ) =>
    cmsFetch<ScopeBoardRecord>(`/scope-boards/${boardId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  updateReleaseComments: (
    boardId: number,
    body: {
      release_comment?: string;
      previous_release_comment?: string;
      next_release_comment?: string;
      custom_release_comment?: string;
    }
  ) =>
    cmsFetch<ScopeBoardRecord>(`/scope-boards/${boardId}/release-comments`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  updateLayout: (boardId: number, layoutOrder: string[]) =>
    cmsFetch<ScopeBoardRecord>(`/scope-boards/${boardId}/layout`, {
      method: "PATCH",
      body: JSON.stringify({ layout_order: layoutOrder }),
    }),
  refresh: (boardId: number) =>
    cmsFetch<ScopeBoardRecord>(`/scope-boards/${boardId}/refresh`, {
      method: "POST",
    }),
  addIssueComment: (boardId: number, issueKey: string, text: string) =>
    cmsFetch<ScopeBoardRecord>(`/scope-boards/${boardId}/issues/${encodeURIComponent(issueKey)}/comment`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
  addQuestion: (boardId: number, text: string) =>
    cmsFetch<ScopeBoardRecord>(`/scope-boards/${boardId}/questions`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
  resolveQuestion: (boardId: number, questionId: string, comment: string) =>
    cmsFetch<ScopeBoardRecord>(`/scope-boards/${boardId}/questions/${encodeURIComponent(questionId)}/resolve`, {
      method: "POST",
      body: JSON.stringify({ comment }),
    }),
  addTopItem: (boardId: number, text: string) =>
    cmsFetch<ScopeBoardRecord>(`/scope-boards/${boardId}/top-items`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
  deleteTopItem: (boardId: number, itemId: string) =>
    cmsFetch<ScopeBoardRecord>(`/scope-boards/${boardId}/top-items/${encodeURIComponent(itemId)}`, {
      method: "DELETE",
    }),
  addTodoItem: (boardId: number, text: string) =>
    cmsFetch<ScopeBoardRecord>(`/scope-boards/${boardId}/todo-items`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
  updateTodoItem: (boardId: number, itemId: string, done: boolean) =>
    cmsFetch<ScopeBoardRecord>(`/scope-boards/${boardId}/todo-items/${encodeURIComponent(itemId)}`, {
      method: "PATCH",
      body: JSON.stringify({ done }),
    }),
  deleteTodoItem: (boardId: number, itemId: string) =>
    cmsFetch<ScopeBoardRecord>(`/scope-boards/${boardId}/todo-items/${encodeURIComponent(itemId)}`, {
      method: "DELETE",
    }),
  reorderQueue: (boardId: number, queue: ScopePriorityQueueKind, order: string[], comment: string, movedKey: string) =>
    cmsFetch<ScopeBoardRecord>(`/scope-boards/${boardId}/queues/${queue}/reorder`, {
      method: "POST",
      body: JSON.stringify({ order, comment, moved_key: movedKey }),
    }),
  addQueueIssueComment: (boardId: number, queue: ScopePriorityQueueKind, issueKey: string, text: string) =>
    cmsFetch<ScopeBoardRecord>(`/scope-boards/${boardId}/queues/${queue}/issues/${encodeURIComponent(issueKey)}/comment`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
  updateQueueIssueDueDate: (boardId: number, queue: ScopePriorityQueueKind, issueKey: string, dueDate: string) =>
    cmsFetch<ScopeBoardRecord>(`/scope-boards/${boardId}/queues/${queue}/issues/${encodeURIComponent(issueKey)}/due-date`, {
      method: "PUT",
      body: JSON.stringify({ due_date: dueDate }),
    }),
  analyze: (boardId: number, init?: { signal?: AbortSignal }) =>
    cmsFetch<{ ai_summary: ScopeAiSummary; board: ScopeBoardRecord }>(`/scope-boards/${boardId}/analyze`, {
      method: "POST",
      ...init,
    }),
  startAnalyze: (boardId: number) =>
    cmsFetch<ScopeAnalyzeStartResponse>(`/scope-boards/${boardId}/analyze?async=1`, {
      method: "POST",
    }),
  getAnalyzeJob: (boardId: number, jobId: string) =>
    cmsFetch<AiJobResponse<ScopeAiAnalyzeResult>>(
      `/scope-boards/${boardId}/analyze/jobs/${encodeURIComponent(jobId)}`
    ),
  delete: (boardId: number) =>
    cmsFetch<{ ok: boolean; id: number }>(`/scope-boards/${boardId}`, {
      method: "DELETE",
    }),
};

export interface RetroSectionConfig {
  section_id?: string;
  title: string;
}

export interface RetroConfig {
  sections: RetroSectionConfig[];
  votes_per_person: number;
  default_section_seconds: number;
}

export interface RetroRecord {
  id: number;
  title: string;
  status: "draft" | "live" | "done" | string;
  team_id: number | null;
  team: { id: number; slug?: string; name?: string } | null;
  config: RetroConfig;
  snapshot: Record<string, unknown> | null;
  ai_summary: RetroAiSummary | null;
  created_by: number | null;
  created_by_username: string | null;
  created_by_display_name: string | null;
  created_at: string;
  updated_at: string;
  /** Present only on the single-record GET — the current live projection. */
  live?: RetroLiveState | null;
}

export const cmsRetroApi = {
  list: (params: CmsListTeamParams = {}) => {
    const query = buildQuery(params as Record<string, ParamValue>, null);
    return cmsFetch<{ items: RetroRecord[] }>(`/retros?${query}`);
  },
  get: (retroId: number) => cmsFetch<RetroRecord>(`/retros/${retroId}`),
  create: (body: { title: string; config: RetroConfig; team_id?: number | null }) =>
    cmsFetch<RetroRecord>("/retros", { method: "POST", body: JSON.stringify(body) }),
  update: (retroId: number, body: { title: string; config: RetroConfig }) =>
    cmsFetch<RetroRecord>(`/retros/${retroId}`, { method: "PUT", body: JSON.stringify(body) }),
  delete: (retroId: number) =>
    cmsFetch<{ ok: boolean; id: number }>(`/retros/${retroId}`, { method: "DELETE" }),
  invite: (retroId: number) =>
    cmsFetch<{ token: string; url: string; state: RetroLiveState }>(`/retros/${retroId}/invite`, {
      method: "POST",
    }),
  openSection: (retroId: number, sectionId: string, seconds?: number | null) =>
    cmsFetch<RetroLiveState>(`/retros/${retroId}/open-section`, {
      method: "POST",
      body: JSON.stringify({ section_id: sectionId, seconds: seconds ?? null }),
    }),
  closeSection: (retroId: number) =>
    cmsFetch<RetroLiveState>(`/retros/${retroId}/close-section`, { method: "POST" }),
  setPhase: (retroId: number, target: "voting" | "discussing") =>
    cmsFetch<RetroLiveState>(`/retros/${retroId}/phase`, {
      method: "POST",
      body: JSON.stringify({ target }),
    }),
  createGroup: (retroId: number, body: { title: string; card_ids: string[] }) =>
    cmsFetch<RetroLiveState>(`/retros/${retroId}/groups`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  renameGroup: (retroId: number, groupId: string, body: { title: string }) =>
    cmsFetch<RetroLiveState>(`/retros/${retroId}/groups/${encodeURIComponent(groupId)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  ungroup: (retroId: number, groupId: string) =>
    cmsFetch<RetroLiveState>(`/retros/${retroId}/groups/${encodeURIComponent(groupId)}`, {
      method: "DELETE",
    }),
  addActionItem: (retroId: number, body: { text: string; assignee?: string | null }) =>
    cmsFetch<RetroLiveState>(`/retros/${retroId}/action-items`, {
      method: "POST",
      body: JSON.stringify({ text: body.text, assignee: body.assignee ?? null }),
    }),
  removeActionItem: (retroId: number, itemId: string) =>
    cmsFetch<RetroLiveState>(`/retros/${retroId}/action-items/${encodeURIComponent(itemId)}`, {
      method: "DELETE",
    }),
  finalize: (retroId: number) =>
    cmsFetch<RetroLiveState>(`/retros/${retroId}/finalize`, { method: "POST" }),
  analyze: (retroId: number) =>
    cmsFetch<{ ai_summary: RetroAiSummary }>(`/retros/${retroId}/analyze`, { method: "POST" }),
  startAnalyze: (retroId: number) =>
    cmsFetch<RetroAnalyzeStartResponse>(`/retros/${retroId}/analyze?async=1`, { method: "POST" }),
  getAnalyzeJob: (retroId: number, jobId: string) =>
    cmsFetch<AiJobResponse<RetroAiAnalyzeResult>>(
      `/retros/${retroId}/analyze/jobs/${encodeURIComponent(jobId)}`
    ),
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
