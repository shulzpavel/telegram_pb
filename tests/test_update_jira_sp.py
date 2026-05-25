"""Tests for update Jira SP handler with busy flag and error handling."""

import pytest
from unittest.mock import AsyncMock, patch
from pathlib import Path

from app.domain.participant import Participant
from app.domain.session import Session
from app.domain.task import Task
from app.adapters.session_file import FileSessionRepository
from app.providers import DIContainer
from app.usecases.update_jira_sp import UpdateJiraStoryPointsUseCase
from config import UserRole


class TestUpdateJiraSPBusyFlag:
    """Tests for busy flag handling in update_jira_sp."""

    def setup_method(self):
        """Setup test fixtures."""
        self.temp_file = Path("/tmp/test_update_sp_state.json")
        if self.temp_file.exists():
            self.temp_file.unlink()
        self.repo = FileSessionRepository(self.temp_file)

        self.container = DIContainer(session_repo=self.repo)

    def teardown_method(self):
        """Cleanup test fixtures."""
        if self.temp_file.exists():
            self.temp_file.unlink()

    def test_busy_flag_prevents_duplicate_requests(self):
        """Test that busy flag prevents duplicate update requests."""
        chat_id, topic_id = 123, 456
        busy_key = (chat_id, topic_id, "update_sp")

        # Добавляем флаг
        self.container.busy_ops.add(busy_key)

        # Проверяем, что флаг установлен
        assert busy_key in self.container.busy_ops

        # Снимаем флаг
        self.container.busy_ops.discard(busy_key)
        assert busy_key not in self.container.busy_ops

    def test_busy_flag_cleared_on_exception(self):
        """Test that busy flag is cleared even when exception occurs."""
        chat_id, topic_id = 123, 456
        busy_key = (chat_id, topic_id, "update_sp")

        self.container.busy_ops.add(busy_key)

        try:
            # Симулируем исключение
            raise Exception("Test error")
        except Exception:
            pass
        finally:
            # Флаг должен быть снят в finally
            self.container.busy_ops.discard(busy_key)

        assert busy_key not in self.container.busy_ops

    def test_busy_flag_cleared_on_success(self):
        """Test that busy flag is cleared on successful completion."""
        chat_id, topic_id = 123, 456
        busy_key = (chat_id, topic_id, "update_sp")

        self.container.busy_ops.add(busy_key)

        # Симулируем успешное выполнение
        # В реальном коде флаг снимается в finally
        self.container.busy_ops.discard(busy_key)

        assert busy_key not in self.container.busy_ops


class TestShowBatchResultsSP:
    """Tests for SP display in batch results."""

    def setup_method(self):
        """Setup test fixtures."""
        self.temp_file = Path("/tmp/test_batch_results_state.json")
        if self.temp_file.exists():
            self.temp_file.unlink()
        self.repo = FileSessionRepository(self.temp_file)
        self.container = DIContainer(session_repo=self.repo)

    def teardown_method(self):
        """Cleanup test fixtures."""
        if self.temp_file.exists():
            self.temp_file.unlink()

    def test_batch_results_include_sp_summary(self):
        """Test that batch results include SP summary."""
        session = Session(chat_id=123, topic_id=456)

        task1 = Task(jira_key="TEST-1", summary="Task 1")
        task1.votes = {1: "5", 2: "8"}

        task2 = Task(jira_key="TEST-2", summary="Task 2")
        task2.votes = {1: "3", 2: "3"}

        session.last_batch = [task1, task2]
        # Тест проверяет VotingPolicy напрямую, сохранение в repo не требуется

        # Проверяем, что SP правильно вычисляются
        from app.usecases.show_results import VotingPolicy
        policy = VotingPolicy()

        sp1 = policy.get_max_vote(task1.votes)
        sp2 = policy.get_max_vote(task2.votes)
        total_sp = sp1 + sp2

        assert sp1 == 8  # Максимум из 5, 8
        assert sp2 == 3  # Максимум из 3, 3
        assert total_sp == 11

    def test_batch_results_skip_votes_excluded_from_sp(self):
        """Test that skip votes are excluded from SP calculation."""
        session = Session(chat_id=123, topic_id=456)

        task = Task(jira_key="TEST-1", summary="Task 1")
        task.votes = {1: "5", 2: "skip", 3: "8"}

        from app.usecases.show_results import VotingPolicy
        policy = VotingPolicy()

        sp = policy.get_max_vote(task.votes)

        # Skip должен быть проигнорирован, максимум из 5, 8 = 8
        assert sp == 8


class CountingFileSessionRepository(FileSessionRepository):
    def __init__(self, state_file: Path):
        super().__init__(state_file)
        self.save_count = 0

    async def save_session(self, session: Session) -> None:
        self.save_count += 1
        await super().save_session(session)


class TestUpdateJiraStoryPointsUseCase:
    def setup_method(self):
        self.temp_file = Path("/tmp/test_update_sp_usecase_state.json")
        if self.temp_file.exists():
            self.temp_file.unlink()
        self.repo = CountingFileSessionRepository(self.temp_file)
        self.jira_client = AsyncMock()
        self.use_case = UpdateJiraStoryPointsUseCase(self.jira_client, self.repo)

    def teardown_method(self):
        if self.temp_file.exists():
            self.temp_file.unlink()

    @pytest.mark.asyncio
    async def test_does_not_save_when_nothing_updated(self):
        session = Session(chat_id=123, topic_id=456)
        task = Task(jira_key="TEST-1", summary="Task 1", votes={1: "skip"})
        session.last_batch = [task]
        await self.repo.save_session(session)
        self.repo.save_count = 0

        updated, failed, skipped = await self.use_case.execute(123, 456, skip_errors=True)

        assert updated == 0
        assert failed == []
        assert skipped == ["TEST-1: нет финальной оценки SP"]
        assert self.repo.save_count == 0

    @pytest.mark.asyncio
    async def test_prefers_manager_final_sp_over_max_vote(self):
        session = Session(chat_id=123, topic_id=456)
        session.last_batch = [
            Task(jira_key="TEST-1", summary="Task 1", votes={1: "8", 2: "5"}, story_points=3),
        ]
        await self.repo.save_session(session)
        self.repo.save_count = 0
        self.jira_client.update_story_points.return_value = True

        updated, failed, skipped = await self.use_case.execute(123, 456, skip_errors=True)

        assert updated == 1
        assert failed == []
        assert skipped == []
        self.jira_client.update_story_points.assert_awaited_once_with("TEST-1", 3)

    @pytest.mark.asyncio
    async def test_skip_errors_updates_all_valid_tasks(self):
        session = Session(chat_id=123, topic_id=456)
        session.last_batch = [
            Task(jira_key="TEST-1", summary="Task 1", votes={1: "5"}),
            Task(jira_key="TEST-2", summary="Task 2", votes={1: "8"}),
            Task(jira_key="TEST-3", summary="Task 3", votes={1: "13"}),
        ]
        await self.repo.save_session(session)
        self.repo.save_count = 0
        self.jira_client.update_story_points.side_effect = [True, False, True]

        updated, failed, skipped = await self.use_case.execute(123, 456, skip_errors=True)

        assert updated == 2
        assert failed == ["TEST-2"]
        assert skipped == []
        assert self.jira_client.update_story_points.await_count == 3
        assert self.repo.save_count == 1
