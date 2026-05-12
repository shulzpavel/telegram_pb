"""Lark card action (callback) handlers.

Lark sends card button clicks as HTTP POST to the webhook.
The action value string maps directly to the same action namespace
used in the Telegram transport (e.g. "menu:main", "vote:5").
"""

import asyncio
import logging
from typing import Optional

from app.constants import VALID_VOTE_VALUES
from app.domain.session import Session
from app.providers import DIContainer
from app.transport.lark.keyboards.cards import (
    build_vote_card,
    get_back_card,
    get_confirm_reset_card,
    get_main_menu_card,
    get_results_card,
)
from app.transport.lark.utils.results import show_batch_results_lark
from app.usecases.show_results import VotingPolicy
from app.utils.audit import audit_log
from config import UserRole

logger = logging.getLogger(__name__)
_policy = VotingPolicy()

ROLE_TITLES = {
    UserRole.ADMIN: "Администратор",
    UserRole.LEAD: "Лид",
    UserRole.PARTICIPANT: "Участник",
}


def _busy_key(chat_id: int, op: str) -> tuple:
    return (chat_id, None, op)


async def _deny(chat_id: int, text: str, container: DIContainer) -> None:
    await container.notifier.send_message(
        chat_id=chat_id,
        text=text,
        reply_markup=get_back_card(),
    )


async def dispatch_action(
    chat_id: int,
    user_id: int,
    user_name: str,
    action_value: str,
    message_id: Optional[str],
    container: DIContainer,
) -> None:
    """Route a card button action_value to the correct handler."""
    session = await container.session_repo.get_session(chat_id, None)
    participant = session.participants.get(user_id)

    if not participant:
        await _deny(chat_id, "⚠️ Необходимо авторизоваться — используйте /join <токен>.", container)
        return

    can_manage = session.can_manage(user_id)

    # ── Menu actions ───────────────────────────────────────────────────
    if action_value == "menu:main":
        card = get_main_menu_card(
            has_tasks=bool(session.tasks_queue),
            voting_active=session.is_voting_active,
            has_last_batch=bool(session.last_batch),
            can_manage=can_manage,
        )
        await container.notifier.send_message(chat_id=chat_id, text="📌 Главное меню:", reply_markup=card)

    elif action_value == "menu:new_task":
        if not can_manage:
            await _deny(chat_id, "❌ Только лидеры и администраторы могут загружать задачи.", container)
            return
        await container.notifier.send_message(
            chat_id=chat_id,
            text=(
                "📌 Вставь JQL-запрос из Jira.\n"
                "Примеры:\n• key = FLEX-365\n• issue in linkedIssues(\"BTBMGLBL-348\")\n\n"
                "После отправки бот загрузит задачи."
            ),
            reply_markup=get_back_card(),
        )

    elif action_value == "menu:show_participants":
        if not session.participants:
            await container.notifier.send_message(
                chat_id=chat_id, text="⛔ Участников пока нет.", reply_markup=get_back_card()
            )
        else:
            lines = ["👥 Участники:"]
            for p in session.participants.values():
                lines.append(f"- {p.name} ({ROLE_TITLES.get(p.role, 'Участник')})")
            await container.notifier.send_message(
                chat_id=chat_id, text="\n".join(lines), reply_markup=get_back_card()
            )

    elif action_value == "menu:leave":
        await container.leave_session.execute(chat_id, None, user_id)
        await container.notifier.send_message(
            chat_id=chat_id, text="🚪 Вы покинули сессию.", reply_markup=get_back_card()
        )

    elif action_value == "menu:kick_participant":
        if not can_manage:
            await _deny(chat_id, "❌ Недостаточно прав.", container)
            return
        if not session.participants:
            await container.notifier.send_message(
                chat_id=chat_id, text="⛔ Участников пока нет.", reply_markup=get_back_card()
            )
            return
        lines = ["👤 Выберите участника для удаления:"]
        for uid, p in session.participants.items():
            lines.append(f"/kick_{uid}  — {p.name} ({ROLE_TITLES.get(p.role, '')})")
        await container.notifier.send_message(
            chat_id=chat_id,
            text="\n".join(lines) + "\n\nОтправьте /kick_<user_id> для удаления.",
            reply_markup=get_back_card(),
        )

    elif action_value == "menu:summary":
        await _show_day_summary(chat_id, session, container)

    elif action_value == "menu:start_voting":
        if not can_manage:
            await _deny(chat_id, "❌ Только лидеры и администраторы могут запускать голосование.", container)
            return
        await _handle_start_voting(chat_id, session, container, user_id)

    elif action_value == "menu:continue_voting":
        if session.is_voting_active and session.current_task:
            await _start_next_task(chat_id, session, container, user_id=user_id)
        else:
            await container.notifier.send_message(
                chat_id=chat_id, text="ℹ️ Голосование не активно.", reply_markup=get_back_card()
            )

    elif action_value == "menu:reset_queue":
        if not can_manage:
            await _deny(chat_id, "❌ Только лидеры и администраторы могут сбрасывать очередь.", container)
            return
        if not session.tasks_queue:
            await container.notifier.send_message(
                chat_id=chat_id, text="❌ Очередь задач пуста.", reply_markup=get_back_card()
            )
            return
        card = get_confirm_reset_card(len(session.tasks_queue))
        await container.notifier.send_message(chat_id=chat_id, text="", reply_markup=card)

    elif action_value == "confirm:reset_queue":
        if not can_manage:
            await _deny(chat_id, "❌ Только лидеры и администраторы могут сбрасывать очередь.", container)
            return
        was_voting = session.is_voting_active
        active_msg = session.active_vote_message_id
        task_count = await container.reset_queue.execute(chat_id, None)
        if was_voting and active_msg:
            await container.notifier.delete_message(chat_id=chat_id, message_id=active_msg)
        session = await container.session_repo.get_session(chat_id, None)
        msg = f"✅ Очередь сброшена. Удалено задач: {task_count}"
        if was_voting:
            msg = "⏹️ Голосование остановлено.\n\n" + msg
        card = get_main_menu_card(
            has_tasks=bool(session.tasks_queue),
            voting_active=session.is_voting_active,
            has_last_batch=bool(session.last_batch),
            can_manage=can_manage,
        )
        await container.notifier.send_message(chat_id=chat_id, text=msg, reply_markup=card)

    elif action_value == "menu:last_batch":
        batch = await container.show_results.get_batch_results(chat_id, None)
        if not batch:
            await container.notifier.send_message(
                chat_id=chat_id, text="📭 Нет результатов последнего батча.", reply_markup=get_back_card()
            )
        else:
            session = await container.session_repo.get_session(chat_id, None)
            await show_batch_results_lark(chat_id, session, container)

    # ── Vote actions ───────────────────────────────────────────────────
    elif action_value.startswith("vote:"):
        value = action_value.split(":", maxsplit=1)[1]
        if value not in VALID_VOTE_VALUES:
            await _deny(chat_id, "❌ Неверное значение голоса.", container)
            return
        await _handle_vote(chat_id, user_id, value, message_id, session, container)

    # ── Jira SP update ─────────────────────────────────────────────────
    elif action_value.startswith("update_jira_sp"):
        if not can_manage:
            await _deny(chat_id, "❌ Только лидеры и администраторы могут обновлять SP.", container)
            return
        skip_errors = action_value.endswith(":skip_errors")
        await _handle_update_jira_sp(chat_id, user_id, skip_errors, session, container)

    else:
        logger.warning("Unknown Lark action: %s", action_value)


