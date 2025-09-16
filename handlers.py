"""
Обработчики для Telegram Poker Bot
"""
import asyncio
import logging
from typing import Optional
from datetime import datetime, timedelta
from aiogram import types, Router, F
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, FSInputFile
from aiogram.exceptions import TelegramBadRequest

logger = logging.getLogger(__name__)

from models import PokerStates
# from services import SessionService, TimerService, GroupConfigService  # Using bootstrap now
# from storage import storage  # Removed - using new architecture
from core.bootstrap import bootstrap
from domain.enums import SessionStatus
from utils import (
    get_main_menu, get_settings_menu, get_scale_menu, get_timeout_menu,
    get_stats_menu, get_help_menu, safe_send_message, safe_answer_callback, 
    format_participants_list, generate_summary_report, build_vote_keyboard, 
    build_admin_keyboard, format_task_with_progress, format_voting_status,
    format_participant_stats, format_average_estimates
)
from config import GROUPS_CONFIG, DEFAULT_SCALE, DEFAULT_TIMEOUT

router = Router()

# Инициализация сервисов через bootstrap
session_service = bootstrap.get_session_service()
group_config_service = bootstrap.get_group_config_service()
timer_service = bootstrap.get_timer_service()


def is_allowed_chat(chat_id: int, topic_id: int) -> bool:
    """Проверить, разрешен ли чат"""
    for group_config in GROUPS_CONFIG:
        if (group_config['chat_id'] == chat_id and 
            group_config['topic_id'] == topic_id and 
            group_config.get('is_active', True)):
            return True
    return False


def is_admin(user: types.User, chat_id: int, topic_id: int) -> bool:
    """Проверить, является ли пользователь админом"""
    return group_config_service.is_admin(chat_id, topic_id, user)


@router.message(Command("start", "help"))
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


@router.message(Command("menu"))
async def menu_command(msg: types.Message):
    """Команда вызова главного меню"""
    try:
        if not is_allowed_chat(msg.chat.id, msg.message_thread_id or 0):
            await safe_send_message(
                msg.answer,
                "❌ Этот чат не настроен для работы с ботом."
            )
            return
        
        if not msg.from_user:
            await safe_send_message(
                msg.answer,
                "❌ Не удалось определить пользователя."
            )
            return
        
        # Показываем одно простое меню для всех
        await safe_send_message(
            msg.answer,
            "📌 Главное меню:",
            reply_markup=get_main_menu()
        )
    except Exception as e:
        logger.error(f"Error in menu command: {e}")
        await safe_send_message(
            msg.answer,
            "❌ Произошла ошибка при открытии меню. Попробуйте позже."
        )


@router.message(Command("join"))
async def join_command(msg: types.Message):
    """Команда присоединения к сессии"""
    logger.info(f"JOIN command from user {msg.from_user.id if msg.from_user else 'None'} in chat {msg.chat.id}")
    
    if not msg.from_user or not msg.text:
        logger.warning("JOIN: Missing user or text")
        return
    
    chat_id = msg.chat.id
    topic_id = msg.message_thread_id or 0
    
    logger.info(f"JOIN: chat_id={chat_id}, topic_id={topic_id}")
    
    if not is_allowed_chat(chat_id, topic_id):
        logger.warning(f"JOIN: Chat not allowed - {chat_id}_{topic_id}")
        return

    # Проверяем токен
    args = msg.text.split()
    logger.info(f"JOIN: Command args: {args}")
    
    if len(args) != 2:
        logger.warning(f"JOIN: Invalid command format for user {msg.from_user.id}: {msg.text}")
        await safe_send_message(
            msg.answer,
            "❌ Неверный формат команды. Используйте: `/join <токен>`",
            parse_mode="Markdown"
        )
        return
    
    provided_token = args[1]
    expected_token = group_config_service.get_token(chat_id, topic_id)
    
    logger.info(f"JOIN: Token check - provided: '{provided_token}', expected: '{expected_token}'")
    
    if provided_token != expected_token:
        logger.warning(f"JOIN: Token mismatch for user {msg.from_user.id} - provided: '{provided_token}', expected: '{expected_token}'")
        await safe_send_message(msg.answer, "❌ Неверный токен.")
        return
    
    logger.info(f"JOIN: Token validation passed for user {msg.from_user.id}")

    # Админ получает меню управления
    if is_admin(msg.from_user, chat_id, topic_id):
        logger.info(f"JOIN: User {msg.from_user.id} is admin, showing admin menu")
        session = session_service.get_session(chat_id, topic_id)
        # Убираем админа из участников голосования
        from domain.value_objects import UserId
        session.remove_participant(UserId(msg.from_user.id))
        session_service.save_session(session)
        
        logger.info(f"JOIN: Sending admin menu to user {msg.from_user.id}")
        await safe_send_message(
            msg.answer,
            "👑 Добро пожаловать в панель управления!",
            reply_markup=get_main_menu()
        )
        logger.info(f"JOIN: Admin menu sent successfully")
        return

    # Добавляем участника
    logger.info(f"JOIN: Adding participant {msg.from_user.id} to session {chat_id}_{topic_id}")
    success = session_service.add_participant(chat_id, topic_id, msg.from_user)
    if success:
        logger.info(f"JOIN: Successfully added participant {msg.from_user.id}")
        await safe_send_message(
            msg.answer,
            f"✅ {msg.from_user.full_name or f'User {msg.from_user.id}'} присоединился к сессии."
        )
    else:
        logger.error(f"JOIN: Failed to add participant {msg.from_user.id}")


