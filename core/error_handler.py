"""
Centralized error handling system
"""
import logging
import traceback
from typing import Callable, Any, Optional
from functools import wraps
from aiogram import types
from aiogram.exceptions import TelegramAPIError, TelegramRetryAfter

from core.exceptions import (
    PokerBotException, ValidationError, AuthorizationError,
    SessionNotFoundError, ParticipantNotFoundError, TaskNotFoundError,
    InvalidVoteError, VotingNotActiveError, FileParseError,
    StorageError, ConfigurationError, TimerError, MessageError
)

logger = logging.getLogger(__name__)


class ErrorHandler:
    """Centralized error handler"""
    
    def __init__(self):
        self.error_messages = {
            ValidationError: "❌ Ошибка валидации данных",
            AuthorizationError: "❌ Недостаточно прав для выполнения действия",
            SessionNotFoundError: "❌ Сессия не найдена",
            ParticipantNotFoundError: "❌ Участник не найден",
            TaskNotFoundError: "❌ Задача не найдена",
            InvalidVoteError: "❌ Неверное значение голоса",
            VotingNotActiveError: "❌ Голосование не активно",
            FileParseError: "❌ Ошибка при обработке файла",
            StorageError: "❌ Ошибка сохранения данных",
            ConfigurationError: "❌ Ошибка конфигурации",
            TimerError: "❌ Ошибка таймера",
            MessageError: "❌ Ошибка отправки сообщения"
        }
    
    def get_user_message(self, error: Exception) -> str:
        """Get user-friendly error message"""
        if isinstance(error, PokerBotException):
            return self.error_messages.get(type(error), f"❌ {error.message}")
        
        # Handle Telegram API errors
        if isinstance(error, TelegramRetryAfter):
            return f"⏳ Слишком много запросов. Попробуйте через {error.retry_after} секунд"
        
        if isinstance(error, TelegramAPIError):
            return "❌ Ошибка Telegram API"
        
        # Generic error
        return "❌ Произошла неожиданная ошибка"
    
    def log_error(self, error: Exception, context: Optional[str] = None) -> None:
        """Log error with context"""
        error_type = type(error).__name__
        error_msg = str(error)
        
        if context:
            logger.error(f"{context}: {error_type} - {error_msg}")
        else:
            logger.error(f"{error_type}: {error_msg}")
        
        # Log traceback for unexpected errors
        if not isinstance(error, PokerBotException):
            logger.error(f"Traceback: {traceback.format_exc()}")


# Global error handler instance
error_handler = ErrorHandler()


def safe_handler(func: Callable) -> Callable:
    """Decorator for safe handler execution"""
    @wraps(func)
    async def wrapper(*args, **kwargs):
        try:
            return await func(*args, **kwargs)
        except Exception as e:
            error_handler.log_error(e, f"Handler {func.__name__}")
            
            # Try to send error message to user
            try:
                # Find message or callback in args
                message = None
                for arg in args:
                    if isinstance(arg, (types.Message, types.CallbackQuery)):
                        message = arg
                        break
                
                if message:
                    error_msg = error_handler.get_user_message(e)
                    if isinstance(message, types.Message):
                        await message.answer(error_msg)
                    elif isinstance(message, types.CallbackQuery):
                        await message.answer(error_msg, show_alert=True)
            except Exception as send_error:
                logger.error(f"Failed to send error message: {send_error}")
    
    return wrapper


def safe_send_message(message_func: Callable, text: str, **kwargs) -> Optional[types.Message]:
    """Safely send message with error handling"""
    try:
        return message_func(text, **kwargs)
    except TelegramRetryAfter as e:
        logger.warning(f"Rate limited: {e.retry_after}s")
        return None
    except TelegramAPIError as e:
        logger.error(f"Telegram API error: {e}")
        return None
    except Exception as e:
        error_handler.log_error(e, "safe_send_message")
        return None


def safe_answer_callback(callback: types.CallbackQuery, text: str, show_alert: bool = False) -> None:
    """Safely answer callback with error handling"""
    try:
        callback.answer(text, show_alert=show_alert)
    except TelegramRetryAfter as e:
        logger.warning(f"Rate limited: {e.retry_after}s")
    except TelegramAPIError as e:
        logger.error(f"Telegram API error: {e}")
    except Exception as e:
        error_handler.log_error(e, "safe_answer_callback")


def safe_edit_message(bot, chat_id: int, message_id: int, text: str, **kwargs) -> bool:
    """Safely edit message with error handling"""
    try:
        bot.edit_message_text(chat_id=chat_id, message_id=message_id, text=text, **kwargs)
        return True
    except TelegramRetryAfter as e:
        logger.warning(f"Rate limited: {e.retry_after}s")
        return False
    except TelegramAPIError as e:
        logger.error(f"Telegram API error: {e}")
        return False
    except Exception as e:
        error_handler.log_error(e, "safe_edit_message")
        return False


class ErrorContext:
    """Context manager for error handling"""
    
    def __init__(self, operation: str):
        self.operation = operation
        self.start_time = None
    
    def __enter__(self):
        self.start_time = __import__('time').time()
        logger.debug(f"Starting operation: {self.operation}")
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type is not None:
            error_handler.log_error(exc_val, self.operation)
            return False  # Don't suppress the exception
        
        if self.start_time:
            duration = __import__('time').time() - self.start_time
            logger.debug(f"Completed operation {self.operation} in {duration:.2f}s")


def with_error_context(operation: str):
    """Decorator to add error context"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            with ErrorContext(operation):
                return await func(*args, **kwargs)
        return wrapper
    return decorator
