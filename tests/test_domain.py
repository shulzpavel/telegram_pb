"""
Тесты для доменной модели
"""
import pytest
from datetime import datetime

from domain.value_objects import ChatId, TopicId, UserId, TaskText, VoteValue, Username, FullName
from domain.entities import DomainSession, DomainParticipant, DomainTask, DomainVote
from domain.enums import SessionStatus, VoteResult, TaskStatus, ParticipantRole


class TestValueObjects:
    """Тесты для Value Objects"""
    
    def test_chat_id_validation(self):
        """Тест валидации ChatId"""
        # Валидный chat_id (отрицательный)
        chat_id = ChatId(-1001234567890)
        assert chat_id.value == -1001234567890
        
        # Невалидный chat_id (положительный)
        with pytest.raises(ValueError):
            ChatId(1234567890)
    
    def test_topic_id_validation(self):
        """Тест валидации TopicId"""
        # Валидный topic_id
        topic_id = TopicId(123)
        assert topic_id.value == 123
        
        # Невалидный topic_id (отрицательный)
        with pytest.raises(ValueError):
            TopicId(-1)
    
    def test_user_id_validation(self):
        """Тест валидации UserId"""
        # Валидный user_id
        user_id = UserId(123456)
        assert user_id.value == 123456
        
        # Невалидный user_id (отрицательный)
        with pytest.raises(ValueError):
            UserId(-1)
    
    def test_task_text_validation(self):
        """Тест валидации TaskText"""
        # Валидный текст
        task_text = TaskText("Test task")
        assert task_text.value == "Test task"
        
        # Пустой текст
        with pytest.raises(ValueError):
            TaskText("")
        
        # Слишком длинный текст
        with pytest.raises(ValueError):
            TaskText("x" * 1001)
    
    def test_vote_value_validation(self):
        """Тест валидации VoteValue"""
        # Валидные значения
        assert VoteValue("1").value == "1"
        assert VoteValue("5").value == "5"
        assert VoteValue("13").value == "13"
        assert VoteValue("?").value == "?"
        assert VoteValue("∞").value == "∞"
        
        # Невалидные значения
        with pytest.raises(ValueError):
            VoteValue("abc")
        
        with pytest.raises(ValueError):
            VoteValue("")


class TestDomainEntities:
    """Тесты для доменных сущностей"""
    
    def test_domain_participant(self):
        """Тест DomainParticipant"""
        participant = DomainParticipant(
            user_id=UserId(123),
            username=Username("testuser"),
            full_name=FullName("Test User"),
            role=ParticipantRole.PARTICIPANT
        )
        
        assert participant.user_id.value == 123
        assert participant.username.value == "testuser"
        assert participant.full_name.value == "Test User"
        assert not participant.is_admin()
        assert not participant.is_super_admin()
        
        # Тест админа
        admin = DomainParticipant(
            user_id=UserId(456),
            username=Username("admin"),
            full_name=FullName("Admin User"),
            role=ParticipantRole.ADMIN
        )
        
        assert admin.is_admin()
        assert not admin.is_super_admin()
    
    def test_domain_vote(self):
        """Тест DomainVote"""
        vote = DomainVote(
            user_id=UserId(123),
            value=VoteValue("5"),
            timestamp=datetime.now()
        )
        
        assert vote.user_id.value == 123
        assert vote.value.value == "5"
        assert isinstance(vote.timestamp, datetime)
    
    def test_domain_task(self):
        """Тест DomainTask"""
        task = DomainTask(
            text=TaskText("Test task"),
            index=0
        )
        
        assert task.text.value == "Test task"
        assert task.index == 0
        assert task.result == VoteResult.PENDING
        assert task.status == TaskStatus.PENDING
        assert not task.is_completed()
        
        # Добавление голоса
        vote = DomainVote(
            user_id=UserId(123),
            value=VoteValue("5"),
            timestamp=datetime.now()
        )
        
        task.add_vote(vote)
        assert len(task.votes) == 1
        assert task.status == TaskStatus.IN_PROGRESS
        
        # Тест максимального голоса
        max_vote = task.get_max_vote()
        assert max_vote.value == "5"
    
    def test_domain_session(self):
        """Тест DomainSession"""
        session = DomainSession(
            chat_id=ChatId(-1001234567890),
            topic_id=TopicId(123)
        )
        
        assert session.chat_id.value == -1001234567890
        assert session.topic_id.value == 123
        assert session.status == SessionStatus.IDLE
        assert session.current_task_index == 0
        assert not session.is_voting_active
        
        # Добавление участника
        participant = DomainParticipant(
            user_id=UserId(123),
            username=Username("testuser"),
            full_name=FullName("Test User")
        )
        
        session.add_participant(participant)
        assert len(session.participants) == 1
        
        # Добавление задачи
        task = DomainTask(
            text=TaskText("Test task"),
            index=0
        )
        session.tasks = [task]
        
        assert session.current_task == task
        
        # Тест голосования
        success = session.add_vote(UserId(123), VoteValue("5"))
        assert success
        assert len(session.current_task.votes) == 1
        
        # Тест завершения задачи
        success = session.complete_current_task()
        assert success
        assert session.current_task_index == 1
        assert len(session.history) == 1
