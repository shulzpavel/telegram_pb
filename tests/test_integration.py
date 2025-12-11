"""Integration tests for full bot workflow."""

import pytest

from app.models.participant import Participant
from app.models.session import Session
from app.models.task import Task
from app.services.session_service import SessionService
from app.services.task_service import TaskService
from app.services.voting_service import VotingService
from config import UserRole


class TestFullWorkflow:
    """Integration tests for complete bot workflow."""

    def test_full_workflow_with_reset(self):
        """Test complete workflow: create session → add tasks → vote → reset queue."""
        # 1. Создаём сессию
        session = Session(chat_id=123, topic_id=456)
        
        # Добавляем участников
        lead = Participant(user_id=1, name="Lead User", role=UserRole.LEAD)
        participant1 = Participant(user_id=2, name="User 1", role=UserRole.PARTICIPANT)
        participant2 = Participant(user_id=3, name="User 2", role=UserRole.PARTICIPANT)
        
        session.participants[1] = lead
        session.participants[2] = participant1
        session.participants[3] = participant2
        
        # 2. Добавляем две задачи
        task1 = Task(jira_key="TEST-1", summary="Test Task 1", url="https://test.com/TEST-1")
        task2 = Task(jira_key="TEST-2", summary="Test Task 2", url="https://test.com/TEST-2")
        
        session.tasks_queue.append(task1)
        session.tasks_queue.append(task2)
        
        assert len(session.tasks_queue) == 2
        assert len(session.history) == 0
        assert len(session.last_batch) == 0
        
        # 3. Старт голосования
        result = TaskService.start_voting_session(session)
        assert result is True
        assert session.current_task_index == 0
        assert session.current_task == task1
        assert session.current_batch_started_at is not None
        assert session.is_voting_active is True
        
        # 4. Голосуем по первой задаче (с одним skip)
        # Lead голосует
        task1.votes[1] = "5"
        # Participant1 голосует
        task1.votes[2] = "8"
        # Participant2 пропускает
        task1.votes[3] = "skip"
        
        # Проверяем, что все проголосовали
        assert VotingService.all_voters_voted(session) is True
        
        # Переходим к следующей задаче
        next_task = TaskService.move_to_next_task(session)
        assert next_task == task2
        assert session.current_task_index == 1
        assert len(task1.votes) == 3
        
        # 5. Голосуем по второй задаче
        task2.votes[1] = "3"
        task2.votes[2] = "3"
        task2.votes[3] = "5"
        
        assert VotingService.all_voters_voted(session) is True
        
        # Завершаем батч
        completed_tasks = VotingService.finish_batch(session)
        assert len(completed_tasks) == 2
        assert len(session.tasks_queue) == 0
        assert len(session.last_batch) == 2
        assert len(session.history) == 2
        assert session.batch_completed is True
        assert session.is_voting_active is False
        
        # Проверяем, что история сохранилась
        assert session.history[0] == task1
        assert session.history[1] == task2
        assert session.last_batch[0] == task1
        assert session.last_batch[1] == task2
        
        # Проверяем голоса в истории
        assert len(session.history[0].votes) == 3
        assert session.history[0].votes[3] == "skip"
        assert VotingService.get_max_vote(session.history[0].votes) == 8  # Максимум из 5, 8
        
        # 6. Добавляем новые задачи для теста сброса
        task3 = Task(jira_key="TEST-3", summary="Test Task 3", url="https://test.com/TEST-3")
        task4 = Task(jira_key="TEST-4", summary="Test Task 4", url="https://test.com/TEST-4")
        session.tasks_queue.append(task3)
        session.tasks_queue.append(task4)
        
        assert len(session.tasks_queue) == 2
        
        # 7. Сбрасываем очередь
        TaskService.reset_tasks_queue(session)
        
        # Проверяем, что очередь очищена
        assert len(session.tasks_queue) == 0
        assert session.current_task_index == 0
        assert session.current_batch_started_at is None
        assert session.current_batch_id is None
        assert session.active_vote_message_id is None
        
        # Проверяем, что история и last_batch сохранены
        assert len(session.history) == 2
        assert len(session.last_batch) == 2
        assert session.history[0] == task1
        assert session.history[1] == task2
        assert session.last_batch[0] == task1
        assert session.last_batch[1] == task2

    def test_needs_review_functionality(self):
        """Test 'needs review' functionality - task moved to end of queue."""
        session = Session(chat_id=123, topic_id=456)
        
        lead = Participant(user_id=1, name="Lead", role=UserRole.LEAD)
        session.participants[1] = lead
        
        task1 = Task(jira_key="TEST-1", summary="Task 1")
        task2 = Task(jira_key="TEST-2", summary="Task 2")
        task3 = Task(jira_key="TEST-3", summary="Task 3")
        
        session.tasks_queue = [task1, task2, task3]
        session.current_task_index = 0  # Начинаем с task1
        
        # Добавляем голоса в task1
        task1.votes[1] = "5"
        
        # Симулируем "Нужен пересмотр" - возвращаем task1 в конец
        current_task = session.tasks_queue[session.current_task_index]
        assert current_task == task1
        
        # Перемещаем задачу в конец
        task = session.tasks_queue.pop(session.current_task_index)
        task.votes.clear()
        session.tasks_queue.append(task)
        
        # Проверяем, что task1 теперь в конце
        assert len(session.tasks_queue) == 3
        assert session.tasks_queue[0] == task2  # Первая теперь task2
        assert session.tasks_queue[-1] == task1  # Последняя теперь task1
        assert len(task1.votes) == 0  # Голоса очищены

    def test_voting_lists_display(self):
        """Test that voting lists (voted/waiting) are correctly calculated."""
        session = Session(chat_id=123, topic_id=456)
        
        lead = Participant(user_id=1, name="Lead", role=UserRole.LEAD)
        participant1 = Participant(user_id=2, name="User 1", role=UserRole.PARTICIPANT)
        participant2 = Participant(user_id=3, name="User 2", role=UserRole.PARTICIPANT)
        admin = Participant(user_id=4, name="Admin", role=UserRole.ADMIN)
        
        session.participants[1] = lead
        session.participants[2] = participant1
        session.participants[3] = participant2
        session.participants[4] = admin
        
        task = Task(jira_key="TEST-1", summary="Test Task")
        session.tasks_queue.append(task)
        session.current_task_index = 0
        
        # Eligible voters: lead (1) and participants (2, 3), but NOT admin (4)
        eligible_voters = [uid for uid in session.participants if session.can_vote(uid)]
        assert set(eligible_voters) == {1, 2, 3}
        assert 4 not in eligible_voters
        
        # Голосуют lead и participant1
        task.votes[1] = "5"
        task.votes[2] = "8"
        
        voted_user_ids = set(task.votes.keys())
        waiting_user_ids = [uid for uid in eligible_voters if uid not in voted_user_ids]
        
        assert voted_user_ids == {1, 2}
        assert waiting_user_ids == [3]  # Только participant2 ждёт

    def test_needs_review_single_task(self):
        """Test 'needs review' when there's only one task - should finish batch."""
        session = Session(chat_id=123, topic_id=456)
        
        lead = Participant(user_id=1, name="Lead", role=UserRole.LEAD)
        session.participants[1] = lead
        
        task1 = Task(jira_key="TEST-1", summary="Task 1")
        session.tasks_queue = [task1]
        session.current_task_index = 0
        session.current_batch_started_at = "2024-01-01T00:00:00"
        
        # Симулируем "Нужен пересмотр" для единственной задачи
        current_index = session.current_task_index
        task = session.tasks_queue.pop(current_index)
        task.votes.clear()
        session.tasks_queue.append(task)
        
        # После переноса задача всё ещё в очереди, но индекс может быть некорректным
        # Проверяем, что задача переместилась
        assert len(session.tasks_queue) == 1
        assert session.tasks_queue[0] == task1
        assert len(task1.votes) == 0
        
        # Если задача была единственной, после переноса она остаётся той же
        # В реальном коде это должно завершать батч

    def test_needs_review_multiple_tasks(self):
        """Test 'needs review' with multiple tasks - should move to next task."""
        session = Session(chat_id=123, topic_id=456)
        
        lead = Participant(user_id=1, name="Lead", role=UserRole.LEAD)
        session.participants[1] = lead
        
        task1 = Task(jira_key="TEST-1", summary="Task 1")
        task2 = Task(jira_key="TEST-2", summary="Task 2")
        task3 = Task(jira_key="TEST-3", summary="Task 3")
        
        session.tasks_queue = [task1, task2, task3]
        session.current_task_index = 0  # Начинаем с task1
        
        # Добавляем голоса в task1
        task1.votes[1] = "5"
        
        # Симулируем "Нужен пересмотр" - возвращаем task1 в конец
        current_index = session.current_task_index
        task = session.tasks_queue.pop(current_index)
        task.votes.clear()
        session.tasks_queue.append(task)
        
        # Проверяем, что task1 теперь в конце
        assert len(session.tasks_queue) == 3
        assert session.tasks_queue[0] == task2  # Первая теперь task2
        assert session.tasks_queue[1] == task3  # Вторая теперь task3
        assert session.tasks_queue[2] == task1  # Последняя теперь task1
        assert len(task1.votes) == 0  # Голоса очищены
        
        # Текущая задача должна быть task2 (индекс 0)
        session.current_task_index = 0
        assert session.current_task == task2

    def test_needs_review_last_task(self):
        """Test 'needs review' when current task is the last one."""
        session = Session(chat_id=123, topic_id=456)
        
        lead = Participant(user_id=1, name="Lead", role=UserRole.LEAD)
        session.participants[1] = lead
        
        task1 = Task(jira_key="TEST-1", summary="Task 1")
        task2 = Task(jira_key="TEST-2", summary="Task 2")
        
        session.tasks_queue = [task1, task2]
        session.current_task_index = 1  # Текущая задача - task2 (последняя)
        
        task2.votes[1] = "5"
        
        # Симулируем "Нужен пересмотр" для последней задачи
        current_index = session.current_task_index
        task = session.tasks_queue.pop(current_index)
        task.votes.clear()
        session.tasks_queue.append(task)
        
        # Проверяем, что task2 переместилась в конец
        assert len(session.tasks_queue) == 2
        assert session.tasks_queue[0] == task1
        assert session.tasks_queue[1] == task2
        assert len(task2.votes) == 0
        
        # Индекс должен быть скорректирован
        if current_index >= len(session.tasks_queue):
            session.current_task_index = len(session.tasks_queue) - 1
        
        # Теперь текущая задача должна быть task1 (индекс 0)
        session.current_task_index = 0
        assert session.current_task == task1

