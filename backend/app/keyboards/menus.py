"""Menu keyboards."""

from dataclasses import dataclass, field
from typing import Optional

FIBONACCI_VALUES = ["1", "2", "3", "5", "8", "13"]


@dataclass
class Button:
    text: str
    callback_data: Optional[str] = None
    url: Optional[str] = None


@dataclass
class Menu:
    inline_keyboard: list = field(default_factory=list)


def build_vote_keyboard(can_manage: bool = False) -> Menu:
    """Build voting keyboard with Fibonacci values and skip button."""
    rows = [
        [Button(text=value, callback_data=f"vote:{value}") for value in FIBONACCI_VALUES[i : i + 3]]
        for i in range(0, len(FIBONACCI_VALUES), 3)
    ]
    if can_manage:
        rows.append([Button(text="⏭️ Пропустить задачу", callback_data="vote:skip")])
        rows.append([Button(text="🔄 Нужен пересмотр", callback_data="vote:needs_review")])

    return Menu(inline_keyboard=rows)


def get_main_menu(session=None, can_manage: bool = False) -> Menu:
    """Get main menu keyboard."""
    rows = [
        [
            Button(text="📝 Загрузить задачи из Jira", callback_data="menu:new_task"),
            Button(text="📋 Итоги дня", callback_data="menu:summary"),
        ],
        [
            Button(text="👥 Участники", callback_data="menu:show_participants"),
            Button(text="🚪 Покинуть", callback_data="menu:leave"),
            Button(text="🗑️ Удалить участника", callback_data="menu:kick_participant"),
        ],
    ]

    if session and session.tasks_queue:
        if session.is_voting_active:
            rows.insert(1, [Button(text="▶️ Продолжить", callback_data="menu:continue_voting")])
        else:
            rows.insert(1, [Button(text="▶️ Начать", callback_data="menu:start_voting")])

    if session and session.last_batch:
        rows.insert(1, [Button(text="📊 Результаты последнего батча", callback_data="menu:last_batch")])

    if can_manage and session and session.tasks_queue:
        rows.append([Button(text="🗑️ Сбросить очередь", callback_data="menu:reset_queue")])

    return Menu(inline_keyboard=rows)


def get_back_keyboard() -> Menu:
    """Get back button keyboard."""
    return Menu(inline_keyboard=[[Button(text="⬅️ Назад", callback_data="menu:main")]])


def get_voting_active_keyboard() -> Menu:
    """Get keyboard when voting is active (Back + Continue buttons)."""
    return Menu(
        inline_keyboard=[
            [
                Button(text="⬅️ Назад", callback_data="menu:main"),
                Button(text="▶️ Продолжить", callback_data="menu:continue_voting"),
            ]
        ]
    )


def get_tasks_added_keyboard(session=None) -> Menu:
    """Get keyboard for when tasks are added."""
    if session and session.is_voting_active:
        return get_voting_active_keyboard()
    return Menu(
        inline_keyboard=[
            [
                Button(text="⬅️ Назад", callback_data="menu:main"),
                Button(text="▶️ Начать", callback_data="menu:start_voting"),
            ]
        ]
    )


def get_results_keyboard() -> Menu:
    """Get results keyboard."""
    return Menu(
        inline_keyboard=[
            [Button(text="🔄 Обновить SP в Jira", callback_data="update_jira_sp")],
            [Button(text="🔄 Обновить (пропустить ошибки)", callback_data="update_jira_sp:skip_errors")],
            [Button(text="⬅️ Назад", callback_data="menu:main")],
        ]
    )
