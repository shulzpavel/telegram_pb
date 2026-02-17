"""Text message handlers."""

import asyncio
from aiogram import F, Router, types
from aiogram.filters import Command

from app.keyboards import get_back_keyboard, get_main_menu, get_tasks_added_keyboard
from app.providers import DIContainer
from app.utils.audit import audit_log
from app.utils.context import extract_context
from app.utils.telegram import safe_call
from config import is_supported_thread

router = Router()


@router.message(F.text, ~F.text.startswith("/"))
async def handle_text_input(msg: types.Message, container: DIContainer) -> None:
    """Handle text input (JQL queries)."""
    chat_id, topic_id = extract_context(msg)
    if not is_supported_thread(chat_id, topic_id):
        return

    session = await container.session_repo.get_session(chat_id, topic_id)

    user_id = msg.from_user.id
    if user_id not in session.participants:
        can_manage = False
        await container.notifier.send_message(
            chat_id=chat_id,
            text="⚠️ Вы не авторизованы. Используйте команду /join с токеном от администратора.",
            parse_mode=None,
            reply_markup=get_main_menu(session, can_manage),
            message_thread_id=topic_id,
        )
        return

    if not session.can_manage(user_id):
        await container.notifier.send_message(
            chat_id=chat_id,
            text="❌ Только лидеры и администраторы могут добавлять задачи.",
            reply_markup=get_back_keyboard(),
            parse_mode=None,
            message_thread_id=topic_id,
        )
        return

    if not msg.text:
        return

    jql = msg.text.strip()

    # Антидубль: если уже идёт поиск, отвечаем и выходим
    busy_key = (chat_id, topic_id, "jql")
    lock = await container.acquire_busy(busy_key)
    if lock.locked():
        await container.notifier.send_message(
            chat_id=chat_id,
            text="⏳ Идёт обработка предыдущего запроса. Подожди пару секунд.",
            reply_markup=get_back_keyboard(),
            parse_mode=None,
            message_thread_id=topic_id,
        )
        return
    await lock.acquire()

    # Показываем индикатор загрузки (будем редактировать)
    status_msg = await container.notifier.send_message(
        chat_id=chat_id,
        text="⏳ Ожидайте, идёт поиск задач в Jira...",
        reply_markup=None,
        message_thread_id=topic_id,
    )

    try:
        await container.metrics.record_event(
            event="jql_query",
            chat_id=chat_id,
            topic_id=topic_id,
            user_id=user_id,
            payload={"jql": jql},
        )
        added, skipped = await container.add_tasks.execute(chat_id, topic_id, jql)
    finally:
        lock.release()
        container.release_busy(busy_key)

    if not added:
        if skipped:
            print(
                f"[Jira] INFO: Все задачи уже добавлены. JQL: {jql}, Skipped ({len(skipped)}): {', '.join(skipped[:10])}{'...' if len(skipped) > 10 else ''}"
            )
            session = await container.session_repo.get_session(chat_id, topic_id)  # Refresh
            if session.tasks_queue:
                message = "⚠️ Все найденные задачи уже добавлены. Нажмите «Начать», чтобы запустить голосование."
                keyboard = get_tasks_added_keyboard()
            else:
                message = "⚠️ Все найденные задачи уже были добавлены ранее, а очередь сейчас пуста. Добавьте новые задачи."
                keyboard = get_back_keyboard()
            if status_msg:
                await container.notifier.edit_message(
                    chat_id=chat_id,
                    message_id=status_msg.message_id,
                    text=message,
                    reply_markup=keyboard,
                    disable_web_page_preview=True,
                )
            else:
                await container.notifier.send_message(
                    chat_id=chat_id,
                    text=message,
                    reply_markup=keyboard,
                    parse_mode=None,
                    message_thread_id=topic_id,
                )
        else:
            print(f"[Jira] ERROR: Не удалось получить задачи. JQL: {jql}")
            error_text = "❌ Не удалось получить задачи из Jira. Проверь JQL и попробуй снова."
            if status_msg:
                await container.notifier.edit_message(
                    chat_id=chat_id,
                    message_id=status_msg.message_id,
                    text=error_text,
                    reply_markup=get_back_keyboard(),
                    disable_web_page_preview=True,
                )
            else:
                await container.notifier.send_message(
                    chat_id=chat_id,
                    text=error_text,
                    reply_markup=get_back_keyboard(),
                    parse_mode=None,
                    message_thread_id=topic_id,
                )
        return

    session = await container.session_repo.get_session(chat_id, topic_id)  # Refresh after adding
    participant = session.participants.get(user_id)
    user_name = participant.name if participant else msg.from_user.full_name or f"User {user_id}"
    audit_log(
        action="add_tasks",
        user_id=user_id,
        user_name=user_name,
        chat_id=chat_id,
        topic_id=topic_id,
        extra={
            "added_count": len(added),
            "skipped_count": len(skipped),
            "jql": jql,
            "jira_keys": [task.jira_key for task in added if task.jira_key],
        },
    )

    response = [f"✅ Добавлено {len(added)} задач из Jira."]
    if skipped:
        response.append("⚠️ Пропущены уже добавленные: " + ", ".join(skipped))
    response_text = "\n".join(response)
    if status_msg:
        await container.notifier.edit_message(
            chat_id=chat_id,
            message_id=status_msg.message_id,
            text=response_text,
            reply_markup=get_tasks_added_keyboard(),
            disable_web_page_preview=True,
        )
    else:
        await container.notifier.send_message(
            chat_id=chat_id,
            text=response_text,
            reply_markup=get_tasks_added_keyboard(),
            parse_mode=None,
            message_thread_id=topic_id,
        )