@router.callback_query(F.data.startswith("menu:"))
async def handle_menu(callback: CallbackQuery, state: FSMContext):
    """Обработка главного меню"""
    logger.info(f"MENU callback from user {callback.from_user.id if callback.from_user else 'None'}: {callback.data}")
    
    await safe_answer_callback(callback, "✅")

    if not callback.message or not callback.from_user:
        logger.warning("MENU: Missing message or user")
        return
    
    chat_id = callback.message.chat.id
    topic_id = callback.message.message_thread_id or 0
    
    if not is_allowed_chat(chat_id, topic_id):
        logger.warning(f"MENU: Chat not allowed - {chat_id}_{topic_id}")
        return
    
    session = session_service.get_session(chat_id, topic_id)

    action = callback.data.split(":")[1] if callback.data else ""
    logger.info(f"MENU: Action = {action}")

    if action == "new_task":
        await safe_send_message(
            callback.message.answer,
            "📝 **Присылай запрос, как нормальный взрослый менеджер!**\n\n"
            "• **JQL запрос** (например: project = FLEX AND status = 'To Do')\n"
            "• **Текстом** (каждая задача с новой строки)\n\n"
            "💡 **Примеры JQL запросов:**\n"
            "• project = FLEX AND type = Bug\n"
            "• assignee = currentUser() AND status = 'To Do'\n"
            "• priority = High ORDER BY created DESC\n\n"
            "🤷‍♂️ **Если не умеешь JQL** - присылай текст, как маленький:\n"
            "FLEX-123 - Описание задачи\n"
            "FLEX-456 - Еще одна задача"
        )
        await state.set_state(PokerStates.waiting_for_task_text)

    elif action == "summary":
        await show_full_day_summary(callback.message)

    elif action == "show_participants":
        participants = list(session.participants.values())
        text = format_participants_list(participants)
        from utils import get_participants_menu
        try:
            await callback.message.edit_text(text, reply_markup=get_participants_menu())
        except Exception as e:
            logger.warning(f"Failed to edit message: {e}")
            await safe_send_message(callback.message.answer, text, reply_markup=get_participants_menu())

    elif action == "leave":
        user_id = callback.from_user.id
        # Use service to ensure proper persistence and typing
        participant = session_service.remove_participant(chat_id, topic_id, user_id)
        if participant:
            await safe_send_message(
                callback.message.answer,
                "🚪 Вы покинули сессию."
            )

    elif action == "kick_participant":
        if not is_admin(callback.from_user, chat_id, topic_id):
            await safe_send_message(
                callback.message.answer,
                "❌ Доступ запрещен. Только администраторы могут исключать участников."
            )
            return
        await show_kick_participant_menu(callback.message)

    elif action == "settings":
        if not is_admin(callback.from_user, chat_id, topic_id):
            await safe_send_message(
                callback.message.answer,
                "❌ Доступ запрещен. Только администраторы могут изменять настройки."
            )
            return
        await safe_send_message(
            callback.message.answer,
            "⚙️ Настройки группы:",
            reply_markup=get_settings_menu()
        )

    elif action == "new_token":
        if not is_admin(callback.from_user, chat_id, topic_id):
            await safe_send_message(
                callback.message.answer,
                "❌ Доступ запрещен. Только администраторы могут создавать токены."
            )
            return
        await generate_new_token(callback.message)

    elif action == "stats":
        if not is_admin(callback.from_user, chat_id, topic_id):
            await safe_send_message(
                callback.message.answer,
                "❌ Доступ запрещен. Только администраторы могут просматривать статистику."
            )
            return
        await safe_send_message(
            callback.message.answer,
            "📊 Статистика и аналитика:",
            reply_markup=get_stats_menu()
        )

    elif action == "help":
        await safe_send_message(
            callback.message.answer,
            "❓ Справка и помощь:",
            reply_markup=get_help_menu()
        )

    elif action == "next_batch":
        if not is_admin(callback.from_user, chat_id, topic_id):
            await safe_send_message(
                callback.message.answer,
                "❌ Доступ запрещен. Только администраторы могут запускать банчи."
            )
            return
        
        # Запускаем следующий банч
        await timer_service._start_next_task(chat_id, topic_id, callback.message)

    elif action == "back":
        # Обновляем существующее сообщение вместо создания нового
        try:
            await callback.message.edit_text(
                "📌 Главное меню:",
                reply_markup=get_main_menu()
            )
        except Exception as e:
            logger.warning(f"Failed to edit message: {e}")
            # Если не удалось обновить, создаем новое сообщение
            await safe_send_message(
                callback.message.answer,
                "📌 Главное меню:",
                reply_markup=get_main_menu()
            )


