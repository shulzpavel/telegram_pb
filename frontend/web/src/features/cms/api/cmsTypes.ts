export type TabKey =
  | "overview"
  | "sessions"
  | "users"
  | "votes"
  | "tokens"
  | "web"
  | "events"
  | "access"
  | "planner"
  | "retro";

export type ThemeMode = "dark" | "light" | "system";

export interface CmsRoleRef {
  id: number;
  key: string;
  name: string;
  is_system: boolean;
}

export interface CmsPageAccess {
  key: string;
  label: string;
  path: string;
  permission_key: string;
  sort_order: number;
  is_enabled?: boolean;
}

export interface CmsPrincipal {
  id: number;
  username: string;
  display_name: string | null;
  is_superuser: boolean;
  permissions: string[];
  roles: CmsRoleRef[];
  pages: CmsPageAccess[];
  theme_preference?: ThemeMode;
}

export interface CmsPermission {
  key: string;
  label: string;
  description: string;
}

export interface CmsRole {
  id: number;
  key: string;
  name: string;
  description: string;
  is_system: boolean;
  created_at: string;
  updated_at: string;
  permission_keys: string[];
}

export interface CmsAdmin {
  id: number;
  username: string;
  display_name: string | null;
  is_active: boolean;
  is_superuser: boolean;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
  roles: CmsRoleRef[];
}

export interface Overview {
  total_sessions: number;
  active_sessions: number;
  total_votes: number;
  total_tasks: number;
  total_users: number;
  web_users: number;
  active_web_tokens: number;
  total_web_tokens: number;
  votes_rows: number;
}

export interface SessionItem {
  id: number;
  session_key: string;
  title: string | null;
  chat_id: number;
  topic_id: number | null;
  current_task_id: string | null;
  tasks_version: number;
  participants_count: number;
  tasks_queue_count: number;
  history_count: number;
  last_batch_count: number;
  total_tasks: number;
  total_votes: number;
  batch_completed: boolean;
  is_active: boolean;
  current_batch_id: string | null;
  current_batch_started_at: string | null;
  updated_at: string;
}

export interface SessionDetail extends SessionItem {
  raw: Record<string, unknown>;
}

export interface ParticipantItem {
  session_id: number;
  user_id: number;
  name: string;
  role: string;
  source: string;
  first_seen_at: string;
  last_seen_at: string;
}

export interface TaskItem {
  id: number;
  session_id: number;
  task_uid: string;
  bucket: string;
  bucket_index: number;
  jira_key: string | null;
  summary: string;
  url: string | null;
  story_points: number | null;
  source: "jira" | "manual" | string;
  votes_count: number;
  numeric_avg: number | null;
  numeric_max: number | null;
  completed_at: string | null;
  jql?: string | null;
  created_at_text?: string | null;
  domain_updated_at?: string | null;
  updated_at: string;
}

export interface JiraPreviewItem {
  key: string;
  summary: string;
  url: string | null;
  story_points: number | null;
  duplicate: boolean;
}

export interface JiraPreview {
  items: JiraPreviewItem[];
  total: number;
  importable: number;
  skipped_keys: string[];
}

export interface UserItem {
  /** Stringified int64 — safe for web participants with negative stable ids. */
  user_id: string;
  name: string;
  role: string;
  is_web: boolean;
  first_seen_at: string;
  last_seen_at: string;
}

export interface VoteItem {
  id: number;
  task_id: number;
  session_id: number;
  user_id: number;
  value: string;
  numeric_value: number | null;
  created_at: string;
  user_name: string | null;
  user_role: string | null;
  jira_key: string | null;
  summary: string;
  bucket: string;
  chat_id: number;
  topic_id: number | null;
  session_key: string;
}

export interface TokenItem {
  id: number;
  token_prefix: string;
  token_hash: string;
  chat_id: number;
  topic_id: number | null;
  session_key: string;
  participants_joined: number;
  created_at: string;
  expires_at: string;
  last_seen_at: string;
  is_active: boolean;
}

export interface WebParticipantItem {
  id: number;
  token_hash: string;
  participant_id: string;
  user_id: number;
  name: string;
  role: string;
  chat_id: number;
  topic_id: number | null;
  joined_at: string;
  expires_at: string;
  is_active: boolean;
}

export interface AuditEvent {
  id: number;
  ts: string;
  action: string;
  actor: string | null;
  status: string;
  ip: string | null;
  payload: Record<string, unknown>;
}
