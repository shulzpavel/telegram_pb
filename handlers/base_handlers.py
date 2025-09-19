"""
Base handlers for common functionality
"""
import logging
from aiogram import types, Router
from aiogram.filters import Command

from core.bootstrap import bootstrap
from core.error_handler import safe_send_message, safe_handler
from services.group_config_service import GroupConfigService
from services.role_service import RoleService

logger = logging.getLogger(__name__)

router = Router()

# Инициализация сервисов
group_config_service = bootstrap.get_group_config_service()
role_service = bootstrap.get_role_service()


def is_allowed_chat(chat_id: int, topic_id: int) -> bool:
    """Проверить, разрешен ли чат"""
    logger.info(f"IS_ALLOWED_CHAT: Checking chat_id={chat_id}, topic_id={topic_id}")
    
    try:
        group_config = group_config_service.get_group_config(chat_id, topic_id)
        if group_config and group_config.is_active:
            logger.info(f"IS_ALLOWED_CHAT: Match found for {chat_id}_{topic_id}")
            return True
        else:
            logger.warning(f"IS_ALLOWED_CHAT: No active config found for {chat_id}_{topic_id}")
            return False
    except Exception as e:
        logger.error(f"IS_ALLOWED_CHAT: Error checking config: {e}")
        return False


def is_admin(user: types.User, chat_id: int, topic_id: int) -> bool:
    """Проверить, является ли пользователь админом"""
    # Сначала проверяем новую систему ролей
    if role_service.can_manage_session(user):
        return True
    
    # Fallback на старую систему для обратной совместимости
    return group_config_service.is_admin(chat_id, topic_id, user)


@router.message(Command("start", "help"))
@safe_handler
async def help_command(msg: types.Message):
    """Команда помощи"""
    if not is_allowed_chat(msg.chat.id, msg.message_thread_id or 0):
        return
    
    text = (
        "🤖 Привет! Я бот для планирования задач Planning Poker.\n\n"
        "📋 Основные команды:\n"
        "• `/join + токен` - присоединиться к сессии\n"
        "• `/menu` - показать главное меню\n"
        "• `/start` - показать это меню\n\n"
        "🎯 Функции:\n"
        "• 🆕 Создание списка задач\n"
        "• 📊 Голосование по задачам\n"
        "• 📈 Подсчет Story Points\n"
        "• 📋 Отчеты по сессиям\n"
        "• 📊 Итоги дня\n\n"
    )
    
    await safe_send_message(msg.answer, text, parse_mode="Markdown")
