#!/usr/bin/env python3
"""Planning Poker bot with Jira integration and persistent multi-session support."""

import argparse
import asyncio
import logging
import sys
from collections import Counter
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

from aiogram import Bot, Dispatcher, F, Router, types
from aiogram.exceptions import TelegramBadRequest, TelegramRetryAfter
from aiogram.filters import Command
from aiogram.fsm.storage.memory import MemoryStorage

from config import (
    ADMIN_TOKEN,
    BOT_TOKEN,
    LEAD_TOKEN,
    STATE_FILE,
    USER_TOKEN,
    UserRole,
    is_supported_thread,
)
from jira_service import jira_service
from session_store import SessionState, SessionStore

# Настройка логирования
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('bot_debug.log')
    ]
)
logger = logging.getLogger(__name__)

router = Router()
store = SessionStore(STATE_FILE)

FIBONACCI_VALUES = ["1", "2", "3", "5", "8", "13"]
ROLE_TITLES = {
    UserRole.ADMIN: "Администратор",
    UserRole.LEAD: "Лид",
    UserRole.PARTICIPANT: "Участник",
}
PROMPT_JQL = (
    "✏️ Отправь JQL запрос из Jira (например: \n"
    "• key = FLEX-365\n"
    "• project = FLEX ORDER BY created DESC)"
)


def _format_vote_text(task: Dict[str, Any]) -> str:
    url = task.get('url', '')
    link_line = f"Ссылка: {url}\n\n" if url else ""
    return (
        "🎯 Голосование за задачу:\n\n"
        f"{task['jira_key']} — {task['summary']}\n"
        f"{link_line}"
        "Выберите оценку:"
    )


async def _start_voting_for_current_task(message: types.Message, session: SessionState, intro: Optional[str] = None) -> None:
    if not session.tasks_queue:
        await _safe_call_async(message.edit_text, "❌ В очереди нет задач.", reply_markup=get_session_keyboard())
        return

    task = session.tasks_queue[session.current_task_index]
    text = f"{intro}\n\n" if intro else ""
    text += _format_vote_text(task)
    await _safe_call_async(message.edit_text, text, reply_markup=get_voting_keyboard())


async def _send_batch_report(message: types.Message, session: SessionState) -> None:
    if not session.last_batch:
        return

    report_lines: List[str] = []
    total_sp = 0
    for index, task in enumerate(session.last_batch, 1):
        summary = task.get('summary', '')
        key = task.get('jira_key', 'UNKNOWN')
        story_points = task.get('story_points') or 0
        total_sp += story_points if isinstance(story_points, (int, float)) else 0
        report_lines.append(f"{index}. {key} — {summary} ({story_points} SP)")
        votes = task.get('votes', {})
        for user_id, vote in votes.items():
            participant = session.participants.get(user_id, {})
            name = participant.get('name', f'ID {user_id}')
            report_lines.append(f"   - {name}: {vote}")
        report_lines.append("")

    report_lines.append(f"Всего Story Points: {total_sp}")

    reports_dir = Path("data")
    reports_dir.mkdir(parents=True, exist_ok=True)
    report_path = reports_dir / f"summary_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
    report_path.write_text("\n".join(report_lines), encoding="utf-8")

    document = types.FSInputFile(str(report_path))
    await _safe_call_async(message.answer_document, document, caption="📄 Итоги банча")
    report_path.unlink(missing_ok=True)


def _is_same_day(timestamp: Optional[str], target: datetime.date) -> bool:
    if not timestamp:
        return False
    try:
        dt = datetime.fromisoformat(timestamp)
    except ValueError:
        return False
    return dt.date() == target


def _extract_context(entity: Union[types.Message, types.CallbackQuery]) -> Tuple[int, Optional[int]]:
    message = entity.message if isinstance(entity, types.CallbackQuery) else entity
    logger.debug(f"Extracting context from {type(entity).__name__}: chat_id={message.chat.id}, thread_id={getattr(message, 'message_thread_id', None)}")
    return message.chat.id, getattr(message, "message_thread_id", None)


def _get_session(entity: Union[types.Message, types.CallbackQuery]) -> Optional[SessionState]:
    chat_id, thread_id = _extract_context(entity)
    logger.debug(f"Getting session for chat_id={chat_id}, thread_id={thread_id}")
    
    session = store.get_session(chat_id, thread_id)
    if session:
        logger.debug(f"Found session: {session}")
    else:
        logger.debug("No session found")
    return session


def _get_user_role(session: SessionState, user_id: int) -> Optional[UserRole]:
    """Получить роль пользователя из сессии."""
    if user_id in session.participants:
        return session.participants[user_id]["role"]
    return None


def _add_participant(session: SessionState, user_id: int, name: str, role: UserRole) -> None:
    """Добавить участника в сессию."""
    session.participants[user_id] = {"name": name, "role": role}
    store.save_session(session)
    logger.debug(f"Added participant {user_id} with role {role}")


def _safe_call(func, *args, **kwargs):
    """Безопасный вызов функции с логированием."""
    try:
        logger.debug(f"Calling {func.__name__} with args={args}, kwargs={kwargs}")
        result = func(*args, **kwargs)
        logger.debug(f"Function {func.__name__} completed successfully")
        return result
    except Exception as e:
        logger.error(f"Error in {func.__name__}: {e}")
        raise


