import { arrayMove } from "@dnd-kit/sortable";
import type { TaskItem } from "../api/cmsTypes";

export function canUseFullReorder({
  bucket,
  hasMore,
  search,
  tasks,
  queueCount,
}: {
  bucket: string;
  hasMore: boolean;
  search: string;
  tasks: TaskItem[];
  queueCount: number;
}): boolean {
  return (
    bucket === "tasks_queue" &&
    !hasMore &&
    search.trim() === "" &&
    tasks.length === queueCount &&
    tasks.every((task) => task.bucket === "tasks_queue" && Boolean(task.task_uid))
  );
}

export function reorderedTaskIds(tasks: TaskItem[], activeId: string, overId: string): string[] {
  const oldIndex = tasks.findIndex((task) => task.task_uid === activeId);
  const newIndex = tasks.findIndex((task) => task.task_uid === overId);
  if (oldIndex < 0 || newIndex < 0) {
    return tasks.map((task) => task.task_uid);
  }
  return arrayMove(tasks, oldIndex, newIndex).map((task) => task.task_uid);
}
