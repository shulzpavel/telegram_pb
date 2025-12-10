"""Text message handlers."""

from aiogram import Router, types

from app.keyboards import get_back_keyboard, get_main_menu
from app.services.session_service import SessionService
from app.services.task_service import TaskService
from app.utils.context import extract_context
from app.utils.telegram import safe_call
from config import STATE_FILE, is_supported_thread

router = Router()


@router.message()
async def handle_text_input(msg: types.Message) -> None:
    """Handle text input (JQL queries)."""
    chat_id, topic_id = extract_context(msg)
    if not is_supported_thread(chat_id, topic_id):
        return

    session_service = SessionService(STATE_FILE)
    session = session_service.get_session(chat_id, topic_id)

    user_id = msg.from_user.id
    if user_id not in session.participants:
        await safe_call(
            msg.answer,
            "⚠️ Вы не авторизованы. Используйте <code>/join &lt;токен&gt;</code>.",
            parse_mode="HTML",
            reply_markup=get_main_menu(),
        )
        return

    if not session.can_manage(user_id):
        await safe_call(
            msg.answer,
            "❌ Только лидеры и администраторы могут добавлять задачи.",
            reply_markup=get_back_keyboard(),
        )
        return

    if not msg.text:
        return

    jql = msg.text.strip()
    added, skipped = await TaskService.add_tasks_from_jira(session, jql)

    if not added:
        message = "⚠️ Все найденные задачи уже добавлены." if skipped else "❌ Не удалось получить задачи из Jira. Проверь JQL и попробуй снова."
        await safe_call(msg.answer, message, reply_markup=get_back_keyboard())
        return

    session_service.save_session(session)

    response = [f"✅ Добавлено {len(added)} задач из Jira."]
    if skipped:
        response.append("⚠️ Пропущены уже добавленные: " + ", ".join(skipped))
    await safe_call(msg.answer, "\n".join(response), reply_markup=get_back_keyboard())

    # Start voting if this is a new session
    start_new_session = len(session.tasks_queue) == len(added) and session.current_task_index == 0
    if start_new_session:
        if TaskService.start_voting_session(session):
            session_service.save_session(session)
            await _start_voting_session(msg, session, session_service)


async def _start_voting_session(msg: types.Message, session, session_service) -> None:
    """Start voting session."""
    if not session.tasks_queue:
        await safe_call(msg.answer, "❌ Нет задач для голосования.")
        return

    from app.keyboards import build_vote_keyboard

    task = session.current_task
    if not task:
        return

    text = (
        f"📝 Оценка задачи {session.current_task_index + 1}/{len(session.tasks_queue)}:\n\n"
        f"{task.text}\n\nВыберите вашу оценку:"
    )

    sent = await safe_call(
        msg.answer,
        text,
        reply_markup=build_vote_keyboard(),
        disable_web_page_preview=True,
    )
    session.active_vote_message_id = sent.message_id if sent else None
    session_service.save_session(session)