async def _safe_call_async(func, *args, **kwargs):
    """Безопасный асинхронный вызов функции с логированием."""
    try:
        logger.debug(f"Calling async {func.__name__} with args={args}, kwargs={kwargs}")
        result = await func(*args, **kwargs)
        logger.debug(f"Async function {func.__name__} completed successfully")
        return result
    except TelegramBadRequest as e:
        message = getattr(e, "message", "") or str(e)
        if "query is too old" in message.lower():
            logger.warning(f"Ignoring stale callback response: {message}")
            return None
        logger.error(f"TelegramBadRequest in async {func.__name__}: {message}")
        raise
    except Exception as e:
        logger.error(f"Error in async {func.__name__}: {e}")
        raise


def get_main_menu() -> types.InlineKeyboardMarkup:
    """Главное меню бота."""
    logger.debug("Creating main menu")
    keyboard = types.InlineKeyboardMarkup(inline_keyboard=[
        [types.InlineKeyboardButton(text="🎯 Начать сессию", callback_data="start_session")],
        [types.InlineKeyboardButton(text="📊 Итоги дня", callback_data="day_summary")],
        [types.InlineKeyboardButton(text="👥 Участники", callback_data="show_participants")],
        [
            types.InlineKeyboardButton(text="⚙️ Настройки", callback_data="settings"),
            types.InlineKeyboardButton(text="🗑️ Удалить участника", callback_data="menu_kick"),
        ],
        [types.InlineKeyboardButton(text="🚪 Покинуть", callback_data="menu_leave")],
    ])
    logger.debug("Main menu created")
    return keyboard


def get_back_keyboard() -> types.InlineKeyboardMarkup:
    """Кнопка 'Назад'."""
    logger.debug("Creating back keyboard")
    keyboard = types.InlineKeyboardMarkup(inline_keyboard=[
        [types.InlineKeyboardButton(text="⬅️ Назад", callback_data="back_to_main")]
    ])
    logger.debug("Back keyboard created")
    return keyboard


def get_session_keyboard() -> types.InlineKeyboardMarkup:
    """Клавиатура для сессии."""
    logger.debug("Creating session keyboard")
    keyboard = types.InlineKeyboardMarkup(inline_keyboard=[
        [types.InlineKeyboardButton(text="📝 Добавить JQL", callback_data="add_jql")],
        [types.InlineKeyboardButton(text="🎯 Голосовать", callback_data="vote")],
        [types.InlineKeyboardButton(text="📊 Результаты", callback_data="results")],
        [types.InlineKeyboardButton(text="🔄 Сбросить", callback_data="reset_session")],
        [types.InlineKeyboardButton(text="⬅️ Назад", callback_data="back_to_main")]
    ])
    logger.debug("Session keyboard created")
    return keyboard


def get_voting_keyboard() -> types.InlineKeyboardMarkup:
    """Клавиатура для голосования."""
    logger.debug("Creating voting keyboard")
    keyboard = types.InlineKeyboardMarkup(inline_keyboard=[
        [types.InlineKeyboardButton(text=value, callback_data=f"vote_{value}") for value in FIBONACCI_VALUES[:3]],
        [types.InlineKeyboardButton(text=value, callback_data=f"vote_{value}") for value in FIBONACCI_VALUES[3:]],
        [types.InlineKeyboardButton(text="⬅️ Назад", callback_data="back_to_session")]
    ])
    logger.debug("Voting keyboard created")
    return keyboard


def get_results_keyboard() -> types.InlineKeyboardMarkup:
    """Клавиатура для результатов."""
    logger.debug("Creating results keyboard")
    keyboard = types.InlineKeyboardMarkup(inline_keyboard=[
        [types.InlineKeyboardButton(text="✅ Принять", callback_data="accept_results")],
        [types.InlineKeyboardButton(text="🔄 Переголосовать", callback_data="revote")],
        [types.InlineKeyboardButton(text="⬅️ Назад", callback_data="back_to_session")]
    ])
    logger.debug("Results keyboard created")
    return keyboard


@router.message(Command("start"))
async def cmd_start(message: types.Message):
    """Команда /start."""
    logger.info(f"Received /start command from user {message.from_user.id} in chat {message.chat.id}")
    
    chat_id, thread_id = _extract_context(message)
    logger.debug(f"Context: chat_id={chat_id}, thread_id={thread_id}")
    
    if not is_supported_thread(chat_id, thread_id):
        logger.warning(f"Unsupported thread: chat_id={chat_id}, thread_id={thread_id}")
        await _safe_call_async(message.answer, "❌ Этот бот работает только в разрешенных чатах.")
        return
    
    session = _get_session(message)
    user_role = _get_user_role(session, message.from_user.id) if session else None
    
    if user_role:
        logger.info(f"Existing session found with role: {user_role}")
        await _safe_call_async(message.answer, f"👋 Добро пожаловать! Ваша роль: {ROLE_TITLES[user_role]}", reply_markup=get_main_menu())
    else:
        logger.info("No existing session, creating new one")
        await _safe_call_async(message.answer, "👋 Добро пожаловать! Выберите свою роль:", reply_markup=types.InlineKeyboardMarkup(inline_keyboard=[
            [types.InlineKeyboardButton(text="👤 Участник", callback_data="role_participant")],
            [types.InlineKeyboardButton(text="👑 Лид", callback_data="role_lead")],
            [types.InlineKeyboardButton(text="⚙️ Админ", callback_data="role_admin")]
        ]))


