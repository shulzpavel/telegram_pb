"""Menu keyboards."""

from aiogram import types

FIBONACCI_VALUES = ["1", "2", "3", "5", "8", "13"]


def build_vote_keyboard() -> types.InlineKeyboardMarkup:
    """Build voting keyboard with Fibonacci values and skip button."""
    rows = [
        [types.InlineKeyboardButton(text=value, callback_data=f"vote:{value}") for value in FIBONACCI_VALUES[i : i + 3]]
        for i in range(0, len(FIBONACCI_VALUES), 3)
    ]
    # Добавляем кнопку "Пропустить" в отдельную строку
    rows.append([types.InlineKeyboardButton(text="⏭️ Пропустить", callback_data="vote:skip")])
    return types.InlineKeyboardMarkup(inline_keyboard=rows)


def get_main_menu(session=None) -> types.InlineKeyboardMarkup:
    """Get main menu keyboard. Optionally show 'Start' button if tasks exist and voting is not active."""
    rows = [
        [
            types.InlineKeyboardButton(text="🆕 Список задач", callback_data="menu:new_task"),
            types.InlineKeyboardButton(text="📋 Итоги дня", callback_data="menu:summary"),
        ],
        [
            types.InlineKeyboardButton(text="👥 Участники", callback_data="menu:show_participants"),
            types.InlineKeyboardButton(text="🚪 Покинуть", callback_data="menu:leave"),
            types.InlineKeyboardButton(text="🗑️ Удалить участника", callback_data="menu:kick_participant"),
        ],
    ]
    
    # Показываем кнопку "Начать" если есть задачи и голосование не активно
    if session and session.tasks_queue and not session.is_voting_active:
        rows.insert(1, [types.InlineKeyboardButton(text="▶️ Начать", callback_data="menu:start_voting")])
    
    return types.InlineKeyboardMarkup(inline_keyboard=rows)


def get_back_keyboard() -> types.InlineKeyboardMarkup:
    """Get back button keyboard."""
    return types.InlineKeyboardMarkup(
        inline_keyboard=[[types.InlineKeyboardButton(text="⬅️ Назад", callback_data="menu:main")]]
    )


def get_tasks_added_keyboard() -> types.InlineKeyboardMarkup:
    """Get keyboard for when tasks are added (Back + Start buttons)."""
    return types.InlineKeyboardMarkup(
        inline_keyboard=[
            [
                types.InlineKeyboardButton(text="⬅️ Назад", callback_data="menu:main"),
                types.InlineKeyboardButton(text="▶️ Начать", callback_data="menu:start_voting"),
            ]
        ]
    )


def get_results_keyboard() -> types.InlineKeyboardMarkup:
    """Get results keyboard."""
    return types.InlineKeyboardMarkup(
        inline_keyboard=[
            [types.InlineKeyboardButton(text="🔄 Обновить SP в Jira", callback_data="update_jira_sp")],
            [types.InlineKeyboardButton(text="⬅️ Назад", callback_data="menu:main")],
        ]
    )