# ── Voting helpers ─────────────────────────────────────────────────────────


async def _handle_start_voting(chat_id: int, session: Session, container: DIContainer, user_id: int) -> None:
    if not session.tasks_queue:
        await container.notifier.send_message(
            chat_id=chat_id, text="❌ Нет задач для голосования.", reply_markup=get_back_card()
        )
        return
    if session.is_voting_active:
        await container.notifier.send_message(
            chat_id=chat_id,
            text="ℹ️ Голосование уже запущено.",
            reply_markup=get_back_card(),
        )
        return
    if await container.start_batch.execute(chat_id, None):
        session = await container.session_repo.get_session(chat_id, None)
        await _start_next_task(chat_id, session, container, user_id=user_id)


async def _start_next_task(chat_id: int, session: Session, container: DIContainer, user_id: Optional[int] = None) -> None:
    task = session.current_task
    if task is None:
        await _finish_batch(chat_id, session, container)
        return

    can_manage = user_id is not None and session.can_manage(user_id)
    card = build_vote_card(
        task_text=task.text,
        task_index=session.current_task_index + 1,
        total=len(session.tasks_queue),
        can_manage=can_manage,
    )
    sent = await container.notifier.send_message(chat_id=chat_id, text="", reply_markup=card)
    session.active_vote_message_id = sent.message_id if sent else None
    await container.session_repo.save_session(session)


async def _handle_vote(
    chat_id: int,
    user_id: int,
    value: str,
    message_id: Optional[str],
    session: Session,
    container: DIContainer,
) -> None:
    is_manager_action = value in {"skip", "needs_review"}
    if is_manager_action and not session.can_manage(user_id):
        await _deny(chat_id, "❌ Только лидеры и администраторы могут управлять задачей.", container)
        return

    if not is_manager_action and not session.can_vote(user_id):
        await _deny(chat_id, "❌ Администраторы не участвуют в голосовании.", container)
        return

    if not session.is_voting_active:
        await container.notifier.send_message(chat_id=chat_id, text="⏹️ Голосование закрыто.")
        return

    if value == "skip":
        active_msg = session.active_vote_message_id
        batch_finished, _ = await container.advance_task.execute(chat_id, None)
        session = await container.session_repo.get_session(chat_id, None)
        if active_msg:
            await container.notifier.delete_message(chat_id=chat_id, message_id=active_msg)
        if batch_finished:
            await _finish_batch(chat_id, session, container)
        else:
            await _start_next_task(chat_id, session, container, user_id=user_id)
        return

    if value == "needs_review":
        active_msg = session.active_vote_message_id
        batch_finished, session = await container.needs_review.execute(chat_id, None, user_id)
        if active_msg:
            await container.notifier.delete_message(chat_id=chat_id, message_id=active_msg)
        if batch_finished:
            await _finish_batch(chat_id, session, container)
        else:
            await _start_next_task(chat_id, session, container, user_id=user_id)
        return

    if await container.cast_vote.execute(chat_id, None, user_id, value):
        if await container.cast_vote.all_voters_voted(chat_id, None):
            lock = await container.acquire_busy(_busy_key(chat_id, "vote_advance"))
            try:
                async with lock:
                    if not await container.cast_vote.all_voters_voted(chat_id, None):
                        return
                    session = await container.session_repo.get_session(chat_id, None)
                    if not session.current_task:
                        return
                    batch_finished, _ = await container.advance_task.execute(chat_id, None)
                    session = await container.session_repo.get_session(chat_id, None)
                    if batch_finished:
                        await _finish_batch(chat_id, session, container)
                    else:
                        await _start_next_task(chat_id, session, container, user_id=user_id)
            finally:
                container.release_busy(_busy_key(chat_id, "vote_advance"))