@router.message(Command("join"))
async def cmd_join(message: types.Message):
    """Команда /join."""
    logger.info(f"Received /join command from user {message.from_user.id} in chat {message.chat.id}")
    
    chat_id, thread_id = _extract_context(message)
    logger.debug(f"Context: chat_id={chat_id}, thread_id={thread_id}")
    
    if not is_supported_thread(chat_id, thread_id):
        logger.warning(f"Unsupported thread: chat_id={chat_id}, thread_id={thread_id}")
        await _safe_call_async(message.answer, "❌ Этот бот работает только в разрешенных чатах.")
        return
    
    session = _get_session(message)
    user_role = _get_user_role(session, message.from_user.id) if session else None
    
    role_keyboard = types.InlineKeyboardMarkup(inline_keyboard=[
        [types.InlineKeyboardButton(text="👤 Участник", callback_data="role_participant")],
        [types.InlineKeyboardButton(text="👑 Лид", callback_data="role_lead")],
        [types.InlineKeyboardButton(text="⚙️ Админ", callback_data="role_admin")],
    ])

    if user_role:
        logger.info(f"Existing session found with role: {user_role}")
        await _safe_call_async(
            message.answer,
            f"🔄 Текущая роль: {ROLE_TITLES[user_role]}\nВыберите роль, чтобы изменить её:",
            reply_markup=role_keyboard,
        )
    else:
        logger.info("No existing session, creating new one")
        await _safe_call_async(
            message.answer,
            "👋 Присоединяйтесь! Выберите свою роль:",
            reply_markup=role_keyboard,
        )


@router.callback_query(F.data == "role_participant")
async def cb_role_participant(callback: types.CallbackQuery):
    """Выбор роли участника."""
    logger.info(f"User {callback.from_user.id} selected participant role")
    
    session = _get_session(callback)
    _add_participant(
        session,
        callback.from_user.id,
        callback.from_user.full_name or callback.from_user.username or "User",
        UserRole.PARTICIPANT,
    )
    await _safe_call_async(callback.message.edit_text, f"✅ Вы присоединились как {ROLE_TITLES[UserRole.PARTICIPANT]}!", reply_markup=get_main_menu())
    await _safe_call_async(callback.answer)


@router.callback_query(F.data == "role_lead")
async def cb_role_lead(callback: types.CallbackQuery):
    """Выбор роли лида."""
    logger.info(f"User {callback.from_user.id} selected lead role")
    
    session = _get_session(callback)
    _add_participant(
        session,
        callback.from_user.id,
        callback.from_user.full_name or callback.from_user.username or "User",
        UserRole.LEAD,
    )
    await _safe_call_async(callback.message.edit_text, f"✅ Вы присоединились как {ROLE_TITLES[UserRole.LEAD]}!", reply_markup=get_main_menu())
    await _safe_call_async(callback.answer)


@router.callback_query(F.data == "role_admin")
async def cb_role_admin(callback: types.CallbackQuery):
    """Выбор роли админа."""
    logger.info(f"User {callback.from_user.id} selected admin role")
    
    session = _get_session(callback)
    _add_participant(
        session,
        callback.from_user.id,
        callback.from_user.full_name or callback.from_user.username or "User",
        UserRole.ADMIN,
    )
    await _safe_call_async(callback.message.edit_text, f"✅ Вы присоединились как {ROLE_TITLES[UserRole.ADMIN]}!", reply_markup=get_main_menu())
    await _safe_call_async(callback.answer)


@router.callback_query(F.data == "start_session")
async def cb_start_session(callback: types.CallbackQuery):
    """Начать сессию."""
    logger.info(f"User {callback.from_user.id} starting session")
    
    session = _get_session(callback)
    if not session:
        logger.warning("No session found for start_session")
        await _safe_call_async(callback.answer, "❌ Сначала присоединитесь к боту командой /join")
        return
    
    user_role = _get_user_role(session, callback.from_user.id)
    if not user_role:
        logger.warning("User not found in session")
        await _safe_call_async(callback.answer, "❌ Сначала присоединитесь к боту командой /join")
        return
    
    if user_role == UserRole.PARTICIPANT:
        logger.warning("Participant trying to start session")
        await _safe_call_async(callback.answer, "❌ Только лиды и админы могут начинать сессии")
        return
    
    # Очищаем очередь задач и голоса
    session.tasks_queue = []
    session.votes = {}
    session.current_task_index = 0
    session.batch_completed = False
    store.save_session(session)
    logger.info(f"Session started: {session}")
    
    await _safe_call_async(callback.message.edit_text, "🎯 Сессия начата! Добавьте задачи из Jira или начните голосование.", reply_markup=get_session_keyboard())
    await _safe_call_async(callback.answer)


