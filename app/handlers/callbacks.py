"""Callback query handlers."""

from typing import Optional

from aiogram import F, Router, types

from app.keyboards import get_back_keyboard, get_main_menu, get_results_keyboard
from app.services.session_service import SessionService
from app.services.task_service import TaskService
from app.services.voting_service import VotingService
from app.utils.context import extract_context
from app.utils.telegram import safe_call
from config import STATE_FILE, UserRole, is_supported_thread

router = Router()

ROLE_TITLES = {
    UserRole.ADMIN: "Администратор",
    UserRole.LEAD: "Лид",
    UserRole.PARTICIPANT: "Участник",
}


def _format_role_label(role: UserRole) -> str:
    """Format role label."""
    return ROLE_TITLES.get(role, ROLE_TITLES[UserRole.PARTICIPANT])


async def _send_access_denied(callback: types.CallbackQuery, text: str) -> None:
    """Send access denied message."""
    await safe_call(callback.answer, text, show_alert=True)


@router.callback_query(F.data.startswith("menu:"))
async def handle_menu(callback: types.CallbackQuery) -> None:
    """Handle menu callbacks."""
    chat_id, topic_id = extract_context(callback)
    if not is_supported_thread(chat_id, topic_id):
        await callback.answer()
        return

    session_service = SessionService(STATE_FILE)
    session = session_service.get_session(chat_id, topic_id)

    user_id = callback.from_user.id
    participant = session.participants.get(user_id)
    if not participant:
        await _send_access_denied(callback, "⚠️ Вы не авторизованы. Используйте /join <токен>.")
        return

    action = callback.data.split(":", maxsplit=1)[1]
    
    # Для некоторых действий не требуется права управления
    if action not in ["main", "summary", "show_participants", "leave"]:
        if not session.can_manage(user_id):
            await _send_access_denied(callback, "❌ Только лидеры и администраторы могут управлять сессией.")
            return

    if action == "new_task":
        PROMPT_JQL = (
            "✏️ Отправь JQL запрос из Jira (например: \n"
            "• key = FLEX-365\n"
            "• project = FLEX ORDER BY created DESC)"
        )
        await safe_call(callback.message.answer, PROMPT_JQL, reply_markup=get_back_keyboard())

    elif action == "summary":
        await _show_day_summary(callback.message, session, session_service)

    elif action == "start_voting":
        await _handle_start_voting(callback.message, session, session_service)

    elif action == "main":
        can_manage = session.can_manage(user_id)
        await safe_call(callback.message.answer, "📌 Главное меню:", reply_markup=get_main_menu(session, can_manage))

    elif action == "show_participants":
        if not session.participants:
            await safe_call(
                callback.message.answer,
                "⛔ Участников пока нет.",
                reply_markup=get_back_keyboard(),
            )
        else:
            lines = ["👥 Участники:"]
            for participant in session.participants.values():
                lines.append(f"- {participant.name} ({_format_role_label(participant.role)})")
            await safe_call(
                callback.message.answer,
                "\n".join(lines),
                reply_markup=get_back_keyboard(),
            )

    elif action == "leave":
        if user_id in session.participants:
            session.participants.pop(user_id, None)
            if session.current_task:
                session.current_task.votes.pop(user_id, None)
            session_service.save_session(session)
            await safe_call(
                callback.message.answer,
                "🚪 Вы покинули сессию.",
                reply_markup=get_back_keyboard(),
            )

    elif action == "kick_participant":
        if not session.participants:
            await safe_call(
                callback.message.answer,
                "⛔ Участников пока нет.",
                reply_markup=get_back_keyboard(),
            )
            return
        buttons = [
            [
                types.InlineKeyboardButton(
                    text=f"{p.name} ({_format_role_label(p.role)})",
                    callback_data=f"kick_user:{uid}",
                )
            ]
            for uid, p in session.participants.items()
        ]
        buttons.append([types.InlineKeyboardButton(text="⬅️ Назад", callback_data="menu:main")])
        keyboard = types.InlineKeyboardMarkup(inline_keyboard=buttons)
        await safe_call(callback.message.answer, "👤 Выберите участника для удаления:", reply_markup=keyboard)

    elif action == "reset_queue":
        await _handle_reset_queue(callback.message, session, session_service, user_id)

    await callback.answer()


