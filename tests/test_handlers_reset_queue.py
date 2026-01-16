"""Tests for reset queue handlers (access control and behavior)."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.models.participant import Participant
from app.models.session import Session
from app.models.task import Task
from app.services.task_service import TaskService
from config import UserRole


class TestResetQueueAccess:
    """Tests for reset queue access control."""

    def test_reset_tasks_queue_preserves_history_and_last_batch(self):
        """Test that reset_tasks_queue preserves history and last_batch."""
        session = Session(chat_id=123, topic_id=456)
        task1 = Task(summary="Task 1")
        task2 = Task(summary="Task 2")
        task3 = Task(summary="Task 3")
        session.tasks_queue = [task1, task2]
        session.history = [task3]  # Предыдущие задачи в истории
        session.last_batch = [task3]  # Последний батч
        
        TaskService.reset_tasks_queue(session)
        
        # История и last_batch должны сохраниться
        assert len(session.history) == 1
        assert len(session.last_batch) == 1
        assert session.history[0] == task3
        assert session.last_batch[0] == task3
        # Очередь очищена
        assert len(session.tasks_queue) == 0

    def test_reset_tasks_queue_only_manage_roles(self):
        """Test that only manage roles (LEAD, ADMIN) can reset queue."""
        session = Session(chat_id=123, topic_id=456)
        lead = Participant(user_id=1, name="Lead", role=UserRole.LEAD)
        admin = Participant(user_id=2, name="Admin", role=UserRole.ADMIN)
        participant = Participant(user_id=3, name="User", role=UserRole.PARTICIPANT)
        
        session.participants[1] = lead
        session.participants[2] = admin
        session.participants[3] = participant
        
        # Только лид и админ могут управлять
        assert session.can_manage(1) is True  # LEAD
        assert session.can_manage(2) is True  # ADMIN
        assert session.can_manage(3) is False  # PARTICIPANT

    def test_reset_tasks_queue_clears_all_state_fields(self):
        """Test that reset_tasks_queue clears all voting state fields."""
        session = Session(chat_id=123, topic_id=456)
        task = Task(summary="Test")
        session.tasks_queue = [task]
        session.current_task_index = 1
        session.batch_completed = True
        session.current_batch_started_at = "2024-01-01T00:00:00"
        session.current_batch_id = "batch-123"
        session.active_vote_message_id = 999
        
        TaskService.reset_tasks_queue(session)
        
        assert len(session.tasks_queue) == 0
        assert session.current_task_index == 0
        assert session.batch_completed is False
        assert session.current_batch_started_at is None
        assert session.current_batch_id is None
        assert session.active_vote_message_id is None

    def test_reset_tasks_queue_during_active_voting(self):
        """Test resetting queue during active voting."""
        session = Session(chat_id=123, topic_id=456)
        task1 = Task(summary="Task 1")
        task2 = Task(summary="Task 2")
        session.tasks_queue = [task1, task2]
        session.current_task_index = 0
        session.current_batch_started_at = "2024-01-01T00:00:00"
        session.active_vote_message_id = 12345
        task1.votes = {1: "5", 2: "8"}
        
        # Проверяем, что голосование активно
        assert session.is_voting_active is True
        
        TaskService.reset_tasks_queue(session)
        
        # Голосование должно быть остановлено
        assert session.is_voting_active is False
        assert len(session.tasks_queue) == 0
        assert task1.votes == {}  # Голоса очищены
        assert session.active_vote_message_id is None

    def test_reset_tasks_queue_empty_queue(self):
        """Test resetting already empty queue."""
        session = Session(chat_id=123, topic_id=456)
        session.tasks_queue = []
        session.current_task_index = 0
        
        # Должно работать без ошибок
        TaskService.reset_tasks_queue(session)
        
        assert len(session.tasks_queue) == 0
        assert session.current_task_index == 0
        assert session.current_batch_started_at is None




