"""Use cases for managing the live task queue."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from app.domain.session import Session
from app.domain.task import Task
from app.ports.session_repository import SessionRepository


class TaskQueueError(ValueError):
    """Raised when a task queue mutation is not allowed."""

    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code


@dataclass(frozen=True)
class TaskMutationResult:
    session: Session
    task: Optional[Task] = None
    tasks: tuple[Task, ...] = ()
    deleted_task: Optional[Task] = None


async def _get_session(repo: SessionRepository, chat_id: int, topic_id: Optional[int]) -> Session:
    if hasattr(repo, "get_session_async"):
        return await repo.get_session_async(chat_id, topic_id)  # type: ignore[attr-defined]
    return await repo.get_session(chat_id, topic_id)


async def _save_session(repo: SessionRepository, session: Session) -> None:
    if hasattr(repo, "save_session_async"):
        await repo.save_session_async(session)  # type: ignore[attr-defined]
        return
    await repo.save_session(session)


async def _mutate_session(
    repo: SessionRepository,
    chat_id: int,
    topic_id: Optional[int],
    mutator,
) -> TaskMutationResult:
    if hasattr(repo, "mutate_session"):
        _, result = await repo.mutate_session(chat_id, topic_id, mutator)
        return result
    session = await _get_session(repo, chat_id, topic_id)
    result = mutator(session)
    await _save_session(repo, session)
    return result


def _find_queue_index(session: Session, task_id: str) -> int:
    for index, task in enumerate(session.tasks_queue):
        if task.task_id == task_id:
            return index
    raise TaskQueueError("Task not found in active queue", status_code=404)


def _assert_version(session: Session, expected_version: Optional[int]) -> None:
    if expected_version is not None and expected_version != session.tasks_version:
        raise TaskQueueError("Task queue was changed. Refresh and try again.", status_code=409)


def _normalize_jira_key(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    normalized = value.strip().upper()
    return normalized or None


def _normalize_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


def _update_current_index_by_id(session: Session, current_task_id: Optional[str]) -> None:
    if not current_task_id:
        session.normalize_current_task_index()
        return
    for index, task in enumerate(session.tasks_queue):
        if task.task_id == current_task_id:
            session.current_task_index = index
            return
    session.normalize_current_task_index()


class AddManualTaskUseCase:
    def __init__(self, session_repo: SessionRepository):
        self.session_repo = session_repo

    async def execute(
        self,
        chat_id: int,
        topic_id: Optional[int],
        summary: str,
        jira_key: Optional[str] = None,
        url: Optional[str] = None,
        story_points: Optional[int] = None,
        expected_version: Optional[int] = None,
    ) -> TaskMutationResult:
        def mutate(session: Session) -> TaskMutationResult:
            _assert_version(session, expected_version)
            clean_summary = summary.strip()
            if not clean_summary:
                raise TaskQueueError("Task summary is required")

            task = Task(
                jira_key=_normalize_jira_key(jira_key),
                summary=clean_summary,
                url=_normalize_text(url),
                story_points=story_points,
                source="manual",
            )
            session.tasks_queue.append(task)
            session.batch_completed = False
            session.bump_tasks_version()
            return TaskMutationResult(session=session, task=task)

        return await _mutate_session(self.session_repo, chat_id, topic_id, mutate)


class AddManualTasksUseCase:
    def __init__(self, session_repo: SessionRepository):
        self.session_repo = session_repo

    async def execute(
        self,
        chat_id: int,
        topic_id: Optional[int],
        items: list[dict],
        expected_version: Optional[int] = None,
    ) -> TaskMutationResult:
        def mutate(session: Session) -> TaskMutationResult:
            _assert_version(session, expected_version)
            added: list[Task] = []
            for item in items:
                summary = str(item.get("summary") or "").strip()
                if not summary:
                    continue
                task = Task(
                    jira_key=_normalize_jira_key(item.get("jira_key")),
                    summary=summary,
                    url=_normalize_text(item.get("url")),
                    story_points=item.get("story_points"),
                    source="manual",
                )
                session.tasks_queue.append(task)
                added.append(task)

            if not added:
                raise TaskQueueError("At least one valid task is required")

            session.batch_completed = False
            session.bump_tasks_version()
            return TaskMutationResult(session=session, task=added[-1], tasks=tuple(added))

        return await _mutate_session(self.session_repo, chat_id, topic_id, mutate)


class UpdateTaskUseCase:
    def __init__(self, session_repo: SessionRepository):
        self.session_repo = session_repo

    async def execute(
        self,
        chat_id: int,
        topic_id: Optional[int],
        task_id: str,
        summary: str,
        jira_key: Optional[str] = None,
        url: Optional[str] = None,
        story_points: Optional[int] = None,
        expected_version: Optional[int] = None,
    ) -> TaskMutationResult:
        def mutate(session: Session) -> TaskMutationResult:
            _assert_version(session, expected_version)
            index = _find_queue_index(session, task_id)
            clean_summary = summary.strip()
            if not clean_summary:
                raise TaskQueueError("Task summary is required")

            task = session.tasks_queue[index]
            task.summary = clean_summary
            task.jira_key = _normalize_jira_key(jira_key)
            task.url = _normalize_text(url)
            task.story_points = story_points
            task.source = "jira" if task.jira_key and task.source != "manual" else task.source
            task.touch()
            session.bump_tasks_version()
            return TaskMutationResult(session=session, task=task)

        return await _mutate_session(self.session_repo, chat_id, topic_id, mutate)


class DeleteTaskUseCase:
    def __init__(self, session_repo: SessionRepository):
        self.session_repo = session_repo

    async def execute(
        self,
        chat_id: int,
        topic_id: Optional[int],
        task_id: str,
        expected_version: Optional[int] = None,
    ) -> TaskMutationResult:
        def mutate(session: Session) -> TaskMutationResult:
            _assert_version(session, expected_version)
            current_task_id = session.current_task_id
            index = _find_queue_index(session, task_id)
            if session.is_voting_active and task_id == current_task_id:
                raise TaskQueueError("Current active task cannot be deleted while voting is active", status_code=409)

            deleted = session.tasks_queue.pop(index)
            _update_current_index_by_id(session, current_task_id)
            session.bump_tasks_version()
            return TaskMutationResult(session=session, deleted_task=deleted)

        return await _mutate_session(self.session_repo, chat_id, topic_id, mutate)


class MoveTaskUseCase:
    def __init__(self, session_repo: SessionRepository):
        self.session_repo = session_repo

    async def execute(
        self,
        chat_id: int,
        topic_id: Optional[int],
        task_id: str,
        target_index: int,
        expected_version: Optional[int] = None,
    ) -> TaskMutationResult:
        def mutate(session: Session) -> TaskMutationResult:
            _assert_version(session, expected_version)
            current_task_id = session.current_task_id
            source_index = _find_queue_index(session, task_id)
            if session.is_voting_active and task_id == current_task_id:
                raise TaskQueueError("Current active task cannot be moved while voting is active", status_code=409)

            task = session.tasks_queue.pop(source_index)
            bounded_index = max(0, min(target_index, len(session.tasks_queue)))
            session.tasks_queue.insert(bounded_index, task)
            _update_current_index_by_id(session, current_task_id)
            session.bump_tasks_version()
            return TaskMutationResult(session=session, task=task)

        return await _mutate_session(self.session_repo, chat_id, topic_id, mutate)


class ReorderTasksUseCase:
    def __init__(self, session_repo: SessionRepository):
        self.session_repo = session_repo

    async def execute(
        self,
        chat_id: int,
        topic_id: Optional[int],
        ordered_task_ids: list[str],
        expected_version: Optional[int] = None,
    ) -> TaskMutationResult:
        def mutate(session: Session) -> TaskMutationResult:
            _assert_version(session, expected_version)
            current_task_id = session.current_task_id
            if len(ordered_task_ids) != len(session.tasks_queue):
                raise TaskQueueError("Reorder must include every active queue task")
            if len(set(ordered_task_ids)) != len(ordered_task_ids):
                raise TaskQueueError("Reorder contains duplicate task ids")

            task_by_id = {task.task_id: task for task in session.tasks_queue}
            missing = [task_id for task_id in ordered_task_ids if task_id not in task_by_id]
            if missing:
                raise TaskQueueError("Reorder contains unknown task ids", status_code=404)
            if session.is_voting_active and current_task_id:
                old_index = _find_queue_index(session, current_task_id)
                new_index = ordered_task_ids.index(current_task_id)
                if old_index != new_index:
                    raise TaskQueueError("Current active task cannot be moved while voting is active", status_code=409)

            session.tasks_queue = [task_by_id[task_id] for task_id in ordered_task_ids]
            _update_current_index_by_id(session, current_task_id)
            session.bump_tasks_version()
            return TaskMutationResult(session=session, tasks=tuple(session.tasks_queue))

        return await _mutate_session(self.session_repo, chat_id, topic_id, mutate)
