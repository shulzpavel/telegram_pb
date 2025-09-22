#!/usr/bin/env python3
"""Planning Poker bot with Jira integration and persistent multi-session support."""

import argparse
import asyncio
from collections import Counter
from copy import deepcopy
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

from aiogram import Bot, Dispatcher, F, Router, types
from aiogram.exceptions import TelegramRetryAfter
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


def _extract_context(entity: Union[types.Message, types.CallbackQuery]) -> Tuple[int, Optional[int]]:
    message = entity.message if isinstance(entity, types.CallbackQuery) else entity
    return message.chat.id, getattr(message, "message_thread_id", None)


def _get_session(entity: Union[types.Message, types.CallbackQuery]) -> Optional[SessionState]:
    chat_id, topic_id = _extract_context(entity)
    if not is_supported_thread(chat_id, topic_id):
        return None
    return store.get_session(chat_id, topic_id)


async def _safe_call(func, *args, **kwargs):
    try:
        return await func(*args, **kwargs)
    except TelegramRetryAfter as exc:
        await asyncio.sleep(exc.retry_after)
        return await func(*args, **kwargs)


def _get_user_role(session: SessionState, user_id: int) -> Optional[UserRole]:
    user = session.participants.get(user_id)
    return user.get("role") if user else None


def _can_vote(session: SessionState, user_id: int) -> bool:
    role = _get_user_role(session, user_id)
    return role in {UserRole.PARTICIPANT, UserRole.LEAD}


def _can_manage(session: SessionState, user_id: int) -> bool:
    role = _get_user_role(session, user_id)
    return role in {UserRole.ADMIN, UserRole.LEAD}


def _current_task(session: SessionState) -> Optional[Dict[str, Any]]:
    if 0 <= session.current_task_index < len(session.tasks_queue):
        return session.tasks_queue[session.current_task_index]
    return None


def _build_vote_keyboard() -> types.InlineKeyboardMarkup:
    rows = [
        [types.InlineKeyboardButton(text=value, callback_data=f"vote:{value}") for value in FIBONACCI_VALUES[i : i + 3]]
        for i in range(0, len(FIBONACCI_VALUES), 3)
    ]
    return types.InlineKeyboardMarkup(inline_keyboard=rows)


def get_main_menu() -> types.InlineKeyboardMarkup:
    return types.InlineKeyboardMarkup(
        inline_keyboard=[
            [
                types.InlineKeyboardButton(text="🆕 Список задач", callback_data="menu:new_task"),
                types.InlineKeyboardButton(text="📋 Итоги дня", callback_data="menu:summary"),
            ],
            [
                types.InlineKeyboardButton(text="👥 Участники", callback_data="menu:show_participants"),
                types.InlineKeyboardButton(text="🚪 Покинуть", callback_data="menu:leave"),
                types.InlineKeyboardButton(text="🗑️ Удалить участника", callback_data="menu:kick_participant"),
            ],
        ]
    )


def get_back_keyboard() -> types.InlineKeyboardMarkup:
    return types.InlineKeyboardMarkup(
        inline_keyboard=[[types.InlineKeyboardButton(text="⬅️ Назад", callback_data="menu:main")]]
    )


async def _send_access_denied(callback: types.CallbackQuery, text: str) -> None:
    await _safe_call(callback.answer, text, show_alert=True)


def _drop_user_votes(session: SessionState, user_id: int) -> None:
    session.votes.pop(user_id, None)
    task = _current_task(session)
    if task:
        task.setdefault("votes", {}).pop(user_id, None)


def _persist() -> None:
    store.save()


def _prepare_task_payload(issue: Dict[str, Any]) -> Dict[str, Any]:
    summary = issue.get("summary") or issue.get("key")
    url = issue.get("url")
    text = f"{summary} {url}".strip()
    return {
        "text": text,
        "jira_key": issue.get("key"),
        "summary": summary,
        "url": url,
        "votes": {},
        "story_points": issue.get("story_points"),
    }


