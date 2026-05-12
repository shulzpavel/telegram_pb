"""Lark text (JQL) input handler."""

import logging

from app.providers import DIContainer
from app.transport.lark.keyboards.cards import get_back_card, get_main_menu_card

logger = logging.getLogger(__name__)


async def handle_jql_input(chat_id: int, user_id: int, text: str, container: DIContainer) -> None:
    """Handle free-text messages as JQL queries for Jira task loading."""
    session = await container.session_repo.get_session(chat_id, None)

    if user_id not in session.participants:
        await container.notifier.send_message(
            chat_id=chat_id,
            text="⚠️ Необходимо авторизоваться — используйте /join <токен>.",
            reply_markup=get_back_card(),
        )
        return

    if not session.can_manage(user_id):
        await container.notifier.send_message(
            chat_id=chat_id,
            text="❌ Только лидеры и администраторы могут добавлять задачи.",
            reply_markup=get_back_card(),
        )
        return

    jql = text.strip()
    busy_key = (chat_id, None, "jql")
    lock = await container.acquire_busy(busy_key)
    if lock.locked():
        await container.notifier.send_message(
            chat_id=chat_id,
            text="⏳ Идёт обработка предыдущего запроса. Подожди пару секунд.",
            reply_markup=get_back_card(),
        )
        return

    status_msg = None
    try:
        async with lock:
            status_msg = await container.notifier.send_message(
                chat_id=chat_id, text="🔍 Загружаю задачи из Jira..."
            )
            added, duplicates = await container.add_tasks.execute(chat_id, None, jql)

            session = await container.session_repo.get_session(chat_id, None)
            can_manage = session.can_manage(user_id)

            if added == 0:
                text_result = "📭 Задачи не найдены или все уже в очереди." if duplicates == 0 else f"⚠️ Все {duplicates} задач уже в очереди."
            else:
                text_result = f"✅ Добавлено задач: {added}"
                if duplicates:
                    text_result += f" (пропущено дублей: {duplicates})"

            card = get_main_menu_card(
                has_tasks=bool(session.tasks_queue),
                voting_active=session.is_voting_active,
                has_last_batch=bool(session.last_batch),
                can_manage=can_manage,
            )
            await container.notifier.send_message(chat_id=chat_id, text=text_result, reply_markup=card)

    except Exception as e:
        logger.error("JQL handling error: %s", e, exc_info=True)
        await container.notifier.send_message(
            chat_id=chat_id,
            text="❌ Ошибка при загрузке задач. Проверьте JQL и попробуйте снова.",
            reply_markup=get_back_card(),
        )
    finally:
        container.release_busy(busy_key)
