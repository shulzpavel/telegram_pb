"""
Тесты для core модулей
"""
import pytest
from unittest.mock import Mock

from core.container import Container
from core.exceptions import ValidationError, AuthorizationError
from core.validators import TaskTextValidator, VoteValueValidator, ChatIdValidator
from core.factories import TaskFactory, ParticipantFactory


class TestContainer:
    """Тесты для DI Container"""
    
    def test_container_registration(self):
        """Тест регистрации сервисов"""
        container = Container()
        
        # Регистрация singleton
        class TestService:
            pass
        
        container.register_singleton(TestService, TestService)
        service = container.get(TestService)
        assert isinstance(service, TestService)
        
        # Проверка, что возвращается тот же экземпляр
        service2 = container.get(TestService)
        assert service is service2
    
    def test_container_factory(self):
        """Тест регистрации фабрики"""
        container = Container()
        
        class TestService:
            def __init__(self):
                self.created = True
        
        container.register_factory(TestService, lambda: TestService())
        service = container.get(TestService)
        assert isinstance(service, TestService)
        assert service.created
    
    def test_container_instance(self):
        """Тест регистрации экземпляра"""
        container = Container()
        
        class TestService:
            pass
        
        instance = TestService()
        container.register_instance(TestService, instance)
        service = container.get(TestService)
        assert service is instance
    
    def test_container_error(self):
        """Тест ошибки при получении незарегистрированного сервиса"""
        container = Container()
        
        class TestService:
            pass
        
        with pytest.raises(ValueError):
            container.get(TestService)


class TestValidators:
    """Тесты для валидаторов"""
    
    def test_task_text_validator(self):
        """Тест валидатора текста задачи"""
        # Валидный текст
        validator = TaskTextValidator(text="Test task")
        assert validator.text == "Test task"
        
        # Пустой текст
        with pytest.raises(ValueError):
            TaskTextValidator(text="")
        
        # Слишком длинный текст
        with pytest.raises(ValueError):
            TaskTextValidator(text="x" * 1001)
    
    def test_vote_value_validator(self):
        """Тест валидатора значения голоса"""
        # Валидные значения
        assert VoteValueValidator(value="1").value == "1"
        assert VoteValueValidator(value="5").value == "5"
        assert VoteValueValidator(value="?").value == "?"
        
        # Невалидные значения
        with pytest.raises(ValueError):
            VoteValueValidator(value="abc")
    
    def test_chat_id_validator(self):
        """Тест валидатора chat_id"""
        # Валидный chat_id
        validator = ChatIdValidator(chat_id=-1001234567890)
        assert validator.chat_id == -1001234567890
        
        # Невалидный chat_id
        with pytest.raises(ValueError):
            ChatIdValidator(chat_id=1234567890)


class TestFactories:
    """Тесты для фабрик"""
    
    def test_task_factory(self):
        """Тест фабрики задач"""
        # Создание из текста
        task = TaskFactory.from_text("Test task", 0)
        assert task.text.value == "Test task"
        assert task.index == 0
        
        # Создание из списка
        tasks = TaskFactory.from_list(["Task 1", "Task 2"])
        assert len(tasks) == 2
        assert tasks[0].text.value == "Task 1"
        assert tasks[1].text.value == "Task 2"
    
    def test_participant_factory(self):
        """Тест фабрики участников"""
        # Создание из Telegram user
        mock_user = Mock()
        mock_user.id = 123
        mock_user.username = "testuser"
        mock_user.full_name = "Test User"
        
        participant = ParticipantFactory.from_telegram_user(mock_user)
        assert participant.user_id.value == 123
        assert participant.username.value == "testuser"
        assert participant.full_name.value == "Test User"
        assert not participant.is_admin()
        
        # Создание админа
        admin = ParticipantFactory.from_telegram_user(mock_user, is_admin=True)
        assert admin.is_admin()
    
    def test_factory_validation_error(self):
        """Тест ошибок валидации в фабриках"""
        # Невалидный текст задачи
        with pytest.raises(ValidationError):
            TaskFactory.from_text("", 0)
        
        # Невалидные данные участника
        with pytest.raises(ValidationError):
            ParticipantFactory.from_dict({
                "user_id": -1,  # Невалидный user_id
                "username": "test",
                "full_name": "Test User"
            })


class TestExceptions:
    """Тесты для исключений"""
    
    def test_validation_error(self):
        """Тест ValidationError"""
        error = ValidationError("Invalid data", "VALIDATION_ERROR")
        assert error.message == "Invalid data"
        assert error.error_code == "VALIDATION_ERROR"
        assert str(error) == "Invalid data"
    
    def test_authorization_error(self):
        """Тест AuthorizationError"""
        error = AuthorizationError("Access denied")
        assert error.message == "Access denied"
        assert error.error_code is None
        assert str(error) == "Access denied"
