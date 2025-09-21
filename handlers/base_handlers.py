"""
Base handlers for common functionality
"""
import logging
from aiogram import types, Router
from aiogram.filters import Command

from core.bootstrap import bootstrap
from utils import safe_send_message, get_main_menu
from core.error_handler import safe_handler

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
    logger.info(f"IS_ADMIN: Checking user {user.id} ({user.username}) in chat {chat_id}_{topic_id}")
    
    # Сначала проверяем новую систему ролей
    role_can_manage = role_service.can_manage_session(user)
    logger.info(f"IS_ADMIN: Role service result: {role_can_manage}")
    
    if role_can_manage:
        logger.info(f"IS_ADMIN: User {user.id} is admin via role service")
        return True
    
    # Fallback на старую систему для обратной совместимости
    group_config_admin = group_config_service.is_admin(chat_id, topic_id, user)
    logger.info(f"IS_ADMIN: Group config service result: {group_config_admin}")
    
    final_result = group_config_admin
    logger.info(f"IS_ADMIN: Final result for user {user.id}: {final_result}")
    return final_result


@router.message(Command("start", "help"))
@safe_handler
async def help_command(msg: types.Message):
    """Команда помощи"""
    if not is_allowed_chat(msg.chat.id, msg.message_thread_id or 0):
        return
    
    if not msg.from_user:
        return
    
    # Проверяем права пользователя
    user_is_admin = is_admin(msg.from_user, msg.chat.id, msg.message_thread_id or 0)
    
    # Показываем меню
    keyboard = get_main_menu(is_admin=user_is_admin)
    await safe_send_message(
        msg.answer,
        "🎯 **Главное меню**\n\nВыберите действие:",
        reply_markup=keyboard,
        parse_mode="Markdown"
    )