@router.callback_query(F.data == "add_jql")
async def cb_add_jql(callback: types.CallbackQuery):
    """Добавить JQL запрос."""
    logger.info(f"User {callback.from_user.id} adding JQL")
    
    session = _get_session(callback)
    if not session:
        logger.warning("No session found for add_jql")
        await _safe_call_async(callback.answer, "❌ Сначала присоединитесь к боту командой /join")
        return
    
    user_role = _get_user_role(session, callback.from_user.id)
    if not user_role:
        logger.warning("User not found in session")
        await _safe_call_async(callback.answer, "❌ Сначала присоединитесь к боту командой /join")
        return
    
    if user_role == UserRole.PARTICIPANT:
        logger.warning("Participant trying to add JQL")
        await _safe_call_async(callback.answer, "❌ Только лиды и админы могут добавлять задачи")
        return
    
    # Устанавливаем флаг ожидания JQL (используем существующее поле)
    session.active_vote_message_id = -1  # Специальное значение для ожидания JQL
    store.save_session(session)
    logger.info(f"Waiting for JQL: {session}")
    
    await _safe_call_async(callback.message.edit_text, PROMPT_JQL, reply_markup=get_back_keyboard())
    await _safe_call_async(callback.answer)


@router.callback_query(F.data == "confirm_tasks")
async def cb_confirm_tasks(callback: types.CallbackQuery):
    logger.info(f"User {callback.from_user.id} confirmed tasks")

    session = _get_session(callback)
    if not session or not session.pending_tasks:
        logger.warning("No pending tasks to confirm")
        await _safe_call_async(callback.message.edit_text, "⚠️ Нет задач для запуска.", reply_markup=get_session_keyboard())
        await _safe_call_async(callback.answer)
        return

    user_role = _get_user_role(session, callback.from_user.id)
    if user_role not in {UserRole.LEAD, UserRole.ADMIN}:
        logger.warning("User without rights tried to confirm tasks")
        await _safe_call_async(callback.answer, "❌ Только лиды и админы могут запускать голосование")
        return

    existing_keys = {task['jira_key'] for task in session.tasks_queue}
    tasks_added = []
    for issue in session.pending_tasks:
        if issue['key'] in existing_keys:
            continue
        task = {
            "text": f"{issue['summary']} {issue['url']}",
            "jira_key": issue['key'],
            "summary": issue['summary'],
            "url": issue['url'],
            "votes": {},
            "story_points": issue.get('story_points', 0),
        }
        tasks_added.append(task)
        existing_keys.add(issue['key'])

    session.pending_tasks = []

    if not tasks_added:
        logger.warning("Pending tasks are duplicates")
        store.save_session(session)
        await _safe_call_async(callback.message.edit_text, "⚠️ Все найденные задачи уже есть в очереди.", reply_markup=get_session_keyboard())
        await _safe_call_async(callback.answer)
        return

    session.tasks_queue.extend(tasks_added)
    session.current_task_index = 0
    session.last_batch = []
    store.save_session(session)

    intro = "\n".join([f"• {task['jira_key']}: {task['summary']}" for task in tasks_added])
    intro_text = f"✅ В очередь добавлено {len(tasks_added)} задач:\n{intro}"

    await _start_voting_for_current_task(callback.message, session, intro=intro_text)
    await _safe_call_async(callback.answer)


@router.callback_query(F.data == "cancel_tasks")
async def cb_cancel_tasks(callback: types.CallbackQuery):
    logger.info(f"User {callback.from_user.id} cancelled pending tasks")

    session = _get_session(callback)
    if session:
        session.pending_tasks = []
        store.save_session(session)

    await _safe_call_async(callback.message.edit_text, "❌ Добавление задач отменено.", reply_markup=get_session_keyboard())
    await _safe_call_async(callback.answer)


@router.message(F.text)
async def handle_text(message: types.Message):
    """Обработка текстовых сообщений."""
    logger.info(f"Received text message from user {message.from_user.id}: {message.text}")
    
    session = _get_session(message)
    if not session:
        logger.warning("No session found for text message")
        return
    
    # Проверяем, ожидается ли JQL запрос
    if session.active_vote_message_id == -1:
        logger.info(f"Processing JQL query: {message.text}")
        session.active_vote_message_id = None  # Сбрасываем флаг
        
        try:
            issues = jira_service.parse_jira_request(message.text)
            if issues:
                logger.info(f"Found {len(issues)} issues")

                pending = []
                for issue in issues:
                    pending.append(
                        {
                            "key": issue['key'],
                            "summary": issue['summary'],
                            "url": issue['url'],
                            "story_points": issue.get('story_points', 0),
                        }
                    )

                session.pending_tasks = pending
                if not session.tasks_queue:
                    session.last_batch = []
                store.save_session(session)

                issues_text = "\n".join([f"• {item['key']}: {item['summary']}" for item in pending])
                confirm_keyboard = types.InlineKeyboardMarkup(
                    inline_keyboard=[
                        [types.InlineKeyboardButton(text="✅ Да", callback_data="confirm_tasks")],
                        [types.InlineKeyboardButton(text="❌ Нет", callback_data="cancel_tasks")],
                    ]
                )
                await _safe_call_async(
                    message.answer,
                    f"✅ Найдено задач ({len(pending)}):\n{issues_text}\n\nНачать голосование?",
                    reply_markup=confirm_keyboard,
                )
            else:
                logger.warning("No issues found")
                await _safe_call_async(message.answer, "❌ Задачи не найдены. Проверьте JQL запрос.", reply_markup=get_session_keyboard())
        except Exception as e:
            logger.error(f"Error processing JQL: {e}")
            await _safe_call_async(message.answer, f"❌ Ошибка при поиске задач: {e}", reply_markup=get_session_keyboard())
    else:
        logger.debug("Not waiting for JQL, ignoring text message")


