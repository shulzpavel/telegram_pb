"""Callback query handlers."""

import asyncio
from pathlib import Path
from typing import Optional, Tuple

from aiogram import F, Router, types
from aiogram.types import FSInputFile

from app.domain.session import Session
from app.keyboards import (
    build_vote_keyboard,
    get_back_keyboard,
    get_main_menu,
    get_results_keyboard,
)
from app.providers import DIContainer
from app.usecases.show_results import VotingPolicy
from app.utils.audit import audit_log
from app.utils.context import extract_context
from app.utils.telegram import safe_call
from config import UserRole, is_supported_thread

router = Router()

ROLE_TITLES = {
    UserRole.ADMIN: "Администратор",
    UserRole.LEAD: "Лид",
    UserRole.PARTICIPANT: "Участник",
}

_policy = VotingPolicy()


def _busy_key(chat_id: int, topic_id: Optional[int], op: str) -> Tuple[int, Optional[int], str]:
    """Helper to build busy flag key for long operations."""
    return (chat_id, topic_id, op)


def _format_role_label(role: UserRole) -> str:
    """Format role label."""
    return ROLE_TITLES.get(role, ROLE_TITLES[UserRole.PARTICIPANT])


async def _send_access_denied(callback: types.CallbackQuery, text: str, container: DIContainer) -> None:
    """Send access denied message."""
    await container.notifier.answer_callback(
        callback_query_id=callback.id,
        text=text,
        show_alert=True,
    )


