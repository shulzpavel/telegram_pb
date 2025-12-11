"""Task management service."""

from typing import Dict, List, Optional, Set

from datetime import datetime

from app.models.session import Session
from app.models.task import Task
from jira_service import jira_service


class TaskService:
    """Service for managing tasks."""

    @staticmethod
    def prepare_task_from_jira(issue: Dict) -> Task:
        """Create Task from Jira issue."""
        summary = issue.get("summary") or issue.get("key", "")
        url = issue.get("url")
        return Task(
            jira_key=issue.get("key"),
            summary=summary,
            url=url,
            story_points=issue.get("story_points"),
        )

    @staticmethod
    async def add_tasks_from_jira(session: Session, jql: str) -> tuple[List[Task], List[str]]:
        """Add tasks from Jira query to session."""
        from jira_service import jira_service
        jira_issues = await jira_service.parse_jira_request(jql)
        if not jira_issues:
            return [], []

        existing_keys: Set[str] = set()
        for task in session.tasks_queue:
            if task.jira_key:
                existing_keys.add(task.jira_key)
        for task in session.last_batch:
            if task.jira_key:
                existing_keys.add(task.jira_key)

        added: List[Task] = []
        skipped: List[str] = []

        for issue in jira_issues:
            jira_key = issue.get("key")
            if not jira_key:
                continue
            if jira_key in existing_keys:
                skipped.append(jira_key)
                continue

            task = TaskService.prepare_task_from_jira(issue)
            session.tasks_queue.append(task)
            existing_keys.add(jira_key)
            added.append(task)

        return added, skipped

    @staticmethod
    def start_voting_session(session: Session) -> bool:
        """Start voting session for tasks."""
        if not session.tasks_queue:
            return False
        session.current_task_index = 0
        session.batch_completed = False
        session.current_batch_started_at = datetime.utcnow().isoformat()
        if session.current_task:
            session.current_task.votes.clear()
        return True

    @staticmethod
    def move_to_next_task(session: Session) -> Optional[Task]:
        """Move to next task in queue."""
        session.current_task_index += 1
        if session.current_task:
            session.current_task.votes.clear()
        return session.current_task

    @staticmethod
    def reset_tasks_queue(session: Session) -> None:
        """Reset tasks queue and all related voting state.
        
        Note: history and last_batch are preserved as per requirements.
        """
        # Очищаем голоса текущей задачи явно (если есть)
        if session.current_task:
            session.current_task.votes.clear()
        # Очищаем очередь задач
        session.tasks_queue.clear()
        # Сбрасываем индекс текущей задачи
        session.current_task_index = 0
        # Сбрасываем состояние голосования
        session.batch_completed = False
        session.current_batch_started_at = None
        session.current_batch_id = None
        session.active_vote_message_id = None
        # Примечание: last_batch и history НЕ очищаются, чтобы сохранить историю