async def _finish_batch(chat_id: int, session: Session, container: DIContainer) -> None:
    session = await container.session_repo.get_session(chat_id, None)
    if session.batch_completed:
        return
    if not session.tasks_queue:
        if not session.last_batch:
            await container.notifier.send_message(
                chat_id=chat_id,
                text="📭 Список задач пуст. Добавьте задачи и начните заново.",
            )
        return
    completed = await container.finish_batch.execute(chat_id, None)
    if completed:
        session = await container.session_repo.get_session(chat_id, None)
        await show_batch_results_lark(chat_id, session, container)


async def _handle_update_jira_sp(
    chat_id: int, user_id: int, skip_errors: bool, session: Session, container: DIContainer
) -> None:
    if not session.last_batch:
        await _deny(chat_id, "❌ Нет результатов для обновления.", container)
        return

    busy_key = _busy_key(chat_id, "update_sp")
    lock = await container.acquire_busy(busy_key)
    if lock.locked():
        await container.notifier.send_message(chat_id=chat_id, text="⏳ Обновление уже выполняется...")
        return

    status_msg = None
    try:
        async with lock:
            status_msg = await container.notifier.send_message(
                chat_id=chat_id, text="⏳ Обновляю Story Points..."
            )
            updated, failed, skipped = await container.update_jira_sp.execute(chat_id, None, skip_errors=skip_errors)

            parts = [f"✅ Обновлено: {updated}"] if updated else ["❌ Обновлено: 0"]
            if failed:
                parts.append(f"❌ Ошибки: {len(failed)} ({', '.join(failed[:3])}{'...' if len(failed) > 3 else ''})")
            if skipped:
                parts.append(f"⏭️ Пропущено: {len(skipped)}")

            await container.notifier.send_message(
                chat_id=chat_id,
                text="\n".join(parts),
                reply_markup=get_back_card(),
            )
    except Exception as e:
        logger.error("Lark update_jira_sp failed: %s", e, exc_info=True)
        await container.notifier.send_message(
            chat_id=chat_id, text="❌ Сервис недоступен. Попробуйте позже.", reply_markup=get_back_card()
        )
    finally:
        container.release_busy(busy_key)


async def _show_day_summary(chat_id: int, session: Session, container: DIContainer) -> None:
    import asyncio as _aio
    from pathlib import Path

    batches, total_sp = await container.show_results.get_day_summary(chat_id, None)
    if not batches:
        await container.notifier.send_message(
            chat_id=chat_id, text="📭 За сегодня ещё не было задач.", reply_markup=get_back_card()
        )
        return

    output_path = Path("data/day_summary.txt")

    def _write() -> None:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with output_path.open("w", encoding="utf-8") as fh:
            for batch_num, batch_tasks in enumerate(batches, start=1):
                fh.write(f"{'='*50}\n📦 Батч {batch_num}\n{'='*50}\n")
                batch_sp = 0
                for idx, task in enumerate(batch_tasks, start=1):
                    header = f"{idx}. {task.text}"
                    if task.jira_key:
                        header += f" ({task.jira_key})"
                    fh.write(f"\n{header}\n")
                    for uid, vote in task.votes.items():
                        p = session.participants.get(uid)
                        name = p.name if p else f"ID {uid}"
                        fh.write(f"  - {name}: {'Пропущено' if vote == 'skip' else vote}\n")
                    sp = _policy.get_max_vote(task.votes)
                    batch_sp += sp
                    fh.write(f"  Итог SP: {sp}\n")
                fh.write(f"\n📈 Сумма SP за батч {batch_num}: {batch_sp}\n\n")
            fh.write(f"{'='*50}\n📊 Всего SP за день: {total_sp}\n")

    await _aio.to_thread(_write)
    try:
        await container.notifier.send_document(
            chat_id=chat_id,
            document=str(output_path),
            caption="📊 Итоги дня",
            reply_markup=get_back_card(),
        )
    finally:
        await _aio.to_thread(output_path.unlink, True)