@router.callback_query(F.data == "vote")
async def cb_vote(callback: types.CallbackQuery):
    """Начать голосование."""
    logger.info(f"User {callback.from_user.id} starting vote")
    
    session = _get_session(callback)
    if not session:
        logger.warning("No session found for vote")
        await _safe_call_async(callback.answer, "❌ Сначала присоединитесь к боту командой /join")
        return
    
    if not session.tasks_queue:
        logger.warning("No tasks for voting")
        await _safe_call_async(callback.answer, "❌ Сначала добавьте задачи из Jira")
        return

    task = session.tasks_queue[session.current_task_index]
    logger.info(f"Voting started for task: {task['jira_key']}")
    await _start_voting_for_current_task(callback.message, session)
    await _safe_call_async(callback.answer)


@router.callback_query(F.data.startswith("vote_"))
async def cb_vote_value(callback: types.CallbackQuery):
    """Голосование за значение."""
    value = callback.data.split("_")[1]
    logger.info(f"User {callback.from_user.id} voted for {value}")
    
    session = _get_session(callback)
    if not session:
        logger.warning("No session found for vote_value")
        await _safe_call_async(callback.answer, "❌ Сначала присоединитесь к боту командой /join")
        return
    
    if not session.tasks_queue:
        logger.warning("No tasks for voting")
        await _safe_call_async(callback.answer, "❌ Нет задач для голосования")
        return
    
    # Записываем голос за текущую задачу
    task = session.tasks_queue[session.current_task_index]
    task["votes"][callback.from_user.id] = value
    store.save_session(session)
    logger.info(f"Vote recorded: {task['jira_key']} by {callback.from_user.id} = {value}")
    
    await _safe_call_async(callback.answer, f"✅ Ваш голос: {value}")

    eligible_voters = {
        uid for uid, data in session.participants.items()
        if data['role'] in {UserRole.PARTICIPANT, UserRole.LEAD}
    }
    if not eligible_voters:
        eligible_voters = {callback.from_user.id}

    if eligible_voters.issubset(task["votes"].keys()):
        logger.info("All eligible voters have voted; finalizing task")
        vote_counts = Counter(task["votes"].values())
        await _finalize_current_task(callback, session, vote_counts)


@router.callback_query(F.data == "results")
async def cb_results(callback: types.CallbackQuery):
    """Показать результаты."""
    logger.info(f"User {callback.from_user.id} viewing results")
    
    session = _get_session(callback)
    if not session:
        logger.warning("No session found for results")
        await _safe_call_async(callback.answer, "❌ Сначала присоединитесь к боту командой /join")
        return
    
    if not session.tasks_queue:
        logger.warning("No tasks for results")
        await _safe_call_async(callback.answer, "❌ Нет задач для отображения")
        return
    
    task = session.tasks_queue[session.current_task_index]
    votes = task.get("votes", {})
    
    if not votes:
        logger.warning("No votes for current task")
        await _safe_call_async(callback.answer, "❌ Нет голосов для текущей задачи")
        return
    
    vote_counts = Counter(votes.values())
    results_text = f"📊 Результаты голосования за {task['jira_key']}:\n\n"
    for value, count in vote_counts.most_common():
        results_text += f"{value} SP — {count} голос(ов)\n"
    
    logger.info(f"Results: {vote_counts}")
    await _safe_call_async(callback.message.edit_text, results_text, reply_markup=get_results_keyboard())
    await _safe_call_async(callback.answer)


async def _finalize_current_task(callback: types.CallbackQuery, session: SessionState, vote_counts: Counter) -> None:
    """Обновить Story Points и перейти к следующей задаче."""
    task = session.tasks_queue[session.current_task_index]

    final_value = vote_counts.most_common(1)[0][0]
    try:
        final_int = int(final_value)
    except ValueError:
        final_int = int(float(final_value))

    if not jira_service.update_story_points(task['jira_key'], final_int):
        logger.error(f"Failed to update Story Points for {task['jira_key']}")
        await _safe_call_async(
            callback.message.edit_text,
            f"❌ Не удалось обновить Story Points для {task['jira_key']}",
            reply_markup=get_session_keyboard(),
        )
        return

    completed_task = dict(task)
    completed_task['story_points'] = final_int
    completed_task['completed_at'] = datetime.now().isoformat()
    completed_task['votes'] = dict(task.get('votes', {}))
    session.history.append(completed_task)
    session.last_batch.append(completed_task)
    session.tasks_queue.pop(session.current_task_index)

    summary_lines = "\n".join(
        f"{value} SP — {count} голос(ов)" for value, count in vote_counts.most_common()
    )

    store.save_session(session)

    summary_text = (
        f"📊 Итоги голосования за {task['jira_key']}:\n{summary_lines}\n\n"
        f"✅ Story Points обновлены: {task['jira_key']} = {final_int} SP"
    )

    if session.tasks_queue:
        session.current_task_index = 0
        next_task = session.tasks_queue[0]
        message_text = f"{summary_text}\n\n▶️ Следующая задача:\n\n" + _format_vote_text(next_task)
        await _safe_call_async(
            callback.message.edit_text,
            message_text,
            reply_markup=get_voting_keyboard(),
        )
    else:
        message_text = f"{summary_text}\n\n🎉 Все задачи завершены!"
        await _safe_call_async(callback.message.edit_text, message_text, reply_markup=get_main_menu())
        await _send_batch_report(callback.message, session)


