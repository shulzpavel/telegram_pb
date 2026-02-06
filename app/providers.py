"""Dependency injection container."""

import asyncio
from pathlib import Path
from typing import Optional, Dict, Tuple

from aiogram import Bot

from app.adapters.jira_service_client import JiraServiceHttpClient
from app.adapters.voting_service_client import VotingServiceHttpClient
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
    POSTGRES_DSN,
    JIRA_SERVICE_URL,
    VOTING_SERVICE_URL,
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
        # Always use HTTP clients to microservices
        if jira_client is None:
            if not JIRA_SERVICE_URL:
                raise ValueError("JIRA_SERVICE_URL must be set for microservices mode")
            self._jira_client = JiraServiceHttpClient(base_url=JIRA_SERVICE_URL)
        else:
            self._jira_client = jira_client

        if session_repo is None:
            if not VOTING_SERVICE_URL:
                raise ValueError("VOTING_SERVICE_URL must be set for microservices mode")
            self._session_repo = VotingServiceHttpClient(base_url=VOTING_SERVICE_URL)
        else:
            self._session_repo = session_repo

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

    async def acquire_busy(self, key: Tuple) -> asyncio.Lock:
        """Acquire busy lock for key. Returns lock object."""
        if key not in self._busy_locks:
            self._busy_locks[key] = asyncio.Lock()
        return self._busy_locks[key]

    def release_busy(self, key: Tuple) -> None:
        """Release busy flag for key."""
        self.busy_ops.discard(key)

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
        # Close Jira client (both direct and HTTP service client have close method)
        if hasattr(self._jira_client, "close"):
            await self._jira_client.close()
        # Close session repo if it has close method (HTTP client does)
        if hasattr(self._session_repo, "close"):
            await self._session_repo.close()
        # Close metrics
        if hasattr(self._metrics, "close"):
            await self._metrics.close()
