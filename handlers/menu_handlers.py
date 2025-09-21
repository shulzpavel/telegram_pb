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
    format_participants_list, format_participants_list_with_roles, generate_summary_report, get_batch_summary_menu
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
        
        # Проверяем конфигурацию Jira
        group_config = group_config_service.get_group_config(chat_id, topic_id)
        if not group_config or not group_config.jira_email or not group_config.jira_token:
            await safe_answer_callback(
                callback, 
                "❌ Jira не настроен. Обратитесь к администратору.", 
                show_alert=True
            )
            return
        
        # Добавляем кнопку "Назад"
        keyboard = [
            [types.InlineKeyboardButton(text="🔙 Назад", callback_data="menu:back")]
        ]
        
        await safe_send_message(
            callback.message.edit_text,
            "🔍 **Введите JQL запрос для получения задач из Jira**\n\n"
            "Отправьте JQL запрос в следующем сообщении.\n\n"
            "Примеры:\n"
            "• `project = \"PROJECT\" AND status = \"To Do\"`\n"
            "• `assignee = currentUser() AND status != Done`\n"
            "• `fixVersion = \"Sprint 1\"`",
            reply_markup=types.InlineKeyboardMarkup(inline_keyboard=keyboard),
            parse_mode="Markdown"
        )
        
    except Exception as e:
        logger.error(f"Error in new task handler: {e}")
        await safe_answer_callback(callback, "❌ Произошла ошибка при создании задачи", show_alert=True)


@router.callback_query(F.data == "task_source:manual")
async def handle_manual_tasks(callback: CallbackQuery):
    """Обработчик ввода задач вручную"""
    try:
        if not callback.from_user or not callback.message:
            return
        
        chat_id = callback.message.chat.id
        topic_id = callback.message.message_thread_id or 0
        
        if not is_allowed_chat(chat_id, topic_id):
            return
        
        # Добавляем кнопку "Назад"
        keyboard = [
            [types.InlineKeyboardButton(text="🔙 Назад", callback_data="menu:back")]
        ]
        
        await safe_send_message(
            callback.message.edit_text,
            "📝 **Ввод задач вручную**\n\n"
            "Отправьте список задач одним сообщением. Каждая задача с новой строки.\n\n"
            "Пример:\n"
            "• Реализовать авторизацию\n"
            "• Добавить валидацию форм\n"
            "• Написать тесты",
            reply_markup=types.InlineKeyboardMarkup(inline_keyboard=keyboard),
            parse_mode="Markdown"
        )
        
    except Exception as e:
        logger.error(f"Error in manual tasks handler: {e}")
        await safe_answer_callback(callback, "❌ Произошла ошибка", show_alert=True)


@router.callback_query(F.data == "task_source:jira")
async def handle_jira_tasks(callback: CallbackQuery):
    """Обработчик получения задач из Jira"""
    try:
        if not callback.from_user or not callback.message:
            return
        
        chat_id = callback.message.chat.id
        topic_id = callback.message.message_thread_id or 0
        
        if not is_allowed_chat(chat_id, topic_id):
            return
        
        # Проверяем конфигурацию Jira
        group_config = group_config_service.get_group_config(chat_id, topic_id)
        if not group_config or not group_config.jira_email or not group_config.jira_token:
            await safe_answer_callback(
                callback, 
                "❌ Jira не настроен. Обратитесь к администратору.", 
                show_alert=True
            )
            return
        
        # Добавляем кнопку "Назад"
        keyboard = [
            [types.InlineKeyboardButton(text="🔙 Назад", callback_data="menu:back")]
        ]
        
        await safe_send_message(
            callback.message.edit_text,
            "🔗 **Получение задач из Jira**\n\n"
            "Отправьте JQL запрос для получения задач.\n\n"
            "Примеры:\n"
            "• `project = \"PROJECT\" AND status = \"To Do\"`\n"
            "• `assignee = currentUser() AND status != Done`\n"
            "• `fixVersion = \"Sprint 1\"`",
            reply_markup=types.InlineKeyboardMarkup(inline_keyboard=keyboard),
            parse_mode="Markdown"
        )
        
    except Exception as e:
        logger.error(f"Error in Jira tasks handler: {e}")
        await safe_answer_callback(callback, "❌ Произошла ошибка", show_alert=True)


