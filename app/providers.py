"""Dependency injection container."""

import asyncio
from pathlib import Path
from typing import Optional, Dict, Tuple

from aiogram import Bot

from app.adapters.jira_http import JiraHttpClient
from app.adapters.session_file import FileSessionRepository
from app.adapters.metrics_null import NullMetricsRepository
from app.adapters.telegram_notifier import TelegramNotifier
from app.ports.jira_client import JiraClient
from app.ports.notifier import Notifier
from app.ports.session_repository import SessionRepository
from app.ports.metrics_repository import MetricsRepository
from app.usecases.add_tasks import AddTasksFromJiraUseCase
from app.usecases.cast_vote import CastVoteUseCase
from app.usecases.finish_batch import FinishBatchUseCase
from app.usecases.join_session import JoinSessionUseCase
from app.usecases.leave_session import LeaveSessionUseCase
from app.usecases.reset_queue import ResetQueueUseCase
from app.usecases.show_results import ShowResultsUseCase
from app.usecases.start_batch import StartBatchUseCase
from app.usecases.update_jira_sp import UpdateJiraStoryPointsUseCase
from config import (
    JIRA_API_TOKEN,
    JIRA_URL,
    JIRA_USERNAME,
    STATE_FILE,
    STORY_POINTS_FIELD,
    POSTGRES_DSN,
)


class DIContainer:
    """Dependency injection container."""

    def __init__(
        self,
        bot: Bot,
        jira_client: Optional[JiraClient] = None,
        session_repo: Optional[SessionRepository] = None,
        notifier: Optional[Notifier] = None,
        metrics_repo: Optional[MetricsRepository] = None,
    ):
        # Adapters
        self._jira_client = jira_client or JiraHttpClient(
            base_url=JIRA_URL,
            username=JIRA_USERNAME,
            api_token=JIRA_API_TOKEN,
            story_points_field=STORY_POINTS_FIELD,
        )
        self._session_repo = session_repo or FileSessionRepository(STATE_FILE)
        self._notifier = notifier or TelegramNotifier(bot)

        if metrics_repo is not None:
            self._metrics = metrics_repo
        else:
            if POSTGRES_DSN:
                try:
                    # Lazy import to avoid dependency error when asyncpg is absent
                    from app.adapters.metrics_postgres import PostgresMetricsRepository  # type: ignore

                    self._metrics = PostgresMetricsRepository(POSTGRES_DSN)
                except Exception as exc:  # ImportError or asyncpg missing
                    print(f"[Metrics] asyncpg not available or import failed ({exc!r}), using NullMetricsRepository")
                    self._metrics = NullMetricsRepository()
            else:
                self._metrics = NullMetricsRepository()

        # In-memory flags/locks for long operations (e.g., JQL, update_sp) to avoid duplicate presses
        self.busy_ops: set[Tuple] = set()
        self._busy_locks: Dict[Tuple, asyncio.Lock] = {}

        # Use cases
        self.add_tasks = AddTasksFromJiraUseCase(self._jira_client, self._session_repo)
        self.start_batch = StartBatchUseCase(self._session_repo)
        self.cast_vote = CastVoteUseCase(self._session_repo)
        self.finish_batch = FinishBatchUseCase(self._session_repo)
        self.show_results = ShowResultsUseCase(self._session_repo)
        self.join_session = JoinSessionUseCase(self._session_repo)
        self.leave_session = LeaveSessionUseCase(self._session_repo)
        self.reset_queue = ResetQueueUseCase(self._session_repo)
        self.update_jira_sp = UpdateJiraStoryPointsUseCase(self._jira_client, self._session_repo)

    @property
    def jira_client(self) -> JiraClient:
        """Get Jira client."""
        return self._jira_client

    @property
    def session_repo(self) -> SessionRepository:
        """Get session repository."""
        return self._session_repo

    @property
    def notifier(self) -> Notifier:
        """Get notifier."""
        return self._notifier

    @property
    def metrics(self) -> MetricsRepository:
        """Get metrics repository."""
        return self._metrics

    async def cleanup(self) -> None:
        """Cleanup resources."""
        if isinstance(self._jira_client, JiraHttpClient):
            await self._jira_client.close()
        if hasattr(self._metrics, "close"):
            await self._metrics.close()
