"""Menu keyboards."""

from aiogram import types

FIBONACCI_VALUES = ["1", "2", "3", "5", "8", "13"]


def build_vote_keyboard(can_manage: bool = False) -> types.InlineKeyboardMarkup:
    """Build voting keyboard with Fibonacci values and skip button.
    
    Args:
        can_manage: Whether to show "Need Review" button for leads/admins
    """
    rows = [
        [types.InlineKeyboardButton(text=value, callback_data=f"vote:{value}") for value in FIBONACCI_VALUES[i : i + 3]]
        for i in range(0, len(FIBONACCI_VALUES), 3)
    ]
    # Управление задачей доступно только лидам/админам.
    if can_manage:
        rows.append([types.InlineKeyboardButton(text="⏭️ Пропустить задачу", callback_data="vote:skip")])
        rows.append([types.InlineKeyboardButton(text="🔄 Нужен пересмотр", callback_data="vote:needs_review")])
    
    return types.InlineKeyboardMarkup(inline_keyboard=rows)


def get_main_menu(session=None, can_manage: bool = False) -> types.InlineKeyboardMarkup:
    """Get main menu keyboard. Optionally show 'Start' button if tasks exist and voting is not active.
    
    Args:
        session: Session object to check for tasks
        can_manage: Whether the user can manage the session (lead/admin)
    """
    rows = [
        [
            types.InlineKeyboardButton(text="📝 Загрузить задачи из Jira", callback_data="menu:new_task"),
            types.InlineKeyboardButton(text="📋 Итоги дня", callback_data="menu:summary"),
        ],
        [
            types.InlineKeyboardButton(text="👥 Участники", callback_data="menu:show_participants"),
            types.InlineKeyboardButton(text="🚪 Покинуть", callback_data="menu:leave"),
            types.InlineKeyboardButton(text="🗑️ Удалить участника", callback_data="menu:kick_participant"),
        ],
    ]
    
    # Показываем кнопку "Начать" или "Продолжить" в зависимости от состояния
    if session and session.tasks_queue:
        if session.is_voting_active:
            rows.insert(1, [types.InlineKeyboardButton(text="▶️ Продолжить", callback_data="menu:continue_voting")])
        else:
            rows.insert(1, [types.InlineKeyboardButton(text="▶️ Начать", callback_data="menu:start_voting")])
    
    # Показываем кнопку "Результаты последнего батча" если есть результаты
    if session and session.last_batch:
        rows.insert(1, [types.InlineKeyboardButton(text="📊 Результаты последнего батча", callback_data="menu:last_batch")])
    
    # Показываем кнопку "Сбросить очередь" для лидов/админов, если есть задачи
    if can_manage and session and session.tasks_queue:
        rows.append([types.InlineKeyboardButton(text="🗑️ Сбросить очередь", callback_data="menu:reset_queue")])
    
    return types.InlineKeyboardMarkup(inline_keyboard=rows)


def get_back_keyboard() -> types.InlineKeyboardMarkup:
    """Get back button keyboard."""
    return types.InlineKeyboardMarkup(
        inline_keyboard=[[types.InlineKeyboardButton(text="⬅️ Назад", callback_data="menu:main")]]
    )


def get_voting_active_keyboard() -> types.InlineKeyboardMarkup:
    """Get keyboard when voting is active (Back + Continue buttons)."""
    return types.InlineKeyboardMarkup(
        inline_keyboard=[
            [
                types.InlineKeyboardButton(text="⬅️ Назад", callback_data="menu:main"),
                types.InlineKeyboardButton(text="▶️ Продолжить", callback_data="menu:continue_voting"),
            ]
        ]
    )


def get_tasks_added_keyboard(session=None) -> types.InlineKeyboardMarkup:
    """Get keyboard for when tasks are added. Shows Start or Continue depending on voting state.
    
    Args:
        session: Session to check - if voting is active, shows Continue instead of Start.
    """
    if session and session.is_voting_active:
        return get_voting_active_keyboard()
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
            [types.InlineKeyboardButton(text="🔄 Обновить (пропустить ошибки)", callback_data="update_jira_sp:skip_errors")],
            [types.InlineKeyboardButton(text="⬅️ Назад", callback_data="menu:main")],
        ]
    )
