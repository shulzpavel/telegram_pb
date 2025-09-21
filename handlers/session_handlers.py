"""
Session management handlers
"""
import logging
from aiogram import types, Router
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext

from models import PokerStates
from core.bootstrap import bootstrap
from .base_handlers import is_allowed_chat, is_admin
from utils import safe_send_message, get_main_menu

logger = logging.getLogger(__name__)

router = Router()

# Инициализация сервисов
session_service = bootstrap.get_session_service()
group_config_service = bootstrap.get_group_config_service()
role_service = bootstrap.get_role_service()




@router.message(Command("leave"))
async def leave_command(msg: types.Message):
    """Команда выхода из сессии"""
    if not is_allowed_chat(msg.chat.id, msg.message_thread_id or 0):
        return
    
    if not msg.from_user:
        return
    
    chat_id = msg.chat.id
    topic_id = msg.message_thread_id or 0
    
    try:
        participant = session_service.remove_participant(chat_id, topic_id, msg.from_user.id)
        
        if participant:
            await safe_send_message(
                msg.answer,
                f"✅ Вы покинули сессию, {participant.full_name.value}!"
            )
        else:
            await safe_send_message(
                msg.answer,
                "❌ Вы не были участником сессии."
            )
            
    except Exception as e:
        logger.error(f"Error in leave command: {e}")
        await safe_send_message(
            msg.answer,
            "❌ Произошла ошибка при выходе из сессии."
        )


@router.message(Command("menu"))
async def menu_command(msg: types.Message):
    """Команда вызова главного меню"""
    try:
        logger.info(f"MENU_COMMAND: User {msg.from_user.id if msg.from_user else 'None'} in chat {msg.chat.id}, topic {msg.message_thread_id or 0}")
        
        if not is_allowed_chat(msg.chat.id, msg.message_thread_id or 0):
            logger.warning(f"MENU_COMMAND: Chat not allowed for {msg.chat.id}_{msg.message_thread_id or 0}")
            await safe_send_message(
                msg.answer,
                "❌ Этот чат не настроен для работы с ботом."
            )
            return
        
        if not msg.from_user:
            return
        
        # Проверяем права пользователя
        logger.info(f"MENU_COMMAND: About to check admin status for user {msg.from_user.id}")
        user_is_admin = is_admin(msg.from_user, msg.chat.id, msg.message_thread_id or 0)
        logger.info(f"MENU_COMMAND: Admin status result: {user_is_admin}")
        
        # Показываем меню
        logger.info(f"MENU_COMMAND: About to get main menu with is_admin={user_is_admin}")
        keyboard = get_main_menu(is_admin=user_is_admin)
        logger.info(f"MENU_COMMAND: Got keyboard, about to send message")
        logger.info(f"MENU_COMMAND: Keyboard has {len(keyboard.inline_keyboard)} rows")
        for i, row in enumerate(keyboard.inline_keyboard):
            logger.info(f"MENU_COMMAND: Row {i}: {[btn.text for btn in row]}")
        
        await safe_send_message(
            msg.answer,
            "🎯 **Главное меню**\n\nВыберите действие:",
            reply_markup=keyboard,
            parse_mode="Markdown"
        )
        
    except Exception as e:
        logger.error(f"Error in menu command: {e}")
        await safe_send_message(
            msg.answer,
            "❌ Произошла ошибка при отображении меню."
        )
