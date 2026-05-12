import type { Page } from "../../../shared/types/pagination";
import type { JiraPreview, TaskItem } from "../../cms/api/cmsTypes";
import type { WebSessionState } from "../../../hooks/useSession";

export interface ManagerSession {
  chat_id: number;
  topic_id: number | null;
  title: string;
  token: string | null;
  invite_url: string | null;
  tasks_version: number;
  tasks_queue_count: number;
  current_task_id: string | null;
  state: WebSessionState;
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
