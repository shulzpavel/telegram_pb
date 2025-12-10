"""Menu keyboards."""

from aiogram import types

FIBONACCI_VALUES = ["1", "2", "3", "5", "8", "13"]


def build_vote_keyboard() -> types.InlineKeyboardMarkup:
    """Build voting keyboard with Fibonacci values."""
    rows = [
        [types.InlineKeyboardButton(text=value, callback_data=f"vote:{value}") for value in FIBONACCI_VALUES[i : i + 3]]
        for i in range(0, len(FIBONACCI_VALUES), 3)
    ]
    return types.InlineKeyboardMarkup(inline_keyboard=rows)


def get_main_menu() -> types.InlineKeyboardMarkup:
    """Get main menu keyboard."""
    return types.InlineKeyboardMarkup(
        inline_keyboard=[
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
    )


def get_back_keyboard() -> types.InlineKeyboardMarkup:
    """Get back button keyboard."""
    return types.InlineKeyboardMarkup(
        inline_keyboard=[[types.InlineKeyboardButton(text="⬅️ Назад", callback_data="menu:main")]]
    )


def get_results_keyboard() -> types.InlineKeyboardMarkup:
    """Get results keyboard."""
    return types.InlineKeyboardMarkup(
        inline_keyboard=[
            [types.InlineKeyboardButton(text="🔄 Обновить SP в Jira", callback_data="update_jira_sp")],
            [types.InlineKeyboardButton(text="⬅️ Назад", callback_data="menu:main")],
        ]
    )

