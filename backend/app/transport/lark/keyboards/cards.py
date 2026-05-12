"""Lark Interactive Card builders.

Lark cards use JSON schema instead of Telegram's InlineKeyboardMarkup.
Each button carries an action value that maps to the same action strings
used in the Telegram callbacks (e.g. "menu:main", "vote:5", etc.).
"""

from typing import Any, Dict, Optional

FIBONACCI_VALUES = ["1", "2", "3", "5", "8", "13"]


def _button(text: str, action_value: str, button_type: str = "default") -> Dict[str, Any]:
    return {
        "tag": "button",
        "text": {"tag": "plain_text", "content": text},
        "type": button_type,
        "value": action_value,
        "action_type": "callback",
    }


def _divider() -> Dict[str, Any]:
    return {"tag": "hr"}


def _text(content: str) -> Dict[str, Any]:
    return {"tag": "div", "text": {"tag": "lark_md", "content": content}}


def _action_row(*buttons) -> Dict[str, Any]:
    return {"tag": "action", "actions": list(buttons)}


def build_card(header: str, elements: list, header_template: str = "blue") -> Dict[str, Any]:
    """Wrap elements in a Lark Interactive Card envelope."""
    return {
        "config": {"wide_screen_mode": True},
        "header": {
            "title": {"tag": "plain_text", "content": header},
            "template": header_template,
        },
        "elements": elements,
    }


def build_vote_card(task_text: str, task_index: int, total: int, can_manage: bool = False) -> Dict[str, Any]:
    """Voting card — equivalent of Telegram build_vote_keyboard."""
    rows: list = [
        _text(f"**Задача {task_index}/{total}**\n{task_text}"),
        _divider(),
    ]

    # Fibonacci rows: 3 buttons per row
    for i in range(0, len(FIBONACCI_VALUES), 3):
        chunk = FIBONACCI_VALUES[i : i + 3]
        rows.append(_action_row(*[_button(v, f"vote:{v}") for v in chunk]))

    if can_manage:
        rows.append(_action_row(_button("⏭️ Пропустить задачу", "vote:skip")))
        rows.append(_action_row(_button("🔄 Нужен пересмотр", "vote:needs_review", "danger")))

    return build_card("🗳️ Голосование", rows, header_template="blue")


def get_main_menu_card(has_tasks: bool = False, voting_active: bool = False, has_last_batch: bool = False, can_manage: bool = False) -> Dict[str, Any]:
    """Main menu card — equivalent of Telegram get_main_menu."""
    elements: list = []

    if has_last_batch:
        elements.append(_action_row(_button("📊 Результаты последнего батча", "menu:last_batch")))

    if has_tasks:
        if voting_active:
            elements.append(_action_row(_button("▶️ Продолжить голосование", "menu:continue_voting", "primary")))
        else:
            elements.append(_action_row(_button("▶️ Начать голосование", "menu:start_voting", "primary")))

    elements.append(
        _action_row(
            _button("📝 Загрузить задачи из Jira", "menu:new_task"),
            _button("📋 Итоги дня", "menu:summary"),
        )
    )
    elements.append(
        _action_row(
            _button("👥 Участники", "menu:show_participants"),
            _button("🚪 Покинуть", "menu:leave"),
        )
    )

    if can_manage:
        elements.append(_action_row(_button("🗑️ Удалить участника", "menu:kick_participant")))
        if has_tasks:
            elements.append(_action_row(_button("🗑️ Сбросить очередь", "menu:reset_queue", "danger")))

    return build_card("📌 Главное меню", elements, header_template="green")


def get_back_card(message: str = "") -> Dict[str, Any]:
    """Card with a single Back button — equivalent of Telegram get_back_keyboard."""
    elements: list = []
    if message:
        elements.append(_text(message))
    elements.append(_action_row(_button("⬅️ Назад", "menu:main")))
    return build_card("ℹ️ Информация", elements)


def get_results_card(summary_text: str) -> Dict[str, Any]:
    """Results card with Jira update buttons — equivalent of Telegram get_results_keyboard."""
    return build_card(
        "📊 Результаты голосования",
        [
            _text(summary_text),
            _divider(),
            _action_row(_button("🔄 Обновить SP в Jira", "update_jira_sp", "primary")),
            _action_row(_button("🔄 Обновить (пропустить ошибки)", "update_jira_sp:skip_errors")),
            _action_row(_button("⬅️ Назад", "menu:main")),
        ],
        header_template="yellow",
    )


def get_confirm_reset_card(task_count: int) -> Dict[str, Any]:
    """Confirmation card for queue reset."""
    return build_card(
        "⚠️ Подтверждение",
        [
            _text(
                f"Вы уверены, что хотите сбросить очередь?\n\n"
                f"**В очереди:** {task_count} задач\n\n"
                f"История голосований сохранится."
            ),
            _action_row(
                _button("✅ Да, сбросить", "confirm:reset_queue", "danger"),
                _button("❌ Отмена", "menu:main"),
            ),
        ],
        header_template="red",
    )