@router.callback_query(F.data.startswith("menu:"))
async def handle_menu(callback: types.CallbackQuery, container: DIContainer) -> None:
    """Handle menu callbacks."""
    chat_id, topic_id = extract_context(callback)
    if not is_supported_thread(chat_id, topic_id):
        await callback.answer()
        return

    session = await container.session_repo.get_session(chat_id, topic_id)

    user_id = callback.from_user.id
    participant = session.participants.get(user_id)
    if not participant:
        await _send_access_denied(callback, "⚠️ Вы не авторизованы. Используйте /join <токен>.", container)
        return

    action = callback.data.split(":", maxsplit=1)[1]

    await container.metrics.record_event(
        event="menu_click",
        chat_id=chat_id,
        topic_id=topic_id,
        user_id=user_id,
        payload={"action": action},
    )

    # Для некоторых действий не требуется права управления
    if action not in ["main", "summary", "show_participants", "leave", "last_batch"]:
        if not session.can_manage(user_id):
            await _send_access_denied(
                callback,
                "❌ Только лидеры и администраторы могут управлять сессией.",
                container,
            )
            return

    if action == "new_task":
        PROMPT_JQL = (
            "✏️ Отправь JQL запрос из Jira (например: \n"
            "• key = FLEX-365\n"
            "• project = FLEX ORDER BY created DESC)"
        )
        await container.notifier.send_message(
            chat_id=chat_id,
            text=PROMPT_JQL,
            reply_markup=get_back_keyboard(),
        )

    elif action == "summary":
        await _show_day_summary(callback.message, session, container)

    elif action == "start_voting":
        await _handle_start_voting(callback.message, session, container, user_id=user_id)

    elif action == "main":
        can_manage = session.can_manage(user_id)
        await container.notifier.send_message(
            chat_id=chat_id,
            text="📌 Главное меню:",
            reply_markup=get_main_menu(session, can_manage),
        )

    elif action == "show_participants":
        if not session.participants:
            await container.notifier.send_message(
                chat_id=chat_id,
                text="⛔ Участников пока нет.",
                reply_markup=get_back_keyboard(),
            )
        else:
            lines = ["👥 Участники:"]
            for participant in session.participants.values():
                lines.append(f"- {participant.name} ({_format_role_label(participant.role)})")
            await container.notifier.send_message(
                chat_id=chat_id,
                text="\n".join(lines),
                reply_markup=get_back_keyboard(),
            )

    elif action == "leave":
        if await container.leave_session.execute(chat_id, topic_id, user_id):
            await container.notifier.send_message(
                chat_id=chat_id,
                text="🚪 Вы покинули сессию.",
                reply_markup=get_back_keyboard(),
            )

    elif action == "kick_participant":
        if not session.participants:
            await container.notifier.send_message(
                chat_id=chat_id,
                text="⛔ Участников пока нет.",
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
        await container.notifier.send_message(
            chat_id=chat_id,
            text="👤 Выберите участника для удаления:",
            reply_markup=keyboard,
        )

    elif action == "reset_queue":
        await _handle_reset_queue(callback.message, session, container, user_id)

    elif action == "last_batch":
        batch_results = await container.show_results.get_batch_results(chat_id, topic_id)
        if not batch_results:
            await container.notifier.send_message(
                chat_id=chat_id,
                text="📭 Нет результатов последнего батча.",
                reply_markup=get_back_keyboard(),
            )
        else:
            await _show_batch_results(callback.message, session, container)

    await callback.answer()


async def _handle_reset_queue(msg: types.Message, session: Session, container: DIContainer, user_id: int) -> None:
    """Handle reset queue request with confirmation."""
    if not session.tasks_queue:
        await container.notifier.send_message(
            chat_id=session.chat_id,
            text="❌ Очередь задач пуста, нечего сбрасывать.",
            reply_markup=get_back_keyboard(),
        )
        return

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
    await container.notifier.send_message(
        chat_id=session.chat_id,
        text=confirmation_text,
        reply_markup=keyboard,
    )


@router.callback_query(F.data == "confirm:reset_queue")
async def handle_confirm_reset_queue(callback: types.CallbackQuery, container: DIContainer) -> None:
    """Handle confirmed reset queue action."""
    chat_id, topic_id = extract_context(callback)
    if not is_supported_thread(chat_id, topic_id):
        await callback.answer()
        return

    session = await container.session_repo.get_session(chat_id, topic_id)

    user_id = callback.from_user.id
    participant = session.participants.get(user_id)
    if not participant:
        await _send_access_denied(callback, "⚠️ Вы не авторизованы. Используйте /join <токен>.", container)
        return

    if not session.can_manage(user_id):
        await _send_access_denied(
            callback,
            "❌ Только лидеры и администраторы могут управлять сессией.",
            container,
        )
        return

    if not session.tasks_queue:
        can_manage = session.can_manage(user_id)
        await container.notifier.send_message(
            chat_id=chat_id,
            text="ℹ️ Очередь задач уже пуста, нечего сбрасывать.",
            reply_markup=get_main_menu(session, can_manage),
        )
        await callback.answer("ℹ️ Очередь уже пуста")
        return

    was_voting_active = session.is_voting_active
    active_vote_message_id = session.active_vote_message_id

    task_count = await container.reset_queue.execute(chat_id, topic_id)

    user_name = participant.name if participant else callback.from_user.full_name or f"User {user_id}"
    audit_log(
        action="reset_queue",
        user_id=user_id,
        user_name=user_name,
        chat_id=chat_id,
        topic_id=topic_id,
        extra={"task_count": task_count, "was_voting_active": was_voting_active},
    )

    if was_voting_active and active_vote_message_id:
        await container.notifier.delete_message(chat_id=chat_id, message_id=active_vote_message_id)

    can_manage = session.can_manage(user_id)
    session = await container.session_repo.get_session(chat_id, topic_id)  # Refresh after reset
    message_text = f"✅ Очередь задач сброшена.\n\n📊 Удалено задач: {task_count}\n\nТеперь можно добавить новые задачи."
    if was_voting_active:
        message_text = "⏹️ Голосование остановлено.\n\n" + message_text

    await container.notifier.send_message(
        chat_id=chat_id,
        text=message_text,
        reply_markup=get_main_menu(session, can_manage),
    )
    await callback.answer("✅ Очередь сброшена")


async def _handle_start_voting(msg: types.Message, session: Session, container: DIContainer, user_id: int) -> None:
    """Manually start voting session."""
    if not session.tasks_queue:
        await container.notifier.send_message(
            chat_id=session.chat_id,
            text="❌ Нет задач для голосования.",
            reply_markup=get_back_keyboard(),
        )
        return

    if session.is_voting_active:
        await container.notifier.send_message(
            chat_id=session.chat_id,
            text="ℹ️ Голосование уже запущено.",
            reply_markup=get_back_keyboard(),
        )
        return

    if await container.start_batch.execute(session.chat_id, session.topic_id):
        # Перечитываем session из репозитория после изменений
        session = await container.session_repo.get_session(session.chat_id, session.topic_id)
        await _start_next_task(msg, session, container, user_id=user_id)


@router.callback_query(F.data.startswith("kick_user:"))
async def kick_user(callback: types.CallbackQuery, container: DIContainer) -> None:
    """Handle kick user callback."""
    chat_id, topic_id = extract_context(callback)
    if not is_supported_thread(chat_id, topic_id):
        await callback.answer()
        return

    session = await container.session_repo.get_session(chat_id, topic_id)

    if not session.can_manage(callback.from_user.id):
        await _send_access_denied(callback, "❌ Недостаточно прав для удаления участников.", container)
        return

    try:
        target_id = int(callback.data.split(":", maxsplit=1)[1])
    except ValueError:
        await callback.answer()
        return

    participant = session.participants.get(target_id)
    if await container.leave_session.execute(chat_id, topic_id, target_id):
        if participant:
            await container.notifier.send_message(
                chat_id=chat_id,
                text=f"🚫 Участник <b>{participant.name}</b> удалён из сессии.",
                parse_mode="HTML",
                reply_markup=get_back_keyboard(),
            )
        else:
            await container.notifier.send_message(
                chat_id=chat_id,
                text="❌ Участник уже был удалён.",
                reply_markup=get_back_keyboard(),
            )

    await callback.answer()


@router.callback_query(F.data.startswith("vote:"))
async def handle_vote(callback: types.CallbackQuery, container: DIContainer) -> None:
    """Handle vote callback."""
    chat_id, topic_id = extract_context(callback)
    if not is_supported_thread(chat_id, topic_id):
        await callback.answer()
        return

    session = await container.session_repo.get_session(chat_id, topic_id)

    user_id = callback.from_user.id
    if user_id not in session.participants:
        await _send_access_denied(callback, "❌ Вы не зарегистрированы через /join.", container)
        return

    if not session.can_vote(user_id):
        await _send_access_denied(callback, "❌ Администраторы не участвуют в голосовании.", container)
        return

    value = callback.data.split(":", maxsplit=1)[1]

    await container.metrics.record_event(
        event="vote",
        chat_id=chat_id,
        topic_id=topic_id,
        user_id=user_id,
        payload={"value": value},
    )

    # Обработка "Нужен пересмотр" - только для лидов/админов
    if value == "needs_review":
        if not session.can_manage(user_id):
            await _send_access_denied(
                callback,
                "❌ Только лидеры и администраторы могут запросить пересмотр.",
                container,
            )
            return

        active_msg_id = session.active_vote_message_id
        batch_finished, session = await container.needs_review.execute(chat_id, topic_id, user_id)

        if active_msg_id:
            await container.notifier.delete_message(chat_id=chat_id, message_id=active_msg_id)

        if batch_finished:
            await callback.answer("🔄 Задача возвращена в конец очереди. Завершаем батч.")
            await _finish_batch(callback.message, session, container)
        else:
            await callback.answer("🔄 Задача возвращена в конец очереди для пересмотра")
            await _start_next_task(callback.message, session, container, user_id=user_id)
        return

    # Обычное голосование
    if await container.cast_vote.execute(chat_id, topic_id, user_id, value):
        if value == "skip":
            await callback.answer("⏭️ Голосование пропущено")
        else:
            await callback.answer("✅ Голос учтён!")

        # Обновляем сообщение с задачей
        session = await container.session_repo.get_session(chat_id, topic_id)  # Refresh
        if session.current_task and session.active_vote_message_id:
            await _update_vote_message(session, container, user_id)

        if await container.cast_vote.all_voters_voted(chat_id, topic_id):
            batch_finished, _ = await container.advance_task.execute(chat_id, topic_id)
            session = await container.session_repo.get_session(chat_id, topic_id)
            if batch_finished:
                await _finish_batch(callback.message, session, container)
            else:
                await _start_next_task(callback.message, session, container, user_id=user_id)


async def _update_vote_message(session: Session, container: DIContainer, user_id: int) -> None:
    """Update vote message with current voting status."""
    eligible_voters = [uid for uid in session.participants if session.can_vote(uid)]
    voted_user_ids = set(session.current_task.votes.keys())
    waiting_user_ids = [uid for uid in eligible_voters if uid not in voted_user_ids]

    voted_names = [session.participants[uid].name for uid in voted_user_ids if uid in session.participants]
    waiting_names = [session.participants[uid].name for uid in waiting_user_ids if uid in session.participants]

    text_parts = [
        f"📝 Оценка задачи {session.current_task_index + 1}/{len(session.tasks_queue)}:\n",
        f"{session.current_task.text}\n",
    ]

    if voted_names:
        text_parts.append(f"✅ Проголосовали: {', '.join(voted_names)}")

    if waiting_names:
        text_parts.append(f"⏳ Ждём: {', '.join(waiting_names)}")

    text_parts.append("\nВыберите вашу оценку:")
    text = "\n".join(text_parts)

    can_manage = session.can_manage(user_id)
    await container.notifier.edit_message(
        chat_id=session.chat_id,
        message_id=session.active_vote_message_id,
        text=text,
        reply_markup=build_vote_keyboard(can_manage=can_manage),
        disable_web_page_preview=True,
    )


@router.callback_query(F.data.startswith("update_jira_sp"))
async def handle_update_jira_sp(callback: types.CallbackQuery, container: DIContainer) -> None:
    """Handle update Jira story points callback."""
    chat_id, topic_id = extract_context(callback)
    if not is_supported_thread(chat_id, topic_id):
        await callback.answer()
        return

    session = await container.session_repo.get_session(chat_id, topic_id)

    if not session.can_manage(callback.from_user.id):
        await _send_access_denied(callback, "❌ Только лидеры и администраторы могут обновлять SP.", container)
        return

    if not session.last_batch:
        await _send_access_denied(callback, "❌ Нет результатов для обновления.", container)
        return

    await callback.answer()

    busy_key = _busy_key(chat_id, topic_id, "update_sp")
    lock = await container.acquire_busy(busy_key)
    if lock.locked():
        await container.notifier.answer_callback(
            callback_query_id=callback.id, text="⏳ Обновление уже выполняется...", show_alert=False
        )
        return
    await lock.acquire()

    status_msg = None
    try:
        status_msg = await container.notifier.send_message(
            chat_id=chat_id, text="⏳ Обновляю Story Points...", reply_markup=None
        )

        skip_errors = callback.data.endswith(":skip_errors")

        updated, failed, skipped = await container.update_jira_sp.execute(chat_id, topic_id, skip_errors=skip_errors)

        # Обновляем сессию после изменений
        session = await container.session_repo.get_session(chat_id, topic_id)

        try:
            await container.metrics.record_event(
                event="update_jira_sp" + ("_skip_errors" if skip_errors else ""),
                chat_id=chat_id,
                topic_id=topic_id,
                user_id=callback.from_user.id,
                status="ok" if updated else "error" if failed else "ok",
                payload={
                    "updated": updated,
                    "failed": failed,
                    "skipped": skipped,
                },
            )
        except Exception:
            # Игнорируем ошибки метрик
            pass

        participant = session.participants.get(callback.from_user.id)
        user_name = participant.name if participant else callback.from_user.full_name or f"User {callback.from_user.id}"

        jira_keys = [task.jira_key for task in session.last_batch if task.jira_key]
        extra_data = {
            "updated_count": updated,
            "failed_count": len(failed),
            "skipped_count": len(skipped),
            "total_tasks": len(session.last_batch),
            "jira_keys": jira_keys[:10],
        }

        if failed:
            extra_data["failed_keys"] = failed[:10]
        if skipped:
            extra_data["skipped_reasons"] = skipped[:10]

        audit_log(
            action="update_jira_sp" + ("_skip_errors" if skip_errors else ""),
            user_id=callback.from_user.id,
            user_name=user_name,
            chat_id=chat_id,
            topic_id=topic_id,
            extra=extra_data,
        )

        summary_parts = []
        if skip_errors:
            summary_parts.append(f"📊 Обновлено: {updated}")
            if failed:
                summary_parts.append(f"❌ Ошибки: {len(failed)} ({', '.join(failed[:3])}{'...' if len(failed) > 3 else ''})")
            if skipped:
                summary_parts.append(f"⏭️ Пропущено: {len(skipped)}")
        else:
            if updated:
                summary_parts.append(f"✅ Обновлено: {updated}")
            else:
                summary_parts.append(f"❌ Обновлено: 0")
                if failed:
                    summary_parts.append(f"❌ Ошибки: {len(failed)} ({', '.join(failed[:3])}{'...' if len(failed) > 3 else ''})")
                if skipped:
                    summary_parts.append(f"⏭️ Пропущено: {len(skipped)}")

        summary_text = "\n".join(summary_parts)

        if status_msg and hasattr(status_msg, 'message_id'):
            await container.notifier.edit_message(
                chat_id=chat_id,
                message_id=status_msg.message_id,
                text=summary_text,
                reply_markup=get_back_keyboard(),
            )
        else:
            # Fallback: если статусное сообщение не создалось, отправляем итог один раз
            await container.notifier.send_message(
                chat_id=chat_id,
                text=summary_text,
                reply_markup=get_back_keyboard(),
            )

    except Exception as e:
        # Обработка любых исключений
        error_text = "❌ Сервис недоступен. Попробуйте позже."
        
        if status_msg and hasattr(status_msg, 'message_id'):
            try:
                await container.notifier.edit_message(
                    chat_id=chat_id,
                    message_id=status_msg.message_id,
                    text=error_text,
                    reply_markup=get_back_keyboard(),
                )
            except Exception:
                # Если редактирование не удалось, отправляем новое сообщение
                await container.notifier.send_message(
                    chat_id=chat_id,
                    text=error_text,
                    reply_markup=get_back_keyboard(),
                )
        else:
            await container.notifier.send_message(
                chat_id=chat_id,
                text=error_text,
                reply_markup=get_back_keyboard(),
            )
        
        # Логируем ошибку
        print(f"[ERROR] Failed to update Jira SP: {e}")
    finally:
        # Всегда снимаем busy-lock
        lock.release()
        container.release_busy(busy_key)


async def _show_day_summary(msg: types.Message, session: Session, container: DIContainer) -> None:
    """Show day summary."""
    history, total_sp = await container.show_results.get_day_summary(session.chat_id, session.topic_id)
    
    if not history:
        await container.notifier.send_message(
            chat_id=session.chat_id,
            text="📭 За сегодня ещё не было задач.",
            reply_markup=get_back_keyboard(),
        )
        return

    output_path = Path("data/day_summary.txt")
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with output_path.open("w", encoding="utf-8") as fh:
        for index, task in enumerate(history, start=1):
            fh.write(f"{index}. {task.text}\n")
            for user_id, vote in task.votes.items():
                participant = session.participants.get(user_id)
                name = participant.name if participant else f"ID {user_id}"
                if vote == "skip":
                    fh.write(f"  - {name}: ⏭️ Пропущено\n")
                else:
                    fh.write(f"  - {name}: {vote}\n")
            max_vote = _policy.get_max_vote(task.votes)
            fh.write(f"Итог SP: {max_vote}\n")
            fh.write("\n")
        fh.write(f"Всего SP за день: {total_sp}\n")

    file = FSInputFile(str(output_path))
    await container.notifier.send_document(
        chat_id=session.chat_id,
        document=file,
        caption="📊 Итоги дня",
        reply_markup=get_back_keyboard(),
    )
    output_path.unlink(missing_ok=True)


async def _start_next_task(
    msg: types.Message, session: Session, container: DIContainer, user_id: Optional[int] = None
) -> None:
    """Start voting for next task."""
    task = session.current_task
    if task is None:
        await _finish_batch(msg, session, container)
        return

    eligible_voters = [uid for uid in session.participants if session.can_vote(uid)]
    voted_user_ids = set(task.votes.keys())
    waiting_user_ids = [uid for uid in eligible_voters if uid not in voted_user_ids]

    voted_names = [session.participants[uid].name for uid in voted_user_ids if uid in session.participants]
    waiting_names = [session.participants[uid].name for uid in waiting_user_ids if uid in session.participants]

    text_parts = [
        f"📝 Оценка задачи {session.current_task_index + 1}/{len(session.tasks_queue)}:\n",
        f"{task.text}\n",
    ]

    if voted_names:
        text_parts.append(f"✅ Проголосовали: {', '.join(voted_names)}")

    if waiting_names:
        text_parts.append(f"⏳ Ждём: {', '.join(waiting_names)}")

    text_parts.append("\nВыберите вашу оценку:")
    text = "\n".join(text_parts)

    can_manage = user_id is not None and session.can_manage(user_id) if user_id else False
    markup = build_vote_keyboard(can_manage=can_manage)

    if session.active_vote_message_id:
        try:
            edited = await container.notifier.edit_message(
                chat_id=msg.chat.id,
                message_id=session.active_vote_message_id,
                text=text,
                reply_markup=markup,
                disable_web_page_preview=True,
            )
            if edited:
                return
        except Exception:
            # Edit не удался — удаляем старое сообщение, чтобы не дублировать
            try:
                await container.notifier.delete_message(
                    chat_id=msg.chat.id,
                    message_id=session.active_vote_message_id,
                )
            except Exception:
                pass
            session.active_vote_message_id = None
            await container.session_repo.save_session(session)

    sent = await container.notifier.send_message(
        chat_id=msg.chat.id,
        text=text,
        reply_markup=markup,
        disable_web_page_preview=True,
    )
    session.active_vote_message_id = sent.message_id if sent else None
    await container.session_repo.save_session(session)


async def _finish_batch(msg: types.Message, session: Session, container: DIContainer) -> None:
    """Finish current batch."""
    if session.batch_completed:
        return

    if not session.tasks_queue:
        if not session.last_batch:
            await container.notifier.send_message(
                chat_id=session.chat_id,
                text="📭 Список задач пуст. Добавьте задачи и начните заново.",
            )
        return

    completed_tasks = await container.finish_batch.execute(session.chat_id, session.topic_id)

    if completed_tasks:
        session = await container.session_repo.get_session(session.chat_id, session.topic_id)  # Refresh
        await _show_batch_results(msg, session, container)


async def _show_batch_results(msg: types.Message, session: Session, container: DIContainer) -> None:
    """Show batch results."""
    if not session.last_batch:
        return

    # Формируем текстовое сообщение с результатами
    message_parts = ["📊 Результаты голосования:\n"]
    total_sp = 0
    
    for index, task in enumerate(session.last_batch, start=1):
        task_header = f"{index}. {task.text}"
        if task.jira_key:
            task_header += f" ({task.jira_key})"
        message_parts.append(task_header)
        
        # Проголосовавшие
        if task.votes:
            vote_lines = []
            for user_id, vote in task.votes.items():
                participant = session.participants.get(user_id)
                name = participant.name if participant else f"User {user_id}"
                if vote == "skip":
                    vote_lines.append(f"   {name}: ⏭️ Пропущено")
                else:
                    vote_lines.append(f"   {name}: {vote}")
            if vote_lines:
                message_parts.append("   Проголосовало:")
                message_parts.extend(vote_lines)
        
        # Итоговый SP для задачи
        sp = _policy.get_max_vote(task.votes)
        total_sp += sp
        message_parts.append(f"   Итог SP: {sp}\n")
    
    # Добавляем итоговую сумму SP за батч
    message_parts.append(f"\n📈 Сумма SP за батч: {total_sp}")

    # Отправляем текстовое сообщение
    message_text = "\n".join(message_parts)
    
    # Telegram limit: 4096 characters per message
    MAX_MESSAGE_LENGTH = 4000
    if len(message_text) > MAX_MESSAGE_LENGTH:
        # Если сообщение слишком длинное, разбиваем на части
        lines = message_text.split("\n")
        current_message = []
        current_length = 0
        
        for line in lines:
            line_length = len(line) + 1  # +1 for newline
            if current_length + line_length > MAX_MESSAGE_LENGTH and current_message:
                # Отправляем текущее сообщение
                await container.notifier.send_message(
                    chat_id=session.chat_id,
                    text="\n".join(current_message),
                    reply_markup=None,
                )
                # Начинаем новое сообщение
                current_message = [message_parts[0]]  # Заголовок
                current_length = len(current_message[0])
            
            current_message.append(line)
            current_length += line_length
        
        # Отправляем последнее сообщение с клавиатурой
        if current_message:
            await container.notifier.send_message(
                chat_id=session.chat_id,
                text="\n".join(current_message),
                reply_markup=get_results_keyboard(),
            )
    else:
        # Отправляем одно сообщение
        await container.notifier.send_message(
            chat_id=session.chat_id,
            text=message_text,
            reply_markup=get_results_keyboard(),
        )

    # Также создаем файл для детального просмотра
    output_path = Path("data/batch_results.txt")
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with output_path.open("w", encoding="utf-8") as fh:
        for index, task in enumerate(session.last_batch, start=1):
            fh.write(f"{index}. {task.text}\n")
            if task.jira_key:
                fh.write(f"   Jira: {task.jira_key}\n")
            for user_id, vote in task.votes.items():
                participant = session.participants.get(user_id)
                name = participant.name if participant else f"User {user_id}"
                if vote == "skip":
                    fh.write(f"   - {name}: ⏭️ Пропущено\n")
                else:
                    fh.write(f"   - {name}: {vote}\n")
            sp = _policy.get_max_vote(task.votes)
            fh.write(f"   Итог SP: {sp}\n\n")
        fh.write(f"Всего задач: {len(session.last_batch)}\n")
        fh.write(f"Суммарные SP: {total_sp}\n")

    file = FSInputFile(str(output_path))
    caption = f"📄 Детальные результаты батча: {len(session.last_batch)} задач, суммарно SP: {total_sp}"
    await container.notifier.send_document(
        chat_id=session.chat_id,
        document=file,
        caption=caption,
        reply_markup=None,
    )
    output_path.unlink(missing_ok=True)