async def show_kick_participant_menu(message: types.Message):
    """Показать меню удаления участников"""
    logger.info(f"KICK_PARTICIPANT_MENU: chat_id={message.chat.id}, topic_id={message.message_thread_id or 0}")
    
    chat_id = message.chat.id
    topic_id = message.message_thread_id or 0
    session = session_service.get_session(chat_id, topic_id)
    
    logger.info(f"KICK_PARTICIPANT_MENU: Found {len(session.participants)} participants")
    
    if not session.participants:
        logger.info("KICK_PARTICIPANT_MENU: No participants found")
        await safe_send_message(message.answer, "⛔ Участников пока нет.")
        return

    buttons = []
    for participant in session.participants.values():
        buttons.append([types.InlineKeyboardButton(
            text=f"👤 {participant.full_name.value}",
            callback_data=f"kick_user:{participant.user_id.value}"
        )])
    
    keyboard = types.InlineKeyboardMarkup(inline_keyboard=buttons)
    await safe_send_message(
        message.answer,
        "👤 Выберите участника для удаления:",
        reply_markup=keyboard
    )


async def generate_new_token(message: types.Message):
    """Сгенерировать новый токен"""
    import secrets
    import string
    
    chat_id = message.chat.id
    topic_id = message.message_thread_id or 0
    
    # Генерируем случайный токен
    alphabet = string.ascii_letters + string.digits
    new_token = ''.join(secrets.choice(alphabet) for _ in range(12))
    
    group_config_service.set_token(chat_id, topic_id, new_token)
    
    await safe_send_message(
        message.answer,
        f"🔄 Новый токен сгенерирован для этой группы:\n`{new_token}`\n\n"
        f"Участники должны использовать команду:\n"
        f"`/join {new_token}`\n\n"
        f"💡 Этот токен работает только в данной группе. "
        f"Хардкод админ имеет доступ ко всем группам.",
        parse_mode="Markdown"
    )


@router.callback_query(F.data.startswith("kick_user:"))
async def kick_user(callback: CallbackQuery):
    """Удалить участника"""
    await safe_answer_callback(callback, "✅")

    if not callback.message or not callback.from_user:
        return
    
    chat_id = callback.message.chat.id
    topic_id = callback.message.message_thread_id or 0
    
    if not is_allowed_chat(chat_id, topic_id):
        return
    
    if not is_admin(callback.from_user, chat_id, topic_id):
        return

    user_id = int(callback.data.split(":")[1]) if callback.data else 0
    participant = session_service.remove_participant(chat_id, topic_id, user_id)

    if participant:
        await safe_send_message(
            callback.message.answer,
            f"🚫 Участник <b>{participant.full_name.value}</b> удалён из сессии.",
            parse_mode="HTML"
        )
        
        # Проверяем, нужно ли завершить голосование
        session = session_service.get_session(chat_id, topic_id)
        if (session.is_voting_active and 
            session.is_all_voted()):
            await timer_service.finish_voting(chat_id, topic_id, callback.message)
    else:
        await safe_send_message(
            callback.message.answer,
            "❌ Участник уже был удалён."
        )


