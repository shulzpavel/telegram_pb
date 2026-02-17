"""Command handlers."""

from typing import Optional

from aiogram import Router, types
from aiogram.filters import Command

from app.keyboards import get_back_keyboard, get_main_menu
from app.providers import DIContainer
from app.utils.context import extract_context
from app.utils.telegram import safe_call
from config import INSTRUCTION_URL, UserRole, is_supported_thread

router = Router()

ROLE_TITLES = {
    UserRole.ADMIN: "Администратор",
    UserRole.LEAD: "Лид",
    UserRole.PARTICIPANT: "Участник",
}


def _resolve_role_by_token(token: str) -> Optional[UserRole]:
    """Resolve user role by token."""
    from config import ADMIN_TOKEN, LEAD_TOKEN, USER_TOKEN

    if token == ADMIN_TOKEN:
        return UserRole.ADMIN
    if token == LEAD_TOKEN:
        return UserRole.LEAD
    if token == USER_TOKEN:
        return UserRole.PARTICIPANT
    return None


def _format_role_label(role: UserRole) -> str:
    """Format role label."""
    return ROLE_TITLES.get(role, ROLE_TITLES[UserRole.PARTICIPANT])


@router.message(Command("start", "help"))
async def cmd_start_help(msg: types.Message, container: DIContainer) -> None:
    """Handle /start and /help commands."""
    chat_id, topic_id = extract_context(msg)
    if not is_supported_thread(chat_id, topic_id):
        return

    session = await container.session_repo.get_session(chat_id, topic_id)
    user_id = msg.from_user.id
    participant = session.participants.get(user_id)

    text = (
        "👋 Привет! Я Planning Poker бот — помогаю оценивать задачи в команде.\n\n"
        "**Что умею:** задачи из Jira, голосование по фибоначчи, итоги по батчам и дню. "
        "Подключись через /join (токен даст лид)."
    )

    can_manage = participant and session.can_manage(user_id) if participant else False
    main_kb = get_main_menu(session, can_manage)
    rows = main_kb.inline_keyboard + [
        [types.InlineKeyboardButton(text="📖 Показать инструкцию", url=INSTRUCTION_URL)]
    ]
    kb_with_help = types.InlineKeyboardMarkup(inline_keyboard=rows)

    if participant:
        welcome_text = f"👋 Добро пожаловать! Ваша роль: {_format_role_label(participant.role)}"
        await safe_call(msg.answer, welcome_text, reply_markup=kb_with_help)
    else:
        await safe_call(msg.answer, text, parse_mode="Markdown", reply_markup=kb_with_help)


@router.message(Command("join"))
async def cmd_join(msg: types.Message, container: DIContainer) -> None:
    """Handle /join command."""
    chat_id, topic_id = extract_context(msg)
    if not is_supported_thread(chat_id, topic_id):
        return

    if not msg.text:
        await safe_call(msg.answer, "❌ Использование: /join токен", parse_mode=None)
        return

    args = msg.text.split()
    if len(args) != 2:
        await safe_call(msg.answer, "❌ Использование: /join токен", parse_mode=None)
        return

    token = args[1]
    role = _resolve_role_by_token(token)
    if role is None:
        await safe_call(msg.answer, "❌ Неверный токен.", parse_mode=None)
        return

    user_id = msg.from_user.id
    session = await container.join_session.execute(
        chat_id=chat_id,
        topic_id=topic_id,
        user_id=user_id,
        user_name=msg.from_user.full_name or f"User {user_id}",
        role=role,
    )

    can_manage = session.can_manage(user_id)
    await safe_call(
        msg.answer,
        f"✅ {msg.from_user.full_name} присоединился как {_format_role_label(role)}.",
    )
    await safe_call(msg.answer, "📌 Главное меню:", reply_markup=get_main_menu(session, can_manage))


@router.message(Command("results", "last_batch"))
async def cmd_results(msg: types.Message, container: DIContainer) -> None:
    """Handle /results and /last_batch commands to show last batch results."""
    chat_id, topic_id = extract_context(msg)
    if not is_supported_thread(chat_id, topic_id):
        return

    session = await container.session_repo.get_session(chat_id, topic_id)

    user_id = msg.from_user.id
    if user_id not in session.participants:
        await safe_call(msg.answer, "❌ Вы не зарегистрированы через /join.")
        return

    batch_results = await container.show_results.get_batch_results(chat_id, topic_id)
    if not batch_results:
        await safe_call(msg.answer, "📭 Нет результатов последнего батча.")
        return

    # Import here to avoid circular dependency
    from app.transport.telegram.handlers.callbacks import _show_batch_results

    await _show_batch_results(msg, session, container)