async def _start_next_task(msg: types.Message, session: SessionState) -> None:
    task = _current_task(session)
    if task is None:
        await _finish_batch(msg, session)
        return

    session.votes = task.setdefault("votes", {})
    text = (
        f"📝 Оценка задачи {session.current_task_index + 1}/{len(session.tasks_queue)}:\n\n"
        f"{task['text']}\n\nВыберите вашу оценку:"
    )

    sent = await _safe_call(
        msg.answer,
        text,
        reply_markup=_build_vote_keyboard(),
        disable_web_page_preview=True,
    )
    session.active_vote_message_id = sent.message_id if sent else None
    _persist()


async def _start_voting_session(msg: types.Message, session: SessionState) -> None:
    if not session.tasks_queue:
        await _safe_call(msg.answer, "❌ Нет задач для голосования.")
        return

    session.current_task_index = 0
    session.batch_completed = False
    session.votes.clear()
    await _start_next_task(msg, session)


async def _finish_batch(msg: types.Message, session: SessionState) -> None:
    if not session.tasks_queue:
        await _safe_call(msg.answer, "📭 Список задач пуст. Добавьте задачи и начните заново.")
        return

    completed_tasks: List[Dict[str, Any]] = []
    finished_at = datetime.utcnow().isoformat()

    for task in session.tasks_queue:
        snapshot = deepcopy(task)
        snapshot["completed_at"] = finished_at
        completed_tasks.append(snapshot)

    session.last_batch = completed_tasks
    session.history.extend(deepcopy(completed_tasks))
    session.tasks_queue.clear()
    session.votes.clear()
    session.current_task_index = 0
    session.batch_completed = True
    session.active_vote_message_id = None
    _persist()

    await _show_batch_results(msg, session)


async def _show_batch_results(msg: types.Message, session: SessionState) -> None:
    if not session.last_batch:
        return

    lines = ["📊 Результаты голосования:\n"]
    for index, task in enumerate(session.last_batch, start=1):
        jira_key = task.get("jira_key")
        header = f"{index}. {task['text']}"
        if jira_key:
            header += f" (Jira: {jira_key})"
        lines.append(header)

        votes = task.get("votes", {})
        if votes:
            for user_id, vote in votes.items():
                participant = session.participants.get(user_id, {})
                name = participant.get("name", f"User {user_id}")
                lines.append(f"   - {name}: {vote}")
        lines.append("")

    keyboard = types.InlineKeyboardMarkup(
        inline_keyboard=[
            [types.InlineKeyboardButton(text="🔄 Обновить SP в Jira", callback_data="update_jira_sp")],
            [types.InlineKeyboardButton(text="⬅️ Назад", callback_data="menu:main")],
        ]
    )

    await _safe_call(msg.answer, "\n".join(lines), reply_markup=keyboard)


async def _show_day_summary(msg: types.Message, session: SessionState) -> None:
    if not session.history:
        await _safe_call(
            msg.answer,
            "📭 За сегодня ещё не было задач.",
            reply_markup=get_back_keyboard(),
        )
        return

    output_path = Path("data/day_summary.txt")
    output_path.parent.mkdir(parents=True, exist_ok=True)

    total_sp = 0
    with output_path.open("w", encoding="utf-8") as fh:
        for index, task in enumerate(session.history, start=1):
            fh.write(f"{index}. {task['text']}\n")
            max_vote = 0
            votes = task.get("votes", {})
            for user_id, vote in votes.items():
                participant = session.participants.get(user_id, {})
                name = participant.get("name", f"ID {user_id}")
                fh.write(f"  - {name}: {vote}\n")
                try:
                    max_vote = max(max_vote, int(vote))
                except (TypeError, ValueError):
                    continue
            total_sp += max_vote
            fh.write("\n")
        fh.write(f"Всего SP за день: {total_sp}\n")

    file = types.FSInputFile(str(output_path))
    await _safe_call(msg.answer_document, file, caption="📊 Итоги дня", reply_markup=get_back_keyboard())
    output_path.unlink(missing_ok=True)