@router.message(PokerStates.waiting_for_task_text)
async def receive_task_list(msg: types.Message, state: FSMContext):
    """Получить список задач"""
    chat_id = msg.chat.id
    topic_id = msg.message_thread_id or 0
    
    if not is_allowed_chat(chat_id, topic_id):
        return

    # Убираем админа из участников
    if msg.from_user:
        session = session_service.get_session(chat_id, topic_id)
        from domain.value_objects import UserId
        session.remove_participant(UserId(msg.from_user.id))
        session_service.save_session(session)

    tasks = []
    
    # Проверяем, является ли сообщение документом
    if msg.document:
        await safe_send_message(
            msg.answer,
            "❌ Файлы не поддерживаются! Присылай JQL запрос или текст, как нормальный менеджер!"
        )
        return
    
    # Если это текстовое сообщение
    if msg.text:
        # Сначала пытаемся обработать как JQL запрос
        from utils import parse_jira_jql
        tasks = parse_jira_jql(msg.text.strip())
        
        if not tasks:
            # Если JQL не сработал, пробуем как обычный список задач
            from utils import parse_task_list
            tasks = parse_task_list(msg.text)
            
            if not tasks:
                await safe_send_message(
                    msg.answer,
                    "❌ Не удалось получить задачи!\n\n"
                    "💡 **Попробуй:**\n"
                    "• JQL запрос (например: project = FLEX AND status = 'To Do')\n"
                    "• Текст с задачами (FLEX-123 - Описание)\n\n"
                    "🔧 **Проверь настройки JIRA_EMAIL и JIRA_TOKEN**"
                )
                return
    else:
        await safe_send_message(
            msg.answer,
            "❌ Отправь список задач текстом!"
        )
        return

    # Начинаем сессию голосования
    logger.info(f"RECEIVE_TASK_LIST: Starting voting session with {len(tasks)} tasks")
    success = session_service.start_voting_session(chat_id, topic_id, tasks)
    
    if success:
        logger.info(f"RECEIVE_TASK_LIST: Session started successfully")
        # Получаем информацию о банчах
        current_batch, total_batches = session_service.get_current_batch_info(chat_id, topic_id)
        total_tasks = session_service.get_total_all_tasks_count(chat_id, topic_id)
        
        logger.info(f"RECEIVE_TASK_LIST: Batch info - current: {current_batch}, total: {total_batches}, tasks: {total_tasks}")
        
        await safe_send_message(
            msg.answer,
            f"✅ Начинаем голосование по {total_tasks} задачам!\n"
            f"📊 Задачи разделены на {total_batches} банчей по 10 штук\n"
            f"🔄 Начинаем с банча 1/{total_batches}"
        )
        await state.clear()
        
        logger.info(f"RECEIVE_TASK_LIST: About to start first task")
        # Запускаем первую задачу
        await timer_service._start_next_task(chat_id, topic_id, msg)
        logger.info(f"RECEIVE_TASK_LIST: First task start completed")
    else:
        logger.error(f"RECEIVE_TASK_LIST: Failed to start voting session")
        await safe_send_message(
            msg.answer,
            "❌ Ошибка при создании сессии голосования."
        )




@router.callback_query(F.data.startswith("vote:"))
async def vote_handler(callback: CallbackQuery):
    """Обработка голосования"""
    logger.info(f"VOTE callback from user {callback.from_user.id if callback.from_user else 'None'}: {callback.data}")
    
    if not callback.message or not callback.from_user:
        logger.warning("VOTE: Missing message or user")
        return
    
    chat_id = callback.message.chat.id
    topic_id = callback.message.message_thread_id or 0
    
    if not is_allowed_chat(chat_id, topic_id):
        logger.warning(f"VOTE: Chat not allowed - {chat_id}_{topic_id}")
        return

    session = session_service.get_session(chat_id, topic_id)

    # Проверяем, есть ли активная задача
    if not session.current_task:
        await safe_answer_callback(callback, "❌ Нет активной задачи для голосования. Используйте /menu для управления.", show_alert=True)
        return

    if callback.message.message_id != session.active_vote_message_id:
        # Более информативное сообщение об ошибке
        if session.active_vote_message_id is None:
            await safe_answer_callback(callback, "❌ Голосование не активно. Дождитесь начала новой задачи или используйте /menu для управления.", show_alert=True)
        else:
            await safe_answer_callback(callback, "❌ Это уже неактивное голосование. Используйте кнопки из текущего сообщения.", show_alert=True)
        return

    value = callback.data.split(":")[1] if callback.data else ""
    user_id = callback.from_user.id

    logger.info(f"VOTE_HANDLER: Processing vote from user {user_id} with value '{value}'")
    logger.info(f"VOTE_HANDLER: Session participants: {list(session.participants.keys())}")
    logger.info(f"VOTE_HANDLER: Current task votes: {list(session.current_task.votes.keys()) if session.current_task else 'No current task'}")

    # Проверяем, является ли пользователь участником или админом
    from domain.value_objects import UserId
    user_id_obj = UserId(user_id)
    is_participant = user_id_obj in session.participants
    is_user_admin = is_admin(callback.from_user, chat_id, topic_id)
    
    logger.info(f"VOTE_HANDLER: User {user_id} - is_participant: {is_participant}, is_admin: {is_user_admin}")
    logger.info(f"VOTE_HANDLER: user_id_obj: {user_id_obj}")
    logger.info(f"VOTE_HANDLER: session.participants keys: {list(session.participants.keys())}")
    
    if not is_participant and not is_user_admin:
        logger.warning(f"VOTE_HANDLER: User {user_id} is not registered")
        await safe_answer_callback(callback, "❌ Вы не зарегистрированы через /join.", show_alert=True)
        return

    # Проверяем, голосовал ли уже
    already_voted = user_id_obj in (session.current_task.votes if session.current_task else {})
    logger.info(f"VOTE_HANDLER: User {user_id} already_voted: {already_voted}")
    
    # Check if we're in revoting mode
    session = session_service.get_session(chat_id, topic_id)
    if session.revoting_status.value == "in_progress":
        # Handle revoting
        from core.bootstrap import bootstrap
        session_control_service = bootstrap.get_session_control_service()
        success = session_control_service.add_revoting_vote(chat_id, topic_id, user_id, value)
        logger.info(f"REVOTING_VOTE: Vote added successfully: {success}")
        
        if success:
            await safe_answer_callback(
                callback,
                "✅ Голос в переголосовании учтён!" if not already_voted else "♻️ Обновлено в переголосовании"
            )
            
            # Check if all voted in revoting
            if session_control_service.is_revoting_all_voted(chat_id, topic_id):
                logger.info("REVOTING: All voted, completing revoting task")
                # Show completion button or auto-complete
                from utils import create_revoting_task_keyboard
                await callback.message.edit_reply_markup(
                    reply_markup=create_revoting_task_keyboard()
                )
        else:
            await safe_answer_callback(callback, "❌ Ошибка при добавлении голоса в переголосовании", show_alert=True)
            return
    else:
        # Handle normal voting
        logger.info(f"VOTE_HANDLER: Calling session_service.add_vote for user {user_id} with value '{value}'")
        success = session_service.add_vote(chat_id, topic_id, user_id, value)
        logger.info(f"VOTE_HANDLER: add_vote result: {success}")
        logger.info(f"VOTE_HANDLER: Vote added successfully: {success}")
        
        if success:
            await safe_answer_callback(
                callback,
                "✅ Голос учтён!" if not already_voted else "♻️ Обновлено"
            )

        # Проверяем, все ли проголосовали
        all_voted = session_service.is_all_voted(chat_id, topic_id)
        logger.info(f"VOTE_HANDLER: All voted: {all_voted}")
        
        if all_voted:
            logger.info("VOTE_HANDLER: All voted, revealing votes")
            await timer_service.finish_voting(chat_id, topic_id, callback.message)