@router.callback_query(F.data == "task_source:excel")
async def handle_excel_tasks(callback: CallbackQuery):
    """Обработчик загрузки Excel файла"""
    try:
        if not callback.from_user or not callback.message:
            return
        
        chat_id = callback.message.chat.id
        topic_id = callback.message.message_thread_id or 0
        
        if not is_allowed_chat(chat_id, topic_id):
            return
        
        # Добавляем кнопку "Назад"
        keyboard = [
            [types.InlineKeyboardButton(text="🔙 Назад", callback_data="menu:back")]
        ]
        
        await safe_send_message(
            callback.message.edit_text,
            "📊 **Загрузка Excel файла**\n\n"
            "Отправьте Excel файл (.xlsx) с задачами.\n\n"
            "Формат файла:\n"
            "• Первая колонка: Название задачи\n"
            "• Вторая колонка: Описание (опционально)\n"
            "• Третья колонка: Приоритет (опционально)",
            reply_markup=types.InlineKeyboardMarkup(inline_keyboard=keyboard),
            parse_mode="Markdown"
        )
        
    except Exception as e:
        logger.error(f"Error in Excel tasks handler: {e}")
        await safe_answer_callback(callback, "❌ Произошла ошибка", show_alert=True)


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
        
        if not session:
            # Добавляем кнопку "Назад"
            keyboard = [
                [types.InlineKeyboardButton(text="🔙 Назад", callback_data="menu:back")]
            ]
            
            await safe_send_message(
                callback.message.edit_text,
                "❌ **Сессия не найдена**\n\nСначала создайте сессию.",
                reply_markup=types.InlineKeyboardMarkup(inline_keyboard=keyboard),
                parse_mode="Markdown"
            )
            return
        
        # Генерируем отчет
        try:
            report = generate_summary_report(session, is_daily=True)
        except Exception as e:
            logger.error(f"Error generating summary report: {e}")
            report = "❌ Ошибка при генерации отчета"
        
        # Добавляем кнопку "Назад"
        keyboard = [
            [types.InlineKeyboardButton(text="🔙 Назад", callback_data="menu:back")]
        ]
        
        await safe_send_message(
            callback.message.edit_text,
            f"📊 **Итоги дня**\n\n{report}",
            reply_markup=types.InlineKeyboardMarkup(inline_keyboard=keyboard),
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
        
        if not session:
            # Добавляем кнопку "Назад"
            keyboard = [
                [types.InlineKeyboardButton(text="🔙 Назад", callback_data="menu:back")]
            ]
            
            await safe_send_message(
                callback.message.edit_text,
                "❌ **Сессия не найдена**\n\nСначала создайте сессию.",
                reply_markup=types.InlineKeyboardMarkup(inline_keyboard=keyboard),
                parse_mode="Markdown"
            )
            return
        
        # Форматируем список участников с ролями
        participants_list = list(session.participants.values())
        participants_text = format_participants_list_with_roles(participants_list, chat_id, topic_id)
        
        # Добавляем кнопку "Назад"
        keyboard = [
            [types.InlineKeyboardButton(text="🔙 Назад", callback_data="menu:back")]
        ]
        
        await safe_send_message(
            callback.message.edit_text,
            f"👥 **Участники сессии**\n\n{participants_text}",
            reply_markup=types.InlineKeyboardMarkup(inline_keyboard=keyboard),
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


@router.message(lambda message: not message.text.startswith('/'))
async def handle_jql_query(message: types.Message):
    """Обработчик JQL запроса от пользователя"""
    try:
        if not message.from_user or not message.text:
            return
        
        chat_id = message.chat.id
        topic_id = message.message_thread_id or 0
        
        if not is_allowed_chat(chat_id, topic_id):
            return
        
        # Проверяем права администратора
        if not is_admin(message.from_user, chat_id, topic_id):
            return
        
        jql_query = message.text.strip()
        
        # Проверяем, что это похоже на JQL запрос
        if len(jql_query) < 3 or not any(keyword in jql_query.lower() for keyword in ['project', 'assignee', 'status', 'fixversion', 'key', 'summary']):
            return  # Не похоже на JQL запрос
        
        # Получаем конфигурацию группы
        group_config = group_config_service.get_group_config(chat_id, topic_id)
        if not group_config or not group_config.jira_email or not group_config.jira_token:
            await safe_send_message(
                message.answer,
                "❌ Jira не настроен. Обратитесь к администратору."
            )
            return
        
        await safe_send_message(
            message.answer,
            f"🔍 **Обрабатываю JQL запрос...**\n\n`{jql_query}`",
            parse_mode="Markdown"
        )
        
        # Импортируем функцию парсинга
        from utils import parse_jira_jql
        
        # Парсим задачи из Jira
        tasks = parse_jira_jql(jql_query)
        
        if not tasks:
            await safe_send_message(
                message.answer,
                "❌ **Задачи не найдены**\n\nПроверьте JQL запрос и попробуйте снова.",
                parse_mode="Markdown"
            )
            return
        
        # Создаем сессию с полученными задачами
        try:
            # Сначала создаем сессию
            session = session_service.get_session(chat_id, topic_id)
            if not session:
                # Если сессии нет, создаем новую
                from domain.entities import DomainSession
                from domain.value_objects import ChatId, TopicId
                
                session = DomainSession(
                    chat_id=ChatId(chat_id),
                    topic_id=TopicId(topic_id)
                )
                session_service.save_session(session)
            
            # Устанавливаем токен для группы
            group_config_service.set_token(chat_id, topic_id, "magic_token")
            
            # Запускаем голосование с задачами
            success = session_service.start_voting_session(chat_id, topic_id, tasks)
            
            # Создаем кнопку для начала голосования
            keyboard = [
                [types.InlineKeyboardButton(text="🗳️ Начать голосование", callback_data="start_voting")],
                [types.InlineKeyboardButton(text="🔙 Назад", callback_data="menu:back")]
            ]
            
            if success:
                await safe_send_message(
                    message.answer,
                    f"✅ **Сессия создана!**\n\n"
                    f"📝 **Найдено задач:** {len(tasks)}\n"
                    f"🎯 **Готов к голосованию**\n\n"
                    f"Участники могут присоединиться командой `/join magic_token`",
                    reply_markup=types.InlineKeyboardMarkup(inline_keyboard=keyboard),
                    parse_mode="Markdown"
                )
            else:
                await safe_send_message(
                    message.answer,
                    "❌ Ошибка при создании сессии. Попробуйте снова."
                )
            
        except Exception as e:
            logger.error(f"Error creating session: {e}")
            await safe_send_message(
                message.answer,
                "❌ Ошибка при создании сессии. Попробуйте снова."
            )
        
    except Exception as e:
        logger.error(f"Error in JQL query handler: {e}")
        await safe_send_message(
            message.answer,
            "❌ Произошла ошибка при обработке запроса."
        )


@router.callback_query(F.data == "start_voting")
async def handle_start_voting(callback: CallbackQuery):
    """Обработчик начала голосования"""
    try:
        if not callback.from_user or not callback.message:
            return
        
        chat_id = callback.message.chat.id
        topic_id = callback.message.message_thread_id or 0
        
        if not is_allowed_chat(chat_id, topic_id):
            return
        
        # Проверяем права администратора
        if not is_admin(callback.from_user, chat_id, topic_id):
            await safe_answer_callback(callback, "❌ Только администраторы могут начинать голосование", show_alert=True)
            return
        
        # Получаем сессию
        session = session_service.get_session(chat_id, topic_id)
        if not session:
            await safe_answer_callback(callback, "❌ Сессия не найдена", show_alert=True)
            return
        
        # Начинаем голосование
        from utils import build_vote_keyboard
        
        # Получаем шкалу из конфигурации группы
        group_config = group_config_service.get_group_config(chat_id, topic_id)
        scale = group_config.scale if group_config else ['1', '2', '3', '5', '8', '13']
        
        keyboard = build_vote_keyboard(scale)
        
        await safe_send_message(
            callback.message.edit_text,
            f"🗳️ **Голосование началось!**\n\n"
            f"📝 **Текущая задача:** {session.current_task.text.value if session.current_task else 'Нет задач'}\n\n"
            f"Выберите оценку:",
            reply_markup=keyboard,
            parse_mode="Markdown"
        )
        
    except Exception as e:
        logger.error(f"Error in start voting handler: {e}")
        await safe_answer_callback(callback, "❌ Произошла ошибка при начале голосования", show_alert=True)


@router.callback_query(F.data == "stats:today")
async def handle_stats_today(callback: CallbackQuery):
    """Обработчик статистики за сегодня"""
    try:
        if not callback.from_user or not callback.message:
            return
        
        chat_id = callback.message.chat.id
        topic_id = callback.message.message_thread_id or 0
        
        if not is_allowed_chat(chat_id, topic_id):
            return
        
        # Получаем сессию
        session = session_service.get_session(chat_id, topic_id)
        if not session:
            await safe_answer_callback(callback, "❌ Сессия не найдена", show_alert=True)
            return
        
        # Генерируем отчет за сегодня
        from utils import generate_summary_report
        report = generate_summary_report(session)
        
        # Показываем статистику
        await safe_send_message(
            callback.message.edit_text,
            f"📊 **Статистика за сегодня**\n\n{report}",
            reply_markup=get_batch_summary_menu(),
            parse_mode="Markdown"
        )
        
    except Exception as e:
        logger.error(f"Error in stats today handler: {e}")
        await safe_answer_callback(callback, "❌ Произошла ошибка при получении статистики", show_alert=True)


@router.callback_query(F.data == "stats:last_session")
async def handle_stats_last_session(callback: CallbackQuery):
    """Обработчик статистики за последний банч"""
    try:
        if not callback.from_user or not callback.message:
            return
        
        chat_id = callback.message.chat.id
        topic_id = callback.message.message_thread_id or 0
        
        if not is_allowed_chat(chat_id, topic_id):
            return
        
        # Получаем сессию
        session = session_service.get_session(chat_id, topic_id)
        if not session:
            await safe_answer_callback(callback, "❌ Сессия не найдена", show_alert=True)
            return
        
        # Форматируем статистику последнего банча
        from utils import format_batch_progress
        from core.bootstrap import bootstrap
        session_control_service = bootstrap.get_session_control_service()
        
        batch_info = session_control_service.get_batch_progress(chat_id, topic_id)
        stats_text = format_batch_progress(batch_info)
        
        # Показываем статистику
        await safe_send_message(
            callback.message.edit_text,
            f"📈 **Статистика за последний банч**\n\n{stats_text}",
            reply_markup=get_batch_summary_menu(),
            parse_mode="Markdown"
        )
        
    except Exception as e:
        logger.error(f"Error in stats last session handler: {e}")
        await safe_answer_callback(callback, "❌ Произошла ошибка при получении статистики", show_alert=True)