def _format_role_label(role: UserRole) -> str:
    return ROLE_TITLES.get(role, ROLE_TITLES[UserRole.PARTICIPANT])


def _resolve_role_by_token(token: str) -> Optional[UserRole]:
    if token == ADMIN_TOKEN:
        return UserRole.ADMIN
    if token == LEAD_TOKEN:
        return UserRole.LEAD
    if token == USER_TOKEN:
        return UserRole.PARTICIPANT
    return None


@router.message(Command("join"))
async def join(msg: types.Message) -> None:
    session = _get_session(msg)
    if session is None:
        return

    if not msg.text:
        await _safe_call(msg.answer, "❌ Использование: /join <токен>")
        return

    args = msg.text.split()
    if len(args) != 2:
        await _safe_call(msg.answer, "❌ Использование: /join <токен>")
        return

    token = args[1]
    role = _resolve_role_by_token(token)
    if role is None:
        await _safe_call(msg.answer, "❌ Неверный токен.")
        return

    user_id = msg.from_user.id
    session.participants[user_id] = {
        "name": msg.from_user.full_name,
        "role": role,
    }

    if role is UserRole.ADMIN:
        _drop_user_votes(session, user_id)

    _persist()
    await _safe_call(msg.answer, f"✅ {msg.from_user.full_name} присоединился как {_format_role_label(role)}.")
    await _safe_call(msg.answer, "📌 Главное меню:", reply_markup=get_main_menu())


@router.callback_query(F.data.startswith("menu:"))
async def handle_menu(callback: types.CallbackQuery) -> None:
    session = _get_session(callback)
    if session is None:
        await callback.answer()
        return

    user_id = callback.from_user.id
    participant = session.participants.get(user_id)
    if not participant:
        await _send_access_denied(callback, "⚠️ Вы не авторизованы. Используйте /join <токен>.")
        return

    if not _can_manage(session, user_id):
        await _send_access_denied(callback, "❌ Только лидеры и администраторы могут управлять сессией.")
        return

    action = callback.data.split(":", maxsplit=1)[1]

    if action == "new_task":
        await _safe_call(callback.message.answer, PROMPT_JQL, reply_markup=get_back_keyboard())

    elif action == "summary":
        await _show_day_summary(callback.message, session)

    elif action == "main":
        await _safe_call(callback.message.answer, "📌 Главное меню:", reply_markup=get_main_menu())

    elif action == "show_participants":
        if not session.participants:
            await _safe_call(
                callback.message.answer,
                "⛔ Участников пока нет.",
                reply_markup=get_back_keyboard(),
            )
        else:
            lines = ["👥 Участники:"]
            for data in session.participants.values():
                lines.append(f"- {data['name']} ({_format_role_label(data['role'])})")
            await _safe_call(
                callback.message.answer,
                "\n".join(lines),
                reply_markup=get_back_keyboard(),
            )

    elif action == "leave":
        if user_id in session.participants:
            session.participants.pop(user_id, None)
            _drop_user_votes(session, user_id)
            _persist()
            await _safe_call(
                callback.message.answer,
                "🚪 Вы покинули сессию.",
                reply_markup=get_back_keyboard(),
            )

    elif action == "kick_participant":
        if not session.participants:
            await _safe_call(
                callback.message.answer,
                "⛔ Участников пока нет.",
                reply_markup=get_back_keyboard(),
            )
            return
        buttons = [
            [
                types.InlineKeyboardButton(
                    text=f"{data['name']} ({_format_role_label(data['role'])})",
                    callback_data=f"kick_user:{uid}",
                )
            ]
            for uid, data in session.participants.items()
        ]
        buttons.append([types.InlineKeyboardButton(text="⬅️ Назад", callback_data="menu:main")])
        keyboard = types.InlineKeyboardMarkup(inline_keyboard=buttons)
        await _safe_call(callback.message.answer, "👤 Выберите участника для удаления:", reply_markup=keyboard)

    await callback.answer()