@router.callback_query(F.data.startswith("timer:"))
async def timer_control(callback: CallbackQuery):
    """Управление таймером"""
    await safe_answer_callback(callback, "✅")

    if not callback.message or not callback.from_user:
        return
    
    chat_id = callback.message.chat.id
    topic_id = callback.message.message_thread_id or 0
    
    if not is_allowed_chat(chat_id, topic_id):
        return
    
    if not is_admin(callback.from_user, chat_id, topic_id):
        await safe_answer_callback(callback, "Только админ.", show_alert=True)
        return

    session = session_service.get_session(chat_id, topic_id)
    
    if callback.message.message_id != session.active_vote_message_id:
        await safe_answer_callback(callback, "Это уже неактивное голосование.")
        return

    action = callback.data.split(":")[1] if callback.data else ""
    
    if action == "+30":
        timer_service.extend_timer(chat_id, topic_id, 30)
        await safe_answer_callback(callback, "⏱ +30 сек")
    elif action == "-30":
        timer_service.extend_timer(chat_id, topic_id, -30)
        await safe_answer_callback(callback, "⏱ −30 сек")


@router.callback_query(F.data == "finish_voting")
async def handle_finish_voting(callback: CallbackQuery):
    """Обработка завершения голосования"""
    await safe_answer_callback(callback, "✅")
    
    if not callback.message or not callback.from_user:
        return
    
    chat_id = callback.message.chat.id
    topic_id = callback.message.message_thread_id or 0
    
    if not is_allowed_chat(chat_id, topic_id):
        return
    
    # Check if user is admin
    if not is_admin(callback.from_user, chat_id, topic_id):
        await safe_answer_callback(callback, "❌ Только админы могут завершать голосование", show_alert=True)
        return
    
    # Check if session is already in voting state to prevent double-finish
    session_service = bootstrap.get_session_service()
    session = session_service.get_session(chat_id, topic_id)
    if session and session.status != SessionStatus.VOTING:
        logger.warning(f"FINISH_VOTING: Session {chat_id}_{topic_id} is not in VOTING state, current: {session.status}")
        await safe_answer_callback(callback, "⚠️ Голосование уже завершено", show_alert=True)
        return
    
    # Finish voting
    await timer_service.finish_voting(chat_id, topic_id, callback.message)
    logger.info(f"FINISH_VOTING: Admin {callback.from_user.id} finished voting in {chat_id}_{topic_id}")


