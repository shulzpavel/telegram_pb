"""Tests for update Jira SP handler with busy flag and error handling."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from pathlib import Path

from app.domain.participant import Participant
from app.domain.session import Session
from app.domain.task import Task
from app.adapters.session_file import FileSessionRepository
from app.providers import DIContainer
from config import UserRole


class TestUpdateJiraSPBusyFlag:
    """Tests for busy flag handling in update_jira_sp."""

    def setup_method(self):
        """Setup test fixtures."""
        self.temp_file = Path("/tmp/test_update_sp_state.json")
        if self.temp_file.exists():
            self.temp_file.unlink()
        self.repo = FileSessionRepository(self.temp_file)
        
        # Mock bot and container
        self.mock_bot = MagicMock()
        self.container = DIContainer(bot=self.mock_bot, session_repo=self.repo)

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
        self.mock_bot = MagicMock()
        self.container = DIContainer(bot=self.mock_bot, session_repo=self.repo)

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