@router.callback_query(F.data.startswith("kick_user:"))
async def kick_user(callback: types.CallbackQuery) -> None:
    session = _get_session(callback)
    if session is None:
        await callback.answer()
        return

    if not _can_manage(session, callback.from_user.id):
        await _send_access_denied(callback, "❌ Недостаточно прав для удаления участников.")
        return

    try:
        target_id = int(callback.data.split(":", maxsplit=1)[1])
    except ValueError:
        await callback.answer()
        return

    participant = session.participants.pop(target_id, None)
    _drop_user_votes(session, target_id)
    _persist()

    if participant:
        await _safe_call(
            callback.message.answer,
            f"🚫 Участник <b>{participant['name']}</b> удалён из сессии.",
            parse_mode="HTML",
            reply_markup=get_back_keyboard(),
        )
    else:
        await _safe_call(
            callback.message.answer,
            "❌ Участник уже был удалён.",
            reply_markup=get_back_keyboard(),
        )

    await callback.answer()


@router.message(Command("start", "help"))
async def help_command(msg: types.Message) -> None:
    session = _get_session(msg)
    if session is None:
        return

    text = (
        "🤖 Привет! Я бот для планирования задач Planning Poker.\n\n"
        "Роли и токены:\n"
        f"• Участник: `/join {USER_TOKEN}`\n"
        f"• Лидер: `/join {LEAD_TOKEN}`\n"
        f"• Администратор: `/join {ADMIN_TOKEN}`\n\n"
        "Возможности:\n"
        "— 🆕 Добавление задач из Jira по JQL\n"
        "— 📋 Итоги текущего банча\n"
        "— 📊 Итоги дня\n"
        "— 👥 Просмотр участников\n"
        "— 🚪 Покинуть сессию\n"
        "— 🗑️ Удалить участника (лидеры и админы)\n\n"
        "Голосование:\n"
        "• Участники и лидеры голосуют\n"
        "• Администраторы не голосуют\n"
        "• Лидеры управляют сессией"
    )
    await _safe_call(msg.answer, text, parse_mode="Markdown", reply_markup=get_main_menu())


@router.message()
async def handle_text_input(msg: types.Message) -> None:
    session = _get_session(msg)
    if session is None:
        return

    user_id = msg.from_user.id
    if user_id not in session.participants:
        await _safe_call(
            msg.answer,
            "⚠️ Вы не авторизованы. Используйте <code>/join &lt;токен&gt;</code>.",
            parse_mode="HTML",
            reply_markup=get_main_menu(),
        )
        return

    if not _can_manage(session, user_id):
        await _safe_call(
            msg.answer,
            "❌ Только лидеры и администраторы могут добавлять задачи.",
            reply_markup=get_back_keyboard(),
        )
        return

    if not msg.text:
        return

    jira_issues = jira_service.parse_jira_request(msg.text)
    if not jira_issues:
        await _safe_call(
            msg.answer,
            "❌ Не удалось получить задачи из Jira. Проверь JQL и попробуй снова.",
            reply_markup=get_back_keyboard(),
        )
        return

    await _handle_jira_tasks(msg, session, jira_issues)


async def _handle_jira_tasks(
    msg: types.Message,
    session: SessionState,
    jira_issues: List[Dict[str, Any]],
) -> None:
    start_new_session = len(session.tasks_queue) == 0 and _current_task(session) is None

    existing_keys = {
        task.get("jira_key") for task in session.tasks_queue if task.get("jira_key")
    }
    existing_keys.update(
        task.get("jira_key") for task in session.last_batch if task.get("jira_key")
    )

    added = 0
    skipped: List[str] = []

    for issue in jira_issues:
        jira_key = issue.get("key")
        if not jira_key:
            continue
        if jira_key in existing_keys:
            skipped.append(jira_key)
            continue

        task_payload = _prepare_task_payload(issue)
        session.tasks_queue.append(task_payload)
        existing_keys.add(jira_key)
        added += 1

    if added == 0:
        message = "⚠️ Все найденные задачи уже добавлены." if skipped else "❌ По запросу не найдено новых задач."
        await _safe_call(msg.answer, message, reply_markup=get_back_keyboard())
        return

    _persist()

    response = [f"✅ Добавлено {added} задач из Jira."]
    if skipped:
        response.append("⚠️ Пропущены уже добавленные: " + ", ".join(skipped))
    await _safe_call(msg.answer, "\n".join(response), reply_markup=get_back_keyboard())

    if start_new_session:
        await _start_voting_session(msg, session)