@router.callback_query(F.data.startswith("settings:"))
async def handle_settings(callback: CallbackQuery):
    """Обработка настроек"""
    await safe_answer_callback(callback, "✅")

    if not callback.message or not callback.from_user:
        return
    
    chat_id = callback.message.chat.id
    topic_id = callback.message.message_thread_id or 0
    
    if not is_allowed_chat(chat_id, topic_id):
        return
    
    if not is_admin(callback.from_user, chat_id, topic_id):
        return

    action = callback.data.split(":")[1] if callback.data else ""

    if action == "timeout":
        await safe_send_message(
            callback.message.answer,
            "⏱️ Выберите таймаут для голосования:",
            reply_markup=get_timeout_menu()
        )
    elif action == "scale":
        await safe_send_message(
            callback.message.answer,
            "📊 Выберите шкалу оценок:",
            reply_markup=get_scale_menu()
        )
    elif action == "admins":
        await show_admins_management(callback.message)
    elif action == "back":
        # Обновляем существующее сообщение вместо создания нового
        try:
            await callback.message.edit_text(
                "📌 Главное меню:",
                reply_markup=get_main_menu()
            )
        except Exception as e:
            logger.warning(f"Failed to edit message: {e}")
            # Если не удалось обновить, создаем новое сообщение
            await safe_send_message(
                callback.message.answer,
                "📌 Главное меню:",
                reply_markup=get_main_menu()
            )


@router.callback_query(F.data.startswith("timeout:"))
async def set_timeout(callback: CallbackQuery):
    """Установить таймаут"""
    await safe_answer_callback(callback, "✅")

    if not callback.message or not callback.from_user:
        return
    
    chat_id = callback.message.chat.id
    topic_id = callback.message.message_thread_id or 0
    
    if not is_allowed_chat(chat_id, topic_id):
        return
    
    if not is_admin(callback.from_user, chat_id, topic_id):
        return

    timeout = int(callback.data.split(":")[1]) if callback.data else 90
    
    # Обновляем настройки в конфигурации группы
    group_config = group_config_service.get_group_config(chat_id, topic_id)
    if group_config:
        group_config.timeout = timeout
        group_config_service.update_group_config(group_config)
        logger.info(f"TIMEOUT_SETTING: Updated timeout to {timeout} for {chat_id}_{topic_id}")
    
    # Также обновляем в текущей сессии
    session = session_service.get_session(chat_id, topic_id)
    from domain.value_objects import TimeoutSeconds
    session.default_timeout = TimeoutSeconds(timeout)
    session_service.save_session(session)
    
    await safe_answer_callback(callback, f"⏱️ Таймаут установлен: {timeout}с")


@router.callback_query(F.data.startswith("scale:"))
async def set_scale(callback: CallbackQuery):
    """Установить шкалу оценок"""
    await safe_answer_callback(callback, "✅")

    if not callback.message or not callback.from_user:
        return
    
    chat_id = callback.message.chat.id
    topic_id = callback.message.message_thread_id or 0
    
    if not is_allowed_chat(chat_id, topic_id):
        return
    
    if not is_admin(callback.from_user, chat_id, topic_id):
        return

    scale_index = int(callback.data.split(":")[1]) if callback.data else 0
    scales = [
        ['1', '2', '3', '5', '8', '13'],
        ['1', '2', '3', '5', '8', '13', '21'],
        ['0.5', '1', '2', '3', '5', '8', '13'],
        ['1', '2', '4', '8', '16', '32']
    ]
    
    if 0 <= scale_index < len(scales):
        # Обновляем настройки в конфигурации группы
        group_config = group_config_service.get_group_config(chat_id, topic_id)
        if group_config:
            group_config.scale = scales[scale_index]
            group_config_service.update_group_config(group_config)
            logger.info(f"SCALE_SETTING: Updated scale to {scales[scale_index]} for {chat_id}_{topic_id}")
        
        # Также обновляем в текущей сессии
        session = session_service.get_session(chat_id, topic_id)
        session.scale = scales[scale_index]
        session_service.save_session(session)
        
        scale_text = ', '.join(scales[scale_index])
        await safe_answer_callback(callback, f"📊 Шкала установлена: {scale_text}")


async def show_admins_management(message: types.Message):
    """Показать управление админами"""
    chat_id = message.chat.id
    topic_id = message.message_thread_id or 0
    
    config = group_config_service.get_group_config(chat_id, topic_id)
    if not config:
        await safe_send_message(
            message.answer,
            "❌ Конфигурация группы не найдена."
        )
        return
    
    admins_text = "👑 Текущие админы:\n" + "\n".join(f"• {admin}" for admin in config.admins)
    await safe_send_message(message.answer, admins_text)


