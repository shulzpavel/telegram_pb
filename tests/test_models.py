"""
Тесты для моделей данных
"""
import pytest
from datetime import datetime
from models import Session, Participant, Task, Vote, VoteResult, GroupConfig


class TestParticipant:
    """Тесты для модели Participant"""
    
    def test_participant_creation(self):
        """Тест создания участника"""
        participant = Participant(
            user_id=123,
            username="testuser",
            full_name="Test User",
            is_admin=False
        )
        
        assert participant.user_id == 123
        assert participant.username == "testuser"
        assert participant.full_name == "Test User"
        assert participant.is_admin is False

    def test_participant_admin(self):
        """Тест создания админа"""
        admin = Participant(
            user_id=456,
            username="admin",
            full_name="Admin User",
            is_admin=True
        )
        
        assert admin.is_admin is True


class TestTask:
    """Тесты для модели Task"""
    
    def test_task_creation(self):
        """Тест создания задачи"""
        task = Task(
            text="Test task",
            index=0
        )
        
        assert task.text == "Test task"
        assert task.index == 0
        assert task.result == VoteResult.PENDING
        assert len(task.votes) == 0
        assert task.deadline is None

    def test_task_with_votes(self):
        """Тест задачи с голосами"""
        task = Task(text="Test task", index=0)
        
        vote1 = Vote(user_id=1, value="5", timestamp=datetime.now())
        vote2 = Vote(user_id=2, value="8", timestamp=datetime.now())
        
        task.votes[1] = vote1
        task.votes[2] = vote2
        
        assert len(task.votes) == 2
        assert task.votes[1].value == "5"
        assert task.votes[2].value == "8"


class TestSession:
    """Тесты для модели Session"""
    
    def test_session_creation(self):
        """Тест создания сессии"""
        session = Session(chat_id=123, topic_id=456)
        
        assert session.chat_id == 123
        assert session.topic_id == 456
        assert len(session.participants) == 0
        assert len(session.tasks) == 0
        assert session.current_task_index == 0
        assert session.batch_completed is False
        assert session.is_voting_active is False

    def test_add_participant(self):
        """Тест добавления участника"""
        session = Session(chat_id=123, topic_id=456)
        participant = Participant(
            user_id=789,
            username="testuser",
            full_name="Test User"
        )
        
        session.add_participant(participant)
        
        assert len(session.participants) == 1
        assert 789 in session.participants
        assert session.participants[789].username == "testuser"

    def test_remove_participant(self):
        """Тест удаления участника"""
        session = Session(chat_id=123, topic_id=456)
        participant = Participant(
            user_id=789,
            username="testuser",
            full_name="Test User"
        )
        
        session.add_participant(participant)
        removed = session.remove_participant(789)
        
        assert len(session.participants) == 0
        assert removed is not None
        assert removed.username == "testuser"

    def test_remove_nonexistent_participant(self):
        """Тест удаления несуществующего участника"""
        session = Session(chat_id=123, topic_id=456)
        removed = session.remove_participant(999)
        
        assert removed is None

    def test_add_vote(self):
        """Тест добавления голоса"""
        session = Session(chat_id=123, topic_id=456)
        
        # Добавляем участника
        participant = Participant(
            user_id=789,
            username="testuser",
            full_name="Test User"
        )
        session.add_participant(participant)
        
        # Добавляем задачу
        task = Task(text="Test task", index=0)
        session.tasks.append(task)
        session.current_task_index = 0
        
        # Добавляем голос
        success = session.add_vote(789, "5")
        
        assert success is True
        assert len(session.current_task.votes) == 1
        assert session.current_task.votes[789].value == "5"

    def test_add_vote_no_participant(self):
        """Тест добавления голоса несуществующим участником"""
        session = Session(chat_id=123, topic_id=456)
        
        task = Task(text="Test task", index=0)
        session.tasks.append(task)
        session.current_task_index = 0
        
        success = session.add_vote(999, "5")
        
        assert success is False
        assert len(session.current_task.votes) == 0

    def test_add_vote_no_task(self):
        """Тест добавления голоса без активной задачи"""
        session = Session(chat_id=123, topic_id=456)
        
        participant = Participant(
            user_id=789,
            username="testuser",
            full_name="Test User"
        )
        session.add_participant(participant)
        
        success = session.add_vote(789, "5")
        
        assert success is False

    def test_is_all_voted(self):
        """Тест проверки, все ли проголосовали"""
        session = Session(chat_id=123, topic_id=456)
        
        # Добавляем участников
        participant1 = Participant(user_id=1, username="user1", full_name="User 1")
        participant2 = Participant(user_id=2, username="user2", full_name="User 2")
        session.add_participant(participant1)
        session.add_participant(participant2)
        
        # Добавляем задачу
        task = Task(text="Test task", index=0)
        session.tasks.append(task)
        session.current_task_index = 0
        
        # Никто не голосовал
        assert session.is_all_voted() is False
        
        # Один проголосовал
        session.add_vote(1, "5")
        assert session.is_all_voted() is False
        
        # Все проголосовали
        session.add_vote(2, "8")
        assert session.is_all_voted() is True

    def test_get_not_voted_participants(self):
        """Тест получения не проголосовавших участников"""
        session = Session(chat_id=123, topic_id=456)
        
        # Добавляем участников
        participant1 = Participant(user_id=1, username="user1", full_name="User 1")
        participant2 = Participant(user_id=2, username="user2", full_name="User 2")
        session.add_participant(participant1)
        session.add_participant(participant2)
        
        # Добавляем задачу
        task = Task(text="Test task", index=0)
        session.tasks.append(task)
        session.current_task_index = 0
        
        # Никто не голосовал
        not_voted = session.get_not_voted_participants()
        assert len(not_voted) == 2
        
        # Один проголосовал
        session.add_vote(1, "5")
        not_voted = session.get_not_voted_participants()
        assert len(not_voted) == 1
        assert not_voted[0].user_id == 2

    def test_current_task_property(self):
        """Тест свойства current_task"""
        session = Session(chat_id=123, topic_id=456)
        
        # Нет задач
        assert session.current_task is None
        
        # Добавляем задачи
        task1 = Task(text="Task 1", index=0)
        task2 = Task(text="Task 2", index=1)
        session.tasks = [task1, task2]
        
        # Первая задача
        session.current_task_index = 0
        assert session.current_task is not None
        assert session.current_task.text == "Task 1"
        
        # Вторая задача
        session.current_task_index = 1
        assert session.current_task is not None
        assert session.current_task.text == "Task 2"
        
        # Неверный индекс
        session.current_task_index = 2
        assert session.current_task is None


class TestGroupConfig:
    """Тесты для модели GroupConfig"""
    
    def test_group_config_creation(self):
        """Тест создания конфигурации группы"""
        config = GroupConfig(
            chat_id=123,
            topic_id=456,
            admins=["@admin1", "@admin2"]
        )
        
        assert config.chat_id == 123
        assert config.topic_id == 456
        assert config.admins == ["@admin1", "@admin2"]
        assert config.timeout == 90
        assert config.scale == ['1', '2', '3', '5', '8', '13']
        assert config.is_active is True

    def test_group_config_custom_settings(self):
        """Тест создания конфигурации с кастомными настройками"""
        config = GroupConfig(
            chat_id=123,
            topic_id=456,
            admins=["@admin1"],
            timeout=120,
            scale=['1', '2', '3', '5', '8', '13', '21'],
            is_active=False
        )
        
        assert config.timeout == 120
        assert config.scale == ['1', '2', '3', '5', '8', '13', '21']
        assert config.is_active is False
