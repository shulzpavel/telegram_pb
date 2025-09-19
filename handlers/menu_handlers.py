"""
Menu handlers
"""
import logging
from aiogram import types, Router, F
from aiogram.types import CallbackQuery

from core.bootstrap import bootstrap
from .base_handlers import is_allowed_chat, is_admin
from utils import (
    safe_send_message, safe_answer_callback, get_main_menu, get_settings_menu,
    get_scale_menu, get_timeout_menu, get_stats_menu, get_help_menu,
    format_participants_list, generate_summary_report
)

logger = logging.getLogger(__name__)

router = Router()

# Инициализация сервисов
session_service = bootstrap.get_session_service()
group_config_service = bootstrap.get_group_config_service()


@router.callback_query(F.data == "menu:back")
async def handle_back(callback: CallbackQuery):
    """Обработчик кнопки 'Назад'"""
    try:
        if not callback.from_user or not callback.message:
            return
        
        chat_id = callback.message.chat.id
        topic_id = callback.message.message_thread_id or 0
        
        if not is_allowed_chat(chat_id, topic_id):
            return
        
        # Показываем главное меню
        user_is_admin = is_admin(callback.from_user, chat_id, topic_id)
        keyboard = get_main_menu(is_admin=user_is_admin)
        
        await safe_send_message(
            callback.message.edit_text,
            "🎯 **Главное меню**\n\nВыберите действие:",
            reply_markup=keyboard,
            parse_mode="Markdown"
        )
        
    except Exception as e:
        logger.error(f"Error in back handler: {e}")
        await safe_answer_callback(callback, "❌ Произошла ошибка при возврате в меню", show_alert=True)


@router.callback_query(F.data == "menu:new_task")
async def handle_new_task(callback: CallbackQuery):
    """Обработчик создания новой задачи"""
    try:
        if not callback.from_user or not callback.message:
            return
        
        chat_id = callback.message.chat.id
        topic_id = callback.message.message_thread_id or 0
        
        if not is_allowed_chat(chat_id, topic_id):
            return
        
        # Проверяем права администратора
        if not is_admin(callback.from_user, chat_id, topic_id):
            await safe_answer_callback(callback, "❌ Только администраторы могут создавать задачи", show_alert=True)
            return
        
        await safe_send_message(
            callback.message.edit_text,
            "📝 **Создание списка задач**\n\n"
            "Отправьте список задач одним сообщением. Каждая задача с новой строки.\n\n"
            "Пример:\n"
            "• Реализовать авторизацию\n"
            "• Добавить валидацию форм\n"
            "• Написать тесты\n\n"
            "Или отправьте Excel файл (.xlsx) с задачами.",
            parse_mode="Markdown"
        )
        
    except Exception as e:
        logger.error(f"Error in new task handler: {e}")
        await safe_answer_callback(callback, "❌ Произошла ошибка при создании задачи", show_alert=True)


@router.callback_query(F.data == "menu:summary")
async def handle_summary(callback: CallbackQuery):
    """Обработчик показа итогов дня"""
    try:
        if not callback.from_user or not callback.message:
            return
        
        chat_id = callback.message.chat.id
        topic_id = callback.message.message_thread_id or 0
        
        if not is_allowed_chat(chat_id, topic_id):
            return
        
        # Получаем сессию
        session = session_service.get_session(chat_id, topic_id)
        
        # Генерируем отчет
        report = generate_summary_report(session, is_daily=True)
        
        await safe_send_message(
            callback.message.edit_text,
            f"📊 **Итоги дня**\n\n{report}",
            parse_mode="Markdown"
        )
        
    except Exception as e:
        logger.error(f"Error in summary handler: {e}")
        await safe_answer_callback(callback, "❌ Произошла ошибка при получении итогов", show_alert=True)


@router.callback_query(F.data == "menu:show_participants")
async def handle_show_participants(callback: CallbackQuery):
    """Обработчик показа участников"""
    try:
        if not callback.from_user or not callback.message:
            return
        
        chat_id = callback.message.chat.id
        topic_id = callback.message.message_thread_id or 0
        
        if not is_allowed_chat(chat_id, topic_id):
            return
        
        # Получаем сессию
        session = session_service.get_session(chat_id, topic_id)
        
        # Форматируем список участников
        participants_text = format_participants_list(session)
        
        await safe_send_message(
            callback.message.edit_text,
            f"👥 **Участники сессии**\n\n{participants_text}",
            parse_mode="Markdown"
        )
        
    except Exception as e:
        logger.error(f"Error in show participants handler: {e}")
        await safe_answer_callback(callback, "❌ Произошла ошибка при получении списка участников", show_alert=True)


@router.callback_query(F.data == "menu:leave")
async def handle_leave(callback: CallbackQuery):
    """Обработчик выхода из сессии"""
    try:
        if not callback.from_user or not callback.message:
            return
        
        chat_id = callback.message.chat.id
        topic_id = callback.message.message_thread_id or 0
        
        if not is_allowed_chat(chat_id, topic_id):
            return
        
        # Удаляем участника
        participant = session_service.remove_participant(chat_id, topic_id, callback.from_user.id)
        
        if participant:
            await safe_answer_callback(callback, f"✅ Вы покинули сессию, {participant.full_name.value}!")
        else:
            await safe_answer_callback(callback, "❌ Вы не были участником сессии", show_alert=True)
        
    except Exception as e:
        logger.error(f"Error in leave handler: {e}")
        await safe_answer_callback(callback, "❌ Произошла ошибка при выходе из сессии", show_alert=True)