async def show_full_day_summary(msg: types.Message):
    """Показать итоги дня"""
    logger.info(f"SHOW_FULL_DAY_SUMMARY: chat_id={msg.chat.id}, topic_id={msg.message_thread_id or 0}")
    
    chat_id = msg.chat.id
    topic_id = msg.message_thread_id or 0
    
    today_history = group_config_service.get_today_history(chat_id, topic_id)
    logger.info(f"SHOW_FULL_DAY_SUMMARY: Found {len(today_history) if today_history else 0} tasks for today")
    
    if not today_history:
        logger.info("SHOW_FULL_DAY_SUMMARY: No tasks for today")
        await safe_send_message(msg.answer, "📭 За сегодня ещё не было задач.")
        return

    # Создаем временную сессию с историей за сегодня
    session = session_service.get_session(chat_id, topic_id)
    temp_session = session
    temp_session.history = today_history
    
    # Создаем и отправляем только файл с результатами
    from utils import generate_voting_results_file
    import tempfile
    import os
    
    results_text = generate_voting_results_file(temp_session)
    if results_text:
        # Создаем временный файл
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', suffix='.txt', delete=False) as f:
            f.write(results_text)
            temp_file_path = f.name
        
        try:
            # Отправляем файл
            file_input = FSInputFile(temp_file_path, filename=f"daily_summary_{datetime.now().strftime('%Y%m%d_%H%M')}.txt")
            await msg.answer_document(file_input, caption="📊 Итоги дня")
        finally:
            # Удаляем временный файл
            os.unlink(temp_file_path)


@router.callback_query(F.data.startswith("stats:"))
async def handle_stats(callback: CallbackQuery):
    """Обработка статистики"""
    await safe_answer_callback(callback, "✅")

    if not callback.message or not callback.from_user:
        return
    
    chat_id = callback.message.chat.id
    topic_id = callback.message.message_thread_id or 0
    
    if not is_allowed_chat(chat_id, topic_id):
        return
    
    if not is_admin(callback.from_user, chat_id, topic_id):
        return

    action = callback.data.split(":")[1] if callback.data else ""
    session = session_service.get_session(chat_id, topic_id)

    if action == "today":
        today_history = group_config_service.get_today_history(chat_id, topic_id)
        if today_history:
            # Создаем временную сессию с историей за сегодня
            temp_session = session
            temp_session.history = today_history
            
            # Создаем и отправляем только файл с результатами
            from utils import generate_voting_results_file
            import tempfile
            import os
            
            results_text = generate_voting_results_file(temp_session)
            if results_text:
                # Создаем временный файл
                with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', suffix='.txt', delete=False) as f:
                    f.write(results_text)
                    temp_file_path = f.name
                
                try:
                    # Отправляем файл
                    file_input = FSInputFile(temp_file_path, filename=f"daily_summary_{datetime.now().strftime('%Y%m%d_%H%M')}.txt")
                    await callback.message.answer_document(file_input, caption="📊 Итоги дня")
                finally:
                    # Удаляем временный файл
                    os.unlink(temp_file_path)
        else:
            try:
                await callback.message.edit_text("📭 За сегодня ещё не было задач.")
            except Exception as e:
                logger.warning(f"Failed to edit message: {e}")
                await safe_send_message(callback.message.answer, "📭 За сегодня ещё не было задач.")

    elif action == "last_session":
        if session.last_batch:
            lines = ["📈 СТАТИСТИКА ЗА ПОСЛЕДНЕЕ ГОЛОСОВАНИЕ", "=" * 35]
            total_sp = 0
            for h in session.last_batch:
                max_vote = 0
                for vote_value in h['votes'].values():
                    try:
                        max_vote = max(max_vote, int(vote_value))
                    except ValueError:
                        pass
                total_sp += max_vote
            lines.append(f"📊 Всего задач: {len(session.last_batch)}")
            lines.append(f"📈 Всего SP: {total_sp}")
            lines.append(f"📉 Среднее SP на задачу: {total_sp/len(session.last_batch):.1f}")
            try:
                await callback.message.edit_text("\n".join(lines))
            except Exception as e:
                logger.warning(f"Failed to edit message: {e}")
                await safe_send_message(callback.message.answer, "\n".join(lines))
        else:
            try:
                await callback.message.edit_text("📭 Последнее голосование ещё не проводилось.")
            except Exception as e:
                logger.warning(f"Failed to edit message: {e}")
                await safe_send_message(callback.message.answer, "📭 Последнее голосование ещё не проводилось.")

    elif action == "participants":
        participants = list(session.participants.values())
        stats = format_participant_stats(participants, session.history)
        try:
            await callback.message.edit_text(stats)
        except Exception as e:
            logger.warning(f"Failed to edit message: {e}")
            await safe_send_message(callback.message.answer, stats)

    elif action == "averages":
        stats = format_average_estimates(session.history)
        try:
            await callback.message.edit_text(stats)
        except Exception as e:
            logger.warning(f"Failed to edit message: {e}")
            await safe_send_message(callback.message.answer, stats)