@router.callback_query(F.data == "accept_results")
async def cb_accept_results(callback: types.CallbackQuery):
    """Принять результаты вручную."""
    logger.info(f"User {callback.from_user.id} accepting results")

    session = _get_session(callback)
    if not session:
        logger.warning("No session found for accept_results")
        await _safe_call_async(callback.answer, "❌ Сначала присоединитесь к боту командой /join")
        return
    
    user_role = _get_user_role(session, callback.from_user.id)
    if not user_role:
        logger.warning("User not found in session")
        await _safe_call_async(callback.answer, "❌ Сначала присоединитесь к боту командой /join")
        return
    
    if user_role == UserRole.PARTICIPANT:
        logger.warning("Participant trying to accept results")
        await _safe_call_async(callback.answer, "❌ Только лиды и админы могут принимать результаты")
        return
    
    task = session.tasks_queue[session.current_task_index]
    votes = task.get("votes", {})
    vote_counts = Counter(votes.values())
    await _finalize_current_task(callback, session, vote_counts)
    await _safe_call_async(callback.answer)


@router.callback_query(F.data == "revote")
async def cb_revote(callback: types.CallbackQuery):
    """Переголосовать."""
    logger.info(f"User {callback.from_user.id} revoting")
    
    session = _get_session(callback)
    if not session:
        logger.warning("No session found for revote")
        await _safe_call_async(callback.answer, "❌ Сначала присоединитесь к боту командой /join")
        return
    
    user_role = _get_user_role(session, callback.from_user.id)
    if not user_role:
        logger.warning("User not found in session")
        await _safe_call_async(callback.answer, "❌ Сначала присоединитесь к боту командой /join")
        return
    
    if user_role == UserRole.PARTICIPANT:
        logger.warning("Participant trying to revote")
        await _safe_call_async(callback.answer, "❌ Только лиды и админы могут инициировать переголосование")
        return
    
    # Очищаем голоса за текущую задачу
    task = session.tasks_queue[session.current_task_index]
    task["votes"] = {}
    store.save_session(session)
    logger.info(f"Votes cleared for {task['jira_key']}")
    
    await _safe_call_async(callback.message.edit_text, f"🔄 Переголосование за задачу:\n\n**{task['jira_key']}**: {task['summary']}\n\nВыберите оценку:", reply_markup=get_voting_keyboard())
    await _safe_call_async(callback.answer)


@router.callback_query(F.data == "reset_session")
async def cb_reset_session(callback: types.CallbackQuery):
    """Сбросить сессию."""
    logger.info(f"User {callback.from_user.id} resetting session")
    
    session = _get_session(callback)
    if not session:
        logger.warning("No session found for reset_session")
        await _safe_call_async(callback.answer, "❌ Сначала присоединитесь к боту командой /join")
        return
    
    user_role = _get_user_role(session, callback.from_user.id)
    if not user_role:
        logger.warning("User not found in session")
        await _safe_call_async(callback.answer, "❌ Сначала присоединитесь к боту командой /join")
        return
    
    if user_role == UserRole.PARTICIPANT:
        logger.warning("Participant trying to reset session")
        await _safe_call_async(callback.answer, "❌ Только лиды и админы могут сбрасывать сессию")
        return
    
    # Очищаем сессию
    session.tasks_queue = []
    session.votes = {}
    session.current_task_index = 0
    session.batch_completed = False
    session.active_vote_message_id = None
    store.save_session(session)
    logger.info(f"Session reset: {session}")
    
    await _safe_call_async(callback.message.edit_text, "🔄 Сессия сброшена", reply_markup=get_main_menu())
    await _safe_call_async(callback.answer)