async def _handle_reset_queue(msg: types.Message, session, session_service, user_id: int) -> None:
    """Handle reset queue request with confirmation."""
    if not session.tasks_queue:
        await safe_call(msg.answer, "❌ Очередь задач пуста, нечего сбрасывать.", reply_markup=get_back_keyboard())
        return
    
    # Показываем подтверждение с количеством задач
    task_count = len(session.tasks_queue)
    confirmation_text = (
        f"⚠️ Вы уверены, что хотите сбросить очередь задач?\n\n"
        f"📊 В очереди: {task_count} {'задача' if task_count == 1 else 'задач' if task_count < 5 else 'задач'}\n\n"
        f"Это действие удалит все задачи из очереди и сбросит текущее голосование.\n"
        f"История голосований сохранится."
    )
    
    keyboard = types.InlineKeyboardMarkup(
        inline_keyboard=[
            [
                types.InlineKeyboardButton(text="✅ Да, сбросить", callback_data="confirm:reset_queue"),
                types.InlineKeyboardButton(text="❌ Отмена", callback_data="menu:main"),
            ]
        ]
    )
    await safe_call(msg.answer, confirmation_text, reply_markup=keyboard)


@router.callback_query(F.data == "confirm:reset_queue")
async def handle_confirm_reset_queue(callback: types.CallbackQuery) -> None:
    """Handle confirmed reset queue action."""
    chat_id, topic_id = extract_context(callback)
    if not is_supported_thread(chat_id, topic_id):
        await callback.answer()
        return

    session_service = SessionService(STATE_FILE)
    session = session_service.get_session(chat_id, topic_id)

    user_id = callback.from_user.id
    participant = session.participants.get(user_id)
    if not participant:
        await _send_access_denied(callback, "⚠️ Вы не авторизованы. Используйте /join <токен>.")
        return

    if not session.can_manage(user_id):
        await _send_access_denied(callback, "❌ Только лидеры и администраторы могут управлять сессией.")
        return

    # Защита от повторного сброса (если очередь уже пуста)
    if not session.tasks_queue:
        can_manage = session.can_manage(user_id)
        await safe_call(
            callback.message.answer,
            "ℹ️ Очередь задач уже пуста, нечего сбрасывать.",
            reply_markup=get_main_menu(session, can_manage),
        )
        await callback.answer("ℹ️ Очередь уже пуста")
        return

    # Проверяем, было ли активное голосование
    was_voting_active = session.is_voting_active
    active_vote_message_id = session.active_vote_message_id

    # Сбрасываем очередь
    task_count = len(session.tasks_queue)
    TaskService.reset_tasks_queue(session)
    session_service.save_session(session)

    # Уведомляем о прекращении голосования, если оно было активно
    if was_voting_active and active_vote_message_id:
        try:
            await safe_call(
                callback.message.bot.edit_message_text,
                chat_id=chat_id,
                message_id=active_vote_message_id,
                text="⏹️ Голосование остановлено. Очередь задач сброшена.",
            )
        except Exception:
            # Игнорируем ошибки редактирования (сообщение может быть уже удалено)
            pass

    can_manage = session.can_manage(user_id)
    message_text = f"✅ Очередь задач сброшена.\n\n📊 Удалено задач: {task_count}\n\nТеперь можно добавить новые задачи."
    if was_voting_active:
        message_text = "⏹️ Голосование остановлено.\n\n" + message_text
    
    await safe_call(
        callback.message.answer,
        message_text,
        reply_markup=get_main_menu(session, can_manage),
    )
    await callback.answer("✅ Очередь сброшена")

