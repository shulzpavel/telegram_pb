"""
Enhanced input validation system
"""
import re
import logging
from typing import List, Dict, Any, Optional, Tuple, Union
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger(__name__)


class ValidationLevel(Enum):
    """Validation severity levels"""
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


@dataclass
class ValidationResult:
    """Validation result with detailed information"""
    is_valid: bool
    level: ValidationLevel
    message: str
    field: str
    suggestion: Optional[str] = None
    code: Optional[str] = None


class InputValidator:
    """Enhanced input validator with comprehensive checks"""
    
    def __init__(self):
        self.patterns = {
            'username': r'^[a-zA-Z0-9_]{1,32}$',
            'email': r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$',
            'token': r'^[a-zA-Z0-9_-]{8,50}$',
            'jira_key': r'^[A-Z][A-Z0-9]+-\d+$',
            'story_points': r'^\d+(\.\d+)?$',
            'chat_id': r'^-?\d+$',
            'topic_id': r'^\d+$',
            'user_id': r'^\d+$'
        }
        
        self.limits = {
            'username': {'min': 1, 'max': 32},
            'email': {'min': 5, 'max': 254},
            'token': {'min': 8, 'max': 50},
            'task_text': {'min': 3, 'max': 1000},
            'comment': {'min': 1, 'max': 500},
            'scale_value': {'min': 1, 'max': 1000}
        }
    
    def validate_username(self, username: str) -> ValidationResult:
        """Validate username with comprehensive checks"""
        if not username or not username.strip():
            return ValidationResult(
                is_valid=False,
                level=ValidationLevel.ERROR,
                message="Имя пользователя не может быть пустым",
                field="username",
                code="EMPTY_USERNAME"
            )
        
        clean_username = username.lstrip('@').strip()
        
        # Length check
        if len(clean_username) < self.limits['username']['min']:
            return ValidationResult(
                is_valid=False,
                level=ValidationLevel.ERROR,
                message=f"Имя пользователя слишком короткое (минимум {self.limits['username']['min']} символов)",
                field="username",
                code="USERNAME_TOO_SHORT"
            )
        
        if len(clean_username) > self.limits['username']['max']:
            return ValidationResult(
                is_valid=False,
                level=ValidationLevel.ERROR,
                message=f"Имя пользователя слишком длинное (максимум {self.limits['username']['max']} символов)",
                field="username",
                code="USERNAME_TOO_LONG"
            )
        
        # Pattern check
        if not re.match(self.patterns['username'], clean_username):
            return ValidationResult(
                is_valid=False,
                level=ValidationLevel.ERROR,
                message="Имя пользователя содержит недопустимые символы",
                field="username",
                suggestion="Используйте только буквы, цифры и подчеркивания",
                code="INVALID_USERNAME_CHARS"
            )
        
        # Reserved names check
        reserved_names = ['admin', 'bot', 'system', 'root', 'null', 'undefined']
        if clean_username.lower() in reserved_names:
            return ValidationResult(
                is_valid=False,
                level=ValidationLevel.WARNING,
                message="Имя пользователя зарезервировано",
                field="username",
                suggestion="Выберите другое имя",
                code="RESERVED_USERNAME"
            )
        
        return ValidationResult(
            is_valid=True,
            level=ValidationLevel.INFO,
            message="Имя пользователя корректно",
            field="username"
        )
    
    def validate_email(self, email: str) -> ValidationResult:
        """Validate email address"""
        if not email or not email.strip():
            return ValidationResult(
                is_valid=False,
                level=ValidationLevel.ERROR,
                message="Email не может быть пустым",
                field="email",
                code="EMPTY_EMAIL"
            )
        
        email = email.strip().lower()
        
        # Length check
        if len(email) < self.limits['email']['min'] or len(email) > self.limits['email']['max']:
            return ValidationResult(
                is_valid=False,
                level=ValidationLevel.ERROR,
                message=f"Email должен быть от {self.limits['email']['min']} до {self.limits['email']['max']} символов",
                field="email",
                code="INVALID_EMAIL_LENGTH"
            )
        
        # Pattern check
        if not re.match(self.patterns['email'], email):
            return ValidationResult(
                is_valid=False,
                level=ValidationLevel.ERROR,
                message="Неверный формат email",
                field="email",
                suggestion="Используйте формат: user@domain.com",
                code="INVALID_EMAIL_FORMAT"
            )
        
        return ValidationResult(
            is_valid=True,
            level=ValidationLevel.INFO,
            message="Email корректный",
            field="email"
        )
    
    def validate_token(self, token: str) -> ValidationResult:
        """Validate access token"""
        if not token or not token.strip():
            return ValidationResult(
                is_valid=False,
                level=ValidationLevel.ERROR,
                message="Токен не может быть пустым",
                field="token",
                code="EMPTY_TOKEN"
            )
        
        token = token.strip()
        
        # Length check
        if len(token) < self.limits['token']['min']:
            return ValidationResult(
                is_valid=False,
                level=ValidationLevel.ERROR,
                message=f"Токен слишком короткий (минимум {self.limits['token']['min']} символов)",
                field="token",
                code="TOKEN_TOO_SHORT"
            )
        
        if len(token) > self.limits['token']['max']:
            return ValidationResult(
                is_valid=False,
                level=ValidationLevel.ERROR,
                message=f"Токен слишком длинный (максимум {self.limits['token']['max']} символов)",
                field="token",
                code="TOKEN_TOO_LONG"
            )
        
        # Pattern check
        if not re.match(self.patterns['token'], token):
            return ValidationResult(
                is_valid=False,
                level=ValidationLevel.ERROR,
                message="Токен содержит недопустимые символы",
                field="token",
                suggestion="Используйте только буквы, цифры, дефисы и подчеркивания",
                code="INVALID_TOKEN_CHARS"
            )
        
        # Security checks
        if token.lower() in ['password', '123456', 'admin', 'test', 'demo']:
            return ValidationResult(
                is_valid=False,
                level=ValidationLevel.WARNING,
                message="Токен слишком простой",
                field="token",
                suggestion="Используйте более сложный токен",
                code="WEAK_TOKEN"
            )
        
        return ValidationResult(
            is_valid=True,
            level=ValidationLevel.INFO,
            message="Токен корректный",
            field="token"
        )
    
    def validate_task_text(self, text: str) -> ValidationResult:
        """Validate task text with comprehensive checks"""
        if not text or not text.strip():
            return ValidationResult(
                is_valid=False,
                level=ValidationLevel.ERROR,
                message="Текст задачи не может быть пустым",
                field="task_text",
                code="EMPTY_TASK_TEXT"
            )
        
        text = text.strip()
        
        # Length check
        if len(text) < self.limits['task_text']['min']:
            return ValidationResult(
                is_valid=False,
                level=ValidationLevel.ERROR,
                message=f"Текст задачи слишком короткий (минимум {self.limits['task_text']['min']} символов)",
                field="task_text",
                code="TASK_TEXT_TOO_SHORT"
            )
        
        if len(text) > self.limits['task_text']['max']:
            return ValidationResult(
                is_valid=False,
                level=ValidationLevel.ERROR,
                message=f"Текст задачи слишком длинный (максимум {self.limits['task_text']['max']} символов)",
                field="task_text",
                code="TASK_TEXT_TOO_LONG"
            )
        
        # Content quality checks
        if text.lower() in ['test', 'тест', 'test task', 'тестовая задача']:
            return ValidationResult(
                is_valid=True,
                level=ValidationLevel.WARNING,
                message="Обнаружен тестовый текст",
                field="task_text",
                suggestion="Убедитесь, что это реальная задача",
                code="TEST_TASK_DETECTED"
            )
        
        # Check for spam patterns
        spam_patterns = [
            r'(.)\1{4,}',  # Repeated characters
            r'[!@#$%^&*()]{3,}',  # Too many special characters
            r'\b(click|here|now|free|win|prize)\b',  # Spam keywords
        ]
        
        for pattern in spam_patterns:
            if re.search(pattern, text, re.IGNORECASE):
                return ValidationResult(
                    is_valid=False,
                    level=ValidationLevel.WARNING,
                    message="Текст содержит подозрительные элементы",
                    field="task_text",
                    suggestion="Проверьте корректность текста задачи",
                    code="SPAM_DETECTED"
                )
        
        return ValidationResult(
            is_valid=True,
            level=ValidationLevel.INFO,
            message="Текст задачи корректный",
            field="task_text"
        )
    
    def validate_vote_value(self, value: str, scale: List[str]) -> ValidationResult:
        """Validate vote value against scale"""
        if not value or not value.strip():
            return ValidationResult(
                is_valid=False,
                level=ValidationLevel.ERROR,
                message="Значение голоса не может быть пустым",
                field="vote_value",
                code="EMPTY_VOTE_VALUE"
            )
        
        value = value.strip()
        
        # Check if value is in scale
        if value in scale:
            return ValidationResult(
                is_valid=True,
                level=ValidationLevel.INFO,
                message="Голос корректен",
                field="vote_value"
            )
        
        # Check special values
        special_values = ['?', '∞', 'coffee', 'break', 'pass', 'skip']
        if value.lower() in [v.lower() for v in special_values]:
            return ValidationResult(
                is_valid=True,
                level=ValidationLevel.INFO,
                message="Специальное значение голоса",
                field="vote_value"
            )
        
        # Check numeric values
        try:
            num_value = float(value)
            if 0 <= num_value <= self.limits['scale_value']['max']:
                return ValidationResult(
                    is_valid=True,
                    level=ValidationLevel.INFO,
                    message="Числовое значение голоса",
                    field="vote_value"
                )
        except ValueError:
            pass
        
        return ValidationResult(
            is_valid=False,
            level=ValidationLevel.ERROR,
            message=f"Неверное значение голоса: {value}",
            field="vote_value",
            suggestion=f"Используйте значения из шкалы: {', '.join(scale)}",
            code="INVALID_VOTE_VALUE"
        )
    
    def validate_scale(self, scale: List[str]) -> ValidationResult:
        """Validate voting scale"""
        if not scale or len(scale) < 2:
            return ValidationResult(
                is_valid=False,
                level=ValidationLevel.ERROR,
                message="Шкала должна содержать минимум 2 значения",
                field="scale",
                code="INVALID_SCALE_LENGTH"
            )
        
        if len(scale) > 20:
            return ValidationResult(
                is_valid=False,
                level=ValidationLevel.ERROR,
                message="Шкала слишком длинная (максимум 20 значений)",
                field="scale",
                code="SCALE_TOO_LONG"
            )
        
        # Validate each value
        for i, value in enumerate(scale):
            if not value or not value.strip():
                return ValidationResult(
                    is_valid=False,
                    level=ValidationLevel.ERROR,
                    message=f"Значение {i+1} в шкале не может быть пустым",
                    field="scale",
                    code="EMPTY_SCALE_VALUE"
                )
            
            # Check for duplicates
            if scale.count(value) > 1:
                return ValidationResult(
                    is_valid=False,
                    level=ValidationLevel.WARNING,
                    message=f"Дублирующееся значение в шкале: {value}",
                    field="scale",
                    suggestion="Удалите дубликаты",
                    code="DUPLICATE_SCALE_VALUE"
                )
        
        return ValidationResult(
            is_valid=True,
            level=ValidationLevel.INFO,
            message="Шкала корректна",
            field="scale"
        )
    
    def validate_timeout(self, timeout: Union[int, str]) -> ValidationResult:
        """Validate timeout value"""
        try:
            if isinstance(timeout, str):
                timeout = int(timeout)
        except (ValueError, TypeError):
            return ValidationResult(
                is_valid=False,
                level=ValidationLevel.ERROR,
                message="Таймаут должен быть числом",
                field="timeout",
                code="INVALID_TIMEOUT_TYPE"
            )
        
        if timeout < 10:
            return ValidationResult(
                is_valid=False,
                level=ValidationLevel.ERROR,
                message="Таймаут слишком короткий (минимум 10 секунд)",
                field="timeout",
                code="TIMEOUT_TOO_SHORT"
            )
        
        if timeout > 3600:
            return ValidationResult(
                is_valid=False,
                level=ValidationLevel.ERROR,
                message="Таймаут слишком длинный (максимум 3600 секунд)",
                field="timeout",
                code="TIMEOUT_TOO_LONG"
            )
        
        return ValidationResult(
            is_valid=True,
            level=ValidationLevel.INFO,
            message="Таймаут корректен",
            field="timeout"
        )
    
    def validate_chat_id(self, chat_id: Union[int, str]) -> ValidationResult:
        """Validate chat ID"""
        try:
            if isinstance(chat_id, str):
                chat_id = int(chat_id)
        except (ValueError, TypeError):
            return ValidationResult(
                is_valid=False,
                level=ValidationLevel.ERROR,
                message="ID чата должен быть числом",
                field="chat_id",
                code="INVALID_CHAT_ID_TYPE"
            )
        
        if chat_id >= 0:
            return ValidationResult(
                is_valid=False,
                level=ValidationLevel.ERROR,
                message="ID чата должен быть отрицательным для групп",
                field="chat_id",
                code="INVALID_CHAT_ID_VALUE"
            )
        
        return ValidationResult(
            is_valid=True,
            level=ValidationLevel.INFO,
            message="ID чата корректен",
            field="chat_id"
        )
    
    def validate_user_id(self, user_id: Union[int, str]) -> ValidationResult:
        """Validate user ID"""
        try:
            if isinstance(user_id, str):
                user_id = int(user_id)
        except (ValueError, TypeError):
            return ValidationResult(
                is_valid=False,
                level=ValidationLevel.ERROR,
                message="ID пользователя должен быть числом",
                field="user_id",
                code="INVALID_USER_ID_TYPE"
            )
        
        if user_id <= 0:
            return ValidationResult(
                is_valid=False,
                level=ValidationLevel.ERROR,
                message="ID пользователя должен быть положительным",
                field="user_id",
                code="INVALID_USER_ID_VALUE"
            )
        
        return ValidationResult(
            is_valid=True,
            level=ValidationLevel.INFO,
            message="ID пользователя корректен",
            field="user_id"
        )
    
    def validate_jira_key(self, jira_key: str) -> ValidationResult:
        """Validate Jira issue key"""
        if not jira_key or not jira_key.strip():
            return ValidationResult(
                is_valid=False,
                level=ValidationLevel.ERROR,
                message="Ключ Jira не может быть пустым",
                field="jira_key",
                code="EMPTY_JIRA_KEY"
            )
        
        jira_key = jira_key.strip().upper()
        
        if not re.match(self.patterns['jira_key'], jira_key):
            return ValidationResult(
                is_valid=False,
                level=ValidationLevel.ERROR,
                message="Неверный формат ключа Jira",
                field="jira_key",
                suggestion="Используйте формат: PROJECT-123",
                code="INVALID_JIRA_KEY_FORMAT"
            )
        
        return ValidationResult(
            is_valid=True,
            level=ValidationLevel.INFO,
            message="Ключ Jira корректен",
            field="jira_key"
        )
    
    def validate_story_points(self, story_points: Union[int, str, float]) -> ValidationResult:
        """Validate story points value"""
        try:
            if isinstance(story_points, str):
                story_points = float(story_points)
        except (ValueError, TypeError):
            return ValidationResult(
                is_valid=False,
                level=ValidationLevel.ERROR,
                message="Story Points должны быть числом",
                field="story_points",
                code="INVALID_STORY_POINTS_TYPE"
            )
        
        if story_points < 0:
            return ValidationResult(
                is_valid=False,
                level=ValidationLevel.ERROR,
                message="Story Points не могут быть отрицательными",
                field="story_points",
                code="NEGATIVE_STORY_POINTS"
            )
        
        if story_points > 1000:
            return ValidationResult(
                is_valid=False,
                level=ValidationLevel.WARNING,
                message="Story Points слишком большие",
                field="story_points",
                suggestion="Проверьте корректность значения",
                code="LARGE_STORY_POINTS"
            )
        
        return ValidationResult(
            is_valid=True,
            level=ValidationLevel.INFO,
            message="Story Points корректны",
            field="story_points"
        )
    
    def validate_batch_input(self, data: Dict[str, Any]) -> List[ValidationResult]:
        """Validate batch input data"""
        results = []
        
        # Validate required fields
        required_fields = ['chat_id', 'topic_id', 'user_id']
        for field in required_fields:
            if field not in data:
                results.append(ValidationResult(
                    is_valid=False,
                    level=ValidationLevel.ERROR,
                    message=f"Обязательное поле {field} отсутствует",
                    field=field,
                    code="MISSING_REQUIRED_FIELD"
                ))
        
        # Validate each field if present
        if 'chat_id' in data:
            results.append(self.validate_chat_id(data['chat_id']))
        
        if 'topic_id' in data:
            results.append(self.validate_user_id(data['topic_id']))  # topic_id is similar to user_id
        
        if 'user_id' in data:
            results.append(self.validate_user_id(data['user_id']))
        
        if 'username' in data:
            results.append(self.validate_username(data['username']))
        
        if 'email' in data:
            results.append(self.validate_email(data['email']))
        
        if 'token' in data:
            results.append(self.validate_token(data['token']))
        
        if 'task_text' in data:
            results.append(self.validate_task_text(data['task_text']))
        
        if 'vote_value' in data and 'scale' in data:
            results.append(self.validate_vote_value(data['vote_value'], data['scale']))
        
        if 'timeout' in data:
            results.append(self.validate_timeout(data['timeout']))
        
        return results


# Global validator instance
input_validator = InputValidator()
