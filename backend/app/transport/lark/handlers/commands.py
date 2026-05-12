"""Lark command handlers.

Lark delivers messages as IM events. Commands are plain text messages starting
with "/" (we parse them manually since Lark has no built-in command routing).

Supported commands:
  /start | /help  — welcome message + main menu
  /join <token>   — join session with role token
  /results        — show last batch results
"""

import logging
from typing import Optional

from app.domain.session import Session
from app.providers import DIContainer
from app.transport.lark.keyboards.cards import get_back_card, get_main_menu_card
from app.transport.lark.utils.results import show_batch_results_lark
from config import ADMIN_TOKEN, LEAD_TOKEN, USER_TOKEN, UserRole

logger = logging.getLogger(__name__)

ROLE_TITLES = {
    UserRole.ADMIN: "Администратор",
    UserRole.LEAD: "Лид",
    UserRole.PARTICIPANT: "Участник",
}


def _resolve_role(token: str) -> Optional[UserRole]:
    if token == ADMIN_TOKEN:
        return UserRole.ADMIN
    if token == LEAD_TOKEN:
        return UserRole.LEAD
    if token == USER_TOKEN:
        return UserRole.PARTICIPANT
    return None


async def handle_start_help(chat_id: int, user_id: int, container: DIContainer) -> None:
    session = await container.session_repo.get_session(chat_id, None)
    participant = session.participants.get(user_id)
    can_manage = session.can_manage(user_id) if participant else False

    if participant:
        text = f"👋 Добро пожаловать! Ваша роль: {ROLE_TITLES.get(participant.role, 'Участник')}"
    else:
        text = (
            "👋 Привет! Я Planning Poker бот.\n\n"
            "Подключись через /join <токен> (токен даст лид)."
        )

    card = get_main_menu_card(
        has_tasks=bool(session.tasks_queue),
        voting_active=session.is_voting_active,
        has_last_batch=bool(session.last_batch),
        can_manage=can_manage,
    )
    await container.notifier.send_message(chat_id=chat_id, text=text, reply_markup=card)


async def handle_join(chat_id: int, user_id: int, user_name: str, token: str, container: DIContainer) -> None:
    role = _resolve_role(token)
    if role is None:
        await container.notifier.send_message(
            chat_id=chat_id,
            text="❌ Неверный токен.",
            reply_markup=get_back_card(),
        )
        return

    session = await container.join_session.execute(
        chat_id=chat_id,
        topic_id=None,
        user_id=user_id,
        user_name=user_name,
        role=role,
    )
    can_manage = session.can_manage(user_id)
    card = get_main_menu_card(
        has_tasks=bool(session.tasks_queue),
        voting_active=session.is_voting_active,
        has_last_batch=bool(session.last_batch),
        can_manage=can_manage,
    )
    await container.notifier.send_message(
        chat_id=chat_id,
        text=f"✅ {user_name} присоединился как {ROLE_TITLES.get(role, 'Участник')}.",
        reply_markup=card,
    )


async def handle_results(chat_id: int, user_id: int, container: DIContainer) -> None:
    session = await container.session_repo.get_session(chat_id, None)

    if user_id not in session.participants:
        await container.notifier.send_message(
            chat_id=chat_id,
            text="❌ Вы не зарегистрированы. Используйте /join <токен>.",
            reply_markup=get_back_card(),
        )
        return

    batch_results = await container.show_results.get_batch_results(chat_id, None)
    if not batch_results:
        await container.notifier.send_message(
            chat_id=chat_id,
            text="📭 Нет результатов последнего батча.",
            reply_markup=get_back_card(),
        )
        return

    await show_batch_results_lark(chat_id, session, container)


async def dispatch_command(
    chat_id: int,
    user_id: int,
    user_name: str,
    text: str,
    container: DIContainer,
) -> bool:
    """Parse and dispatch a /command message. Returns True if command handled."""
    if not text.startswith("/"):
        return False

    parts = text.strip().split()
    cmd = parts[0].lower().lstrip("/")
    # Strip bot mention (@botname) if present
    cmd = cmd.split("@")[0]

    if cmd in ("start", "help"):
        await handle_start_help(chat_id, user_id, container)
        return True

    if cmd == "join":
        if len(parts) < 2:
            await container.notifier.send_message(
                chat_id=chat_id,
                text="❌ Использование: /join <токен>",
                reply_markup=get_back_card(),
            )
            return True
        await handle_join(chat_id, user_id, user_name, parts[1], container)
        return True

    if cmd in ("results", "last_batch"):
        await handle_results(chat_id, user_id, container)
        return True

    return False
