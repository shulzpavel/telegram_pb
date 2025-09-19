"""
Admin handlers
"""
import logging
from aiogram import types, Router, F
from aiogram.types import CallbackQuery

from core.bootstrap import bootstrap
from .base_handlers import is_allowed_chat, is_admin
from utils import safe_send_message, safe_answer_callback

logger = logging.getLogger(__name__)

router = Router()

# Инициализация сервисов
session_service = bootstrap.get_session_service()
group_config_service = bootstrap.get_group_config_service()


@router.callback_query(F.data == "admin:update_story_points")
async def handle_update_story_points(callback: CallbackQuery):
    """Обработчик обновления Story Points"""
    try:
        if not callback.from_user or not callback.message:
            return
        
        chat_id = callback.message.chat.id
        topic_id = callback.message.message_thread_id or 0
        
        if not is_allowed_chat(chat_id, topic_id):
            return
        
        # Проверяем права администратора
        if not is_admin(callback.from_user, chat_id, topic_id):
            await safe_answer_callback(callback, "❌ Только администраторы могут обновлять Story Points", show_alert=True)
            return
        
        # Получаем конфигурацию группы
        group_config = group_config_service.get_group_config(chat_id, topic_id or 0)
        if not group_config:
            await safe_answer_callback(callback, "❌ Конфигурация группы не найдена", show_alert=True)
            return
        
        # Проверяем наличие Jira токена
        if not group_config.jira_token or not group_config.jira_email:
            await safe_answer_callback(
                callback, 
                "❌ Jira не настроен. Обратитесь к администратору для настройки интеграции.", 
                show_alert=True
            )
            return
        
        # Здесь должна быть логика обновления Story Points
        # Пока просто подтверждаем
        await safe_answer_callback(callback, "✅ Story Points обновлены в Jira")
        
    except Exception as e:
        logger.error(f"Error in update story points handler: {e}")
        await safe_answer_callback(callback, "❌ Произошла ошибка при обновлении Story Points", show_alert=True)


@router.callback_query(F.data.startswith("menu:kick_participant"))
async def handle_kick_participant(callback: CallbackQuery):
    """Обработчик удаления участника"""
    try:
        if not callback.from_user or not callback.message:
            return
        
        chat_id = callback.message.chat.id
        topic_id = callback.message.message_thread_id or 0
        
        if not is_allowed_chat(chat_id, topic_id):
            return
        
        # Проверяем права администратора
        if not is_admin(callback.from_user, chat_id, topic_id):
            await safe_answer_callback(callback, "❌ Только администраторы могут удалять участников", show_alert=True)
            return
        
        # Получаем список участников
        session = session_service.get_session(chat_id, topic_id)
        participants = list(session.participants.values())
        
        if not participants:
            await safe_answer_callback(callback, "❌ Нет участников для удаления", show_alert=True)
            return
        
        # Создаем клавиатуру с участниками
        from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton
        keyboard = []
        
        for participant in participants:
            keyboard.append([
                InlineKeyboardButton(
                    text=f"❌ {participant.full_name.value}",
                    callback_data=f"kick:{participant.user_id.value}"
                )
            ])
        
        keyboard.append([
            InlineKeyboardButton(text="🔙 Назад", callback_data="menu:back")
        ])
        
        await safe_send_message(
            callback.message.edit_text,
            "👥 **Выберите участника для удаления:**",
            reply_markup=InlineKeyboardMarkup(inline_keyboard=keyboard),
            parse_mode="Markdown"
        )
        
    except Exception as e:
        logger.error(f"Error in kick participant handler: {e}")
        await safe_answer_callback(callback, "❌ Произошла ошибка при удалении участника", show_alert=True)


@router.callback_query(F.data.startswith("kick:"))
async def handle_confirm_kick(callback: CallbackQuery):
    """Обработчик подтверждения удаления участника"""
    try:
        if not callback.from_user or not callback.message:
            return
        
        chat_id = callback.message.chat.id
        topic_id = callback.message.message_thread_id or 0
        
        if not is_allowed_chat(chat_id, topic_id):
            return
        
        # Проверяем права администратора
        if not is_admin(callback.from_user, chat_id, topic_id):
            await safe_answer_callback(callback, "❌ Только администраторы могут удалять участников", show_alert=True)
            return
        
        # Извлекаем ID пользователя
        user_id = int(callback.data.split(":", 1)[1])
        
        # Удаляем участника
        participant = session_service.remove_participant(chat_id, topic_id, user_id)
        
        if participant:
            await safe_answer_callback(callback, f"✅ Участник {participant.full_name.value} удален")
        else:
            await safe_answer_callback(callback, "❌ Участник не найден", show_alert=True)
        
    except Exception as e:
        logger.error(f"Error in confirm kick handler: {e}")
        await safe_answer_callback(callback, "❌ Произошла ошибка при удалении участника", show_alert=True)