async def _handle_start_voting(msg: types.Message, session, session_service) -> None:
    """Manually start voting session."""
    if not session.tasks_queue:
        await safe_call(msg.answer, "❌ Нет задач для голосования.", reply_markup=get_back_keyboard())
        return

    if session.is_voting_active:
        await safe_call(
            msg.answer,
            "ℹ️ Голосование уже запущено.",
            reply_markup=get_back_keyboard(),
        )
        return

    if TaskService.start_voting_session(session):
        session_service.save_session(session)
        await _start_next_task(msg, session, session_service)


@router.callback_query(F.data.startswith("kick_user:"))
async def kick_user(callback: types.CallbackQuery) -> None:
    """Handle kick user callback."""
    chat_id, topic_id = extract_context(callback)
    if not is_supported_thread(chat_id, topic_id):
        await callback.answer()
        return

    session_service = SessionService(STATE_FILE)
    session = session_service.get_session(chat_id, topic_id)

    if not session.can_manage(callback.from_user.id):
        await _send_access_denied(callback, "❌ Недостаточно прав для удаления участников.")
        return

    try:
        target_id = int(callback.data.split(":", maxsplit=1)[1])
    except ValueError:
        await callback.answer()
        return

    participant = session.participants.pop(target_id, None)
    if session.current_task:
        session.current_task.votes.pop(target_id, None)
    session_service.save_session(session)

    if participant:
        await safe_call(
            callback.message.answer,
            f"🚫 Участник <b>{participant.name}</b> удалён из сессии.",
            parse_mode="HTML",
            reply_markup=get_back_keyboard(),
        )
    else:
        await safe_call(
            callback.message.answer,
            "❌ Участник уже был удалён.",
            reply_markup=get_back_keyboard(),
        )

    await callback.answer()


@router.callback_query(F.data.startswith("vote:"))
async def handle_vote(callback: types.CallbackQuery) -> None:
    """Handle vote callback."""
    chat_id, topic_id = extract_context(callback)
    if not is_supported_thread(chat_id, topic_id):
        await callback.answer()
        return

    session_service = SessionService(STATE_FILE)
    session = session_service.get_session(chat_id, topic_id)

    user_id = callback.from_user.id
    if user_id not in session.participants:
        await _send_access_denied(callback, "❌ Вы не зарегистрированы через /join.")
        return

    if not session.can_vote(user_id):
        await _send_access_denied(callback, "❌ Администраторы не участвуют в голосовании.")
        return

    value = callback.data.split(":", maxsplit=1)[1]
    if session.current_task:
        session.current_task.votes[user_id] = value
    session_service.save_session(session)

    if value == "skip":
        await callback.answer("⏭️ Голосование пропущено")
    else:
        await callback.answer("✅ Голос учтён!")

    if VotingService.all_voters_voted(session):
        TaskService.move_to_next_task(session)
        session_service.save_session(session)
        await _start_next_task(callback.message, session, session_service)


@router.callback_query(F.data == "update_jira_sp")
async def handle_update_jira_sp(callback: types.CallbackQuery) -> None:
    """Handle update Jira story points callback."""
    chat_id, topic_id = extract_context(callback)
    if not is_supported_thread(chat_id, topic_id):
        await callback.answer()
        return

    session_service = SessionService(STATE_FILE)
    session = session_service.get_session(chat_id, topic_id)

    if not session.can_manage(callback.from_user.id):
        await _send_access_denied(callback, "❌ Только лидеры и администраторы могут обновлять SP.")
        return

    if not session.last_batch:
        await _send_access_denied(callback, "❌ Нет результатов для обновления.")
        return

    from jira_service import jira_service

    updated = 0
    for task in session.last_batch:
        if not task.jira_key:
            continue

        if not task.votes:
            await safe_call(
                callback.message.answer,
                f"❌ Нет голосов для задачи {task.jira_key}.",
                reply_markup=get_back_keyboard(),
            )
            continue

        story_points = VotingService.get_max_vote(task.votes)
        if story_points == 0:
            await safe_call(
                callback.message.answer,
                f"❌ Голоса для {task.jira_key} нельзя преобразовать в число.",
                reply_markup=get_back_keyboard(),
            )
            continue

        from jira_service import jira_service
        if await jira_service.update_story_points(task.jira_key, story_points):
            task.story_points = story_points
            updated += 1
            await safe_call(
                callback.message.answer,
                f"✅ Обновлено SP для {task.jira_key}: {story_points} points",
                reply_markup=get_back_keyboard(),
            )
        else:
            await safe_call(
                callback.message.answer,
                f"❌ Не удалось обновить SP для {task.jira_key}",
                reply_markup=get_back_keyboard(),
            )

    if updated:
        session_service.save_session(session)
        await safe_call(
            callback.message.answer,
            f"🎉 Обновлено {updated} задач в Jira!",
            reply_markup=get_back_keyboard(),
        )

    await callback.answer()