@router.callback_query(F.data == "day_summary")
async def cb_day_summary(callback: types.CallbackQuery):
    """Итоги дня."""
    logger.info(f"User {callback.from_user.id} requesting day summary")
    await _safe_call_async(callback.answer)

    session = _get_session(callback)
    if not session:
        logger.warning("No session found for day_summary")
        return

    user_role = _get_user_role(session, callback.from_user.id)
    if not user_role:
        logger.warning("User not found in session")
        return

    if user_role == UserRole.PARTICIPANT:
        logger.warning("Participant trying to get day summary")
        return

    try:
        await _safe_call_async(
            callback.message.edit_text,
            "⏳ Формирую отчёт, пожалуйста подождите...",
            reply_markup=get_back_keyboard(),
        )

        today_date = datetime.now(timezone.utc).astimezone().date()
        jql = "updated >= startOfDay() ORDER BY updated DESC"
        issues = jira_service.parse_jira_request(jql) or []

        if not issues:
            history_candidates = [
                task for task in session.history
                if _is_same_day(task.get('completed_at'), today_date)
            ]
            if history_candidates:
                issues = [
                    {
                        "key": task.get('jira_key', 'UNKNOWN'),
                        "summary": task.get('summary', ''),
                        "url": task.get('url'),
                        "story_points": task.get('story_points', 0),
                    }
                    for task in history_candidates
                ]

        if not issues:
            logger.warning("No issues found for today")
            await _safe_call_async(
                callback.message.edit_text,
                "📊 За сегодня задач не найдено",
                reply_markup=get_back_keyboard(),
            )
            return

        # Создаем отчет
        report_text = f"📊 Итоги дня ({today_date.isoformat()}):\n\n"
        total_story_points = 0

        for issue in issues:
            story_points_raw = issue.get('story_points')
            story_points = story_points_raw if isinstance(story_points_raw, (int, float)) else 0
            total_story_points += story_points
            url = issue.get('url')
            link_text = f" ({url})" if url else ""
            report_text += f"• {issue['key']}: {issue['summary']} ({story_points} SP){link_text}\n"

        report_text += f"\n📈 Всего Story Points: {total_story_points}"

        report_length = len(report_text)
        logger.info(
            f"Day summary: {len(issues)} issues, {total_story_points} total SP, {report_length} chars"
        )

        if report_length <= 4000:
            await _safe_call_async(
                callback.message.edit_text,
                report_text,
                reply_markup=get_back_keyboard(),
            )
        else:
            await _safe_call_async(
                callback.message.edit_text,
                "📊 Итоги дня слишком объёмные — отправляю данные отдельными сообщениями и файлом.",
                reply_markup=get_back_keyboard(),
            )

            def _iter_chunks(text: str, limit: int = 3500):
                chunk = ""
                for line in text.splitlines():
                    addition = f"{line}\n"
                    if len(chunk) + len(addition) > limit and chunk:
                        yield chunk.rstrip()
                        chunk = addition
                    else:
                        chunk += addition
                if chunk:
                    yield chunk.rstrip()

            chunks = list(_iter_chunks(report_text))
            total_chunks = len(chunks)

            for index, chunk in enumerate(chunks, start=1):
                header = (
                    f"📄 Итоги дня {today_date.isoformat()} — часть {index}/{total_chunks}\n\n"
                )
                await _safe_call_async(
                    callback.message.answer,
                    header + chunk,
                )

            reports_dir = Path("data")
            reports_dir.mkdir(parents=True, exist_ok=True)

            report_path = reports_dir / f"day_summary_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
            report_path.write_text(report_text, encoding="utf-8")

            document = types.FSInputFile(str(report_path))
            await _safe_call_async(
                callback.message.answer_document,
                document,
                caption=f"📊 Итоги дня ({today_date.isoformat()})",
            )

            report_path.unlink(missing_ok=True)

    except Exception as e:
        logger.error(f"Error generating day summary: {e}")
        await _safe_call_async(callback.message.edit_text, f"❌ Ошибка при создании отчета: {e}", reply_markup=get_back_keyboard())


@router.callback_query(F.data == "show_participants")
async def cb_show_participants(callback: types.CallbackQuery):
    """Показать участников."""
    logger.info(f"User {callback.from_user.id} viewing participants")
    await _safe_call_async(callback.answer)

    session = _get_session(callback)
    if not session:
        logger.warning("No session found for show_participants")
        return

    if not session.participants:
        logger.warning("No participants found")
        await _safe_call_async(callback.message.edit_text, "👥 Участники не найдены", reply_markup=get_back_keyboard())
        return
    
    participants_text = "👥 Участники:\n\n"
    for user_id, participant_data in session.participants.items():
        participants_text += f"• {participant_data['name']} ({ROLE_TITLES[participant_data['role']]})\n"
    
    logger.info(f"Participants: {len(session.participants)}")
    await _safe_call_async(callback.message.edit_text, participants_text, reply_markup=get_back_keyboard())


@router.callback_query(F.data == "settings")
async def cb_settings(callback: types.CallbackQuery):
    """Настройки."""
    logger.info(f"User {callback.from_user.id} viewing settings")
    await _safe_call_async(callback.answer)
    
    session = _get_session(callback)
    if not session:
        logger.warning("No session found for settings")
        return
    
    user_role = _get_user_role(session, callback.from_user.id)
    if not user_role:
        logger.warning("User not found in session")
        return
    
    settings_text = f"⚙️ Настройки:\n\n"
    settings_text += f"• Роль: {ROLE_TITLES[user_role]}\n"
    settings_text += f"• Чат: {session.chat_id}\n"
    if session.topic_id:
        settings_text += f"• Тред: {session.topic_id}\n"
    
    logger.info(f"Settings: {session}")
    await _safe_call_async(callback.message.edit_text, settings_text, reply_markup=get_back_keyboard())