@router.callback_query(F.data.startswith("vote:"))
async def handle_vote(callback: types.CallbackQuery) -> None:
    session = _get_session(callback)
    if session is None:
        await callback.answer()
        return

    user_id = callback.from_user.id
    if user_id not in session.participants:
        await _send_access_denied(callback, "❌ Вы не зарегистрированы через /join.")
        return

    if not _can_vote(session, user_id):
        await _send_access_denied(callback, "❌ Администраторы не участвуют в голосовании.")
        return

    value = callback.data.split(":", maxsplit=1)[1]
    session.votes[user_id] = value
    task = _current_task(session)
    if task is not None:
        task.setdefault("votes", {})[user_id] = value
    _persist()

    await callback.answer("✅ Голос учтён!")

    total_voters = len([uid for uid in session.participants if _can_vote(session, uid)])
    if len(session.votes) >= total_voters and total_voters > 0:
        session.current_task_index += 1
        _persist()
        await _start_next_task(callback.message, session)


@router.callback_query(F.data == "update_jira_sp")
async def handle_update_jira_sp(callback: types.CallbackQuery) -> None:
    session = _get_session(callback)
    if session is None:
        await callback.answer()
        return

    if not _can_manage(session, callback.from_user.id):
        await _send_access_denied(callback, "❌ Только лидеры и администраторы могут обновлять SP.")
        return

    if not session.last_batch:
        await _send_access_denied(callback, "❌ Нет результатов для обновления.")
        return

    updated = 0
    for task in session.last_batch:
        jira_key = task.get("jira_key")
        if not jira_key:
            continue

        votes = task.get("votes", {})
        if not votes:
            await _safe_call(
                callback.message.answer,
                f"❌ Нет голосов для задачи {jira_key}.",
                reply_markup=get_back_keyboard(),
            )
            continue

        vote_counts = Counter(votes.values())
        most_common_vote = vote_counts.most_common(1)[0][0]
        try:
            story_points = int(most_common_vote)
        except ValueError:
            await _safe_call(
                callback.message.answer,
                f"❌ Голоса для {jira_key} нельзя преобразовать в число.",
                reply_markup=get_back_keyboard(),
            )
            continue

        if jira_service.update_story_points(jira_key, story_points):
            task["story_points"] = story_points
            updated += 1
            await _safe_call(
                callback.message.answer,
                f"✅ Обновлено SP для {jira_key}: {story_points} points",
                reply_markup=get_back_keyboard(),
            )
        else:
            await _safe_call(
                callback.message.answer,
                f"❌ Не удалось обновить SP для {jira_key}",
                reply_markup=get_back_keyboard(),
            )

    if updated:
        _persist()
        await _safe_call(
            callback.message.answer,
            f"🎉 Обновлено {updated} задач в Jira!",
            reply_markup=get_back_keyboard(),
        )

    await callback.answer()


async def main(use_polling: bool = True) -> None:
    if not BOT_TOKEN:
        raise RuntimeError("BOT_TOKEN не задан. Укажите его в переменных окружения.")

    bot = Bot(token=BOT_TOKEN, parse_mode="HTML")
    dp = Dispatcher(storage=MemoryStorage())
    dp.include_router(router)
    if use_polling:
        print("✅ Bot is polling. Waiting for messages...")
        await dp.start_polling(bot)
    else:
        print("✅ Bot launched without polling (assumed secondary instance). Staying idle...")
        await asyncio.Future()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Planning Poker bot")
    parser.add_argument(
        "--no-poll",
        action="store_true",
        help="Не запускать polling (полезно при дублирующем инстансе под supervisord/systemd)",
    )
    args = parser.parse_args()
    asyncio.run(main(use_polling=not args.no_poll))