async def _show_day_summary(msg: types.Message, session, session_service) -> None:
    """Show day summary."""
    if not session.history:
        await safe_call(
            msg.answer,
            "📭 За сегодня ещё не было задач.",
            reply_markup=get_back_keyboard(),
        )
        return

    from pathlib import Path

    output_path = Path("data/day_summary.txt")
    output_path.parent.mkdir(parents=True, exist_ok=True)

    total_sp = 0
    with output_path.open("w", encoding="utf-8") as fh:
        for index, task in enumerate(session.history, start=1):
            fh.write(f"{index}. {task.text}\n")
            for user_id, vote in task.votes.items():
                participant = session.participants.get(user_id)
                name = participant.name if participant else f"ID {user_id}"
                if vote == "skip":
                    fh.write(f"  - {name}: ⏭️ Пропущено\n")
                else:
                    fh.write(f"  - {name}: {vote}\n")
            max_vote = VotingService.get_max_vote(task.votes)
            total_sp += max_vote
            fh.write("\n")
        fh.write(f"Всего SP за день: {total_sp}\n")

    file = types.FSInputFile(str(output_path))
    await safe_call(msg.answer_document, file, caption="📊 Итоги дня", reply_markup=get_back_keyboard())
    output_path.unlink(missing_ok=True)


async def _start_next_task(msg: types.Message, session, session_service) -> None:
    """Start voting for next task."""
    task = session.current_task
    if task is None:
        await _finish_batch(msg, session, session_service)
        return

    text = (
        f"📝 Оценка задачи {session.current_task_index + 1}/{len(session.tasks_queue)}:\n\n"
        f"{task.text}\n\nВыберите вашу оценку:"
    )

    from app.keyboards import build_vote_keyboard

    sent = await safe_call(
        msg.answer,
        text,
        reply_markup=build_vote_keyboard(),
        disable_web_page_preview=True,
    )
    session.active_vote_message_id = sent.message_id if sent else None
    session_service.save_session(session)


async def _finish_batch(msg: types.Message, session, session_service) -> None:
    """Finish current batch."""
    if not session.tasks_queue:
        await safe_call(msg.answer, "📭 Список задач пуст. Добавьте задачи и начните заново.")
        return

    completed_tasks = VotingService.finish_batch(session)
    session_service.save_session(session)

    await _show_batch_results(msg, session)


async def _show_batch_results(msg: types.Message, session) -> None:
    """Show batch results."""
    if not session.last_batch:
        return

    lines = ["📊 Результаты голосования:\n"]
    for index, task in enumerate(session.last_batch, start=1):
        header = f"{index}. {task.text}"
        if task.jira_key:
            header += f" (Jira: {task.jira_key})"
        lines.append(header)

        if task.votes:
            for user_id, vote in task.votes.items():
                participant = session.participants.get(user_id)
                name = participant.name if participant else f"User {user_id}"
                if vote == "skip":
                    lines.append(f"   - {name}: ⏭️ Пропущено")
                else:
                    lines.append(f"   - {name}: {vote}")
        lines.append("")

    await safe_call(msg.answer, "\n".join(lines), reply_markup=get_results_keyboard())