@router.callback_query(F.data == "menu_kick")
async def cb_menu_kick(callback: types.CallbackQuery):
    """Показать список участников для удаления."""
    logger.info(f"User {callback.from_user.id} requested kick menu")
    await _safe_call_async(callback.answer)

    session = _get_session(callback)
    if not session:
        logger.warning("No session found for menu_kick")
        return

    role = _get_user_role(session, callback.from_user.id)
    if role not in {UserRole.LEAD, UserRole.ADMIN}:
        logger.warning("User without rights tried to open kick menu")
        await _safe_call_async(
            callback.message.edit_text,
            "❌ Только лиды и админы могут удалять участников.",
            reply_markup=get_back_keyboard(),
        )
        return

    if not session.participants:
        logger.info("No participants to remove")
        await _safe_call_async(
            callback.message.edit_text,
            "👥 Участников пока нет.",
            reply_markup=get_back_keyboard(),
        )
        return

    buttons = []
    for uid, data in session.participants.items():
        name = data.get('name', f'ID {uid}')
        buttons.append([
            types.InlineKeyboardButton(text=f"Удалить {name}", callback_data=f"kick_user:{uid}"),
        ])

    buttons.append([types.InlineKeyboardButton(text="⬅️ Назад", callback_data="back_to_main")])

    keyboard = types.InlineKeyboardMarkup(inline_keyboard=buttons)
    await _safe_call_async(
        callback.message.edit_text,
        "👥 Выберите участника для удаления:",
        reply_markup=keyboard,
    )


@router.callback_query(F.data.startswith("kick_user:"))
async def cb_kick_user(callback: types.CallbackQuery):
    """Удалить участника из сессии."""
    await _safe_call_async(callback.answer)

    session = _get_session(callback)
    if not session:
        logger.warning("No session found for kick_user")
        return

    role = _get_user_role(session, callback.from_user.id)
    if role not in {UserRole.LEAD, UserRole.ADMIN}:
        logger.warning("User without rights tried to kick")
        await _safe_call_async(
            callback.message.edit_text,
            "❌ Только лиды и админы могут удалять участников.",
            reply_markup=get_back_keyboard(),
        )
        return

    try:
        target_id = int(callback.data.split(":", 1)[1])
    except (IndexError, ValueError):
        logger.error("Invalid kick_user callback data")
        return

    participant = session.participants.pop(target_id, None)
    if not participant:
        await _safe_call_async(
            callback.message.edit_text,
            "ℹ️ Участник уже был удалён.",
            reply_markup=get_back_keyboard(),
        )
        return

    for task in session.tasks_queue:
        task.get('votes', {}).pop(target_id, None)
    for task in session.history:
        task.get('votes', {}).pop(target_id, None)

    store.save_session(session)
    name = participant.get('name', f'ID {target_id}')

    await _safe_call_async(
        callback.message.edit_text,
        f"🚫 Участник {name} удалён из сессии.",
        reply_markup=get_back_keyboard(),
    )


@router.callback_query(F.data == "menu_leave")
async def cb_menu_leave(callback: types.CallbackQuery):
    """Покинуть сессию."""
    logger.info(f"User {callback.from_user.id} leaving session")
    await _safe_call_async(callback.answer)

    session = _get_session(callback)
    if not session:
        logger.warning("No session found for leave")
        return

    removed = session.participants.pop(callback.from_user.id, None)
    if removed:
        for task in session.tasks_queue:
            task.get('votes', {}).pop(callback.from_user.id, None)
        for task in session.history:
            task.get('votes', {}).pop(callback.from_user.id, None)
        store.save_session(session)
        await _safe_call_async(
            callback.message.edit_text,
            "🚪 Вы покинули сессию. Используйте /join, чтобы вернуться.",
        )
    else:
        await _safe_call_async(
            callback.message.edit_text,
            "ℹ️ Вы не были участником сессии.",
        )


@router.callback_query(F.data == "back_to_main")
async def cb_back_to_main(callback: types.CallbackQuery):
    """Вернуться в главное меню."""
    logger.info(f"User {callback.from_user.id} going back to main menu")
    
    await _safe_call_async(callback.message.edit_text, "📌 Главное меню:", reply_markup=get_main_menu())
    await _safe_call_async(callback.answer)


@router.callback_query(F.data == "back_to_session")
async def cb_back_to_session(callback: types.CallbackQuery):
    """Вернуться в сессию."""
    logger.info(f"User {callback.from_user.id} going back to session")
    
    await _safe_call_async(callback.message.edit_text, "🎯 Сессия:", reply_markup=get_session_keyboard())
    await _safe_call_async(callback.answer)


async def main():
    """Главная функция."""
    logger.info("Starting bot...")
    
    parser = argparse.ArgumentParser(description="Planning Poker Bot")
    parser.add_argument("--no-poll", action="store_true", help="Don't start polling")
    args = parser.parse_args()
    
    logger.info(f"Arguments: {args}")
    
    bot = Bot(token=BOT_TOKEN)
    dp = Dispatcher(storage=MemoryStorage())
    dp.include_router(router)
    
    logger.info("Bot and dispatcher created")
    
    if args.no_poll:
        logger.info("No polling mode - bot will not start polling")
        return
    
    try:
        logger.info("Starting polling...")
        await dp.start_polling(bot)
    except Exception as e:
        logger.error(f"Error during polling: {e}")
        raise
    finally:
        logger.info("Closing bot...")
        await bot.session.close()


if __name__ == "__main__":
    logger.info("Bot script started")
    asyncio.run(main())