@router.callback_query(F.data.startswith("help:"))
async def handle_help(callback: CallbackQuery):
    """Обработка помощи"""
    await safe_answer_callback(callback, "✅")

    if not callback.message or not callback.from_user:
        return
    
    chat_id = callback.message.chat.id
    topic_id = callback.message.message_thread_id or 0
    
    if not is_allowed_chat(chat_id, topic_id):
        return

    action = callback.data.split(":")[1] if callback.data else ""

    if action == "commands":
        text = (
            "📖 ОСНОВНЫЕ КОМАНДЫ\n\n"
            "• `/start` - показать справку\n"
            "• `/menu` - показать главное меню\n"
            "• `/join magic_token` - присоединиться к сессии\n"
            "• `/help` - показать эту справку\n\n"
            "🎯 Для участников:\n"
            "• Нажмите на кнопки с числами для голосования\n"
            "• Можете изменить голос в любой момент\n\n"
            "👑 Для админов:\n"
            "• Управление сессиями через меню\n"
            "• Настройка таймаутов и шкал\n"
            "• Просмотр статистики\n"
            "• Генерация новых токенов для группы"
        )
        try:
            await callback.message.edit_text(text)
        except Exception as e:
            logger.warning(f"Failed to edit message: {e}")
            await safe_send_message(callback.message.answer, text)

    elif action == "howto":
        text = (
            "🎮 КАК ИГРАТЬ В PLANNING POKER\n\n"
            "1️⃣ Админ создает список задач\n"
            "2️⃣ Участники присоединяются через `/join magic_token`\n"
            "3️⃣ Голосуем по каждой задаче\n"
            "4️⃣ Обсуждаем расхождения в оценках\n"
            "5️⃣ Приходим к консенсусу\n"
            "6️⃣ Переходим к следующей задаче\n\n"
            "💡 Советы:\n"
            "• Не обсуждайте оценки до голосования\n"
            "• Используйте шкалу Фибоначчи (1,2,3,5,8,13...)\n"
            "• Если оценки сильно различаются - обсудите задачу\n"
            "• Админ может генерировать новые токены для группы"
        )
        try:
            await callback.message.edit_text(text)
        except Exception as e:
            logger.warning(f"Failed to edit message: {e}")
            await safe_send_message(callback.message.answer, text)

    elif action == "settings":
        text = (
            "⚙️ НАСТРОЙКИ\n\n"
            "⏱️ Таймауты:\n"
            "• 30 сек - быстрые задачи\n"
            "• 90 сек - стандартные задачи\n"
            "• 180 сек - сложные задачи\n\n"
            "📊 Шкалы оценок:\n"
            "• Классическая: 1,2,3,5,8,13\n"
            "• Расширенная: 1,2,3,5,8,13,21\n"
            "• С дробными: 0.5,1,2,3,5,8,13\n"
            "• Степени двойки: 1,2,4,8,16,32"
        )
        try:
            await callback.message.edit_text(text)
        except Exception as e:
            logger.warning(f"Failed to edit message: {e}")
            await safe_send_message(callback.message.answer, text)

    elif action == "admin":
        if not is_admin(callback.from_user, chat_id, topic_id):
            try:
                await callback.message.edit_text("❌ Только для админов")
            except Exception as e:
                logger.warning(f"Failed to edit message: {e}")
                await safe_send_message(callback.message.answer, "❌ Только для админов")
            return
        
        text = (
            "🔧 АДМИНСКИЕ ФУНКЦИИ\n\n"
            "🆕 Список задач:\n"
            "• Создание новой сессии голосования\n"
            "• Формат: одна задача на строку\n\n"
            "👥 Управление участниками:\n"
            "• Просмотр списка участников\n"
            "• Удаление участников\n"
            "• Генерация новых токенов для группы\n\n"
            "⚙️ Настройки:\n"
            "• Изменение таймаутов\n"
            "• Выбор шкалы оценок\n"
            "• Управление админами группы\n\n"
            "📊 Статистика:\n"
            "• Отчеты по сессиям\n"
            "• Аналитика участников\n"
            "• Средние оценки\n\n"
            "🔐 Система доступа:\n"
            "• Хардкод админ: доступ ко всем группам\n"
            "• Групповые админы: только к своей группе\n"
            "• Токены: работают только в своей группе"
        )
        try:
            await callback.message.edit_text(text)
        except Exception as e:
            logger.warning(f"Failed to edit message: {e}")
            await safe_send_message(callback.message.answer, text)


@router.message()
async def unknown_input(msg: types.Message):
    """Обработка неизвестных сообщений"""
    if not msg.from_user:
        return
    
    chat_id = msg.chat.id
    topic_id = msg.message_thread_id or 0
    
    if not is_allowed_chat(chat_id, topic_id):
        return
    
    # Админ может отправлять любые сообщения
    if is_admin(msg.from_user, chat_id, topic_id):
        return
    
    session = session_service.get_session(chat_id, topic_id)
    from domain.value_objects import UserId
    if UserId(msg.from_user.id) not in session.participants:
        await safe_send_message(
            msg.answer,
            "⚠️ Вы не авторизованы. Напишите `/join magic_token` или нажмите /start для инструкций.",
            parse_mode="Markdown"
        )
