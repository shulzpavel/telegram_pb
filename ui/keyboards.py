"""
Keyboard components for Telegram bot
"""
from typing import List
from aiogram import types


def build_vote_keyboard(scale: List[str]) -> types.InlineKeyboardMarkup:
    """Построить клавиатуру для голосования"""
    keyboard = []
    
    # Add voting buttons
    for i in range(0, len(scale), 3):
        row = [types.InlineKeyboardButton(text=v, callback_data=f"vote:{v}") for v in scale[i:i + 3]]
        keyboard.append(row)
    
    # Add finish button
    keyboard.append([types.InlineKeyboardButton(text="✅ Завершить", callback_data="finish_voting")])
    
    return types.InlineKeyboardMarkup(inline_keyboard=keyboard)


def build_admin_keyboard(scale: List[str]) -> types.InlineKeyboardMarkup:
    """Построить админскую клавиатуру с управлением таймером"""
    rows = [
        [types.InlineKeyboardButton(text=v, callback_data=f"vote:{v}") for v in scale[i:i + 3]]
        for i in range(0, len(scale), 3)
    ]
    rows.append([
        types.InlineKeyboardButton(text="⏰ +30 сек", callback_data="timer:+30"),
        types.InlineKeyboardButton(text="⏰ −30 сек", callback_data="timer:-30"),
        types.InlineKeyboardButton(text="✅ Завершить", callback_data="finish_voting"),
    ])
    return types.InlineKeyboardMarkup(inline_keyboard=rows)


def get_main_menu(is_admin: bool = False) -> types.InlineKeyboardMarkup:
    """Получить главное меню"""
    keyboard = [
        [
            types.InlineKeyboardButton(text="🆕 Список задач", callback_data="menu:new_task"),
            types.InlineKeyboardButton(text="📋 Итоги дня", callback_data="menu:summary")
        ],
        [
            types.InlineKeyboardButton(text="👥 Участники", callback_data="menu:show_participants"),
            types.InlineKeyboardButton(text="🚪 Покинуть", callback_data="menu:leave")
        ],
        [
            types.InlineKeyboardButton(text="🗑️ Удалить участника", callback_data="menu:kick_participant")
        ]
    ]
    
    # Добавляем админские кнопки
    if is_admin:
        keyboard.append([
            types.InlineKeyboardButton(text="🔄 Обновить Story Points", callback_data="admin:update_story_points")
        ])
    
    return types.InlineKeyboardMarkup(inline_keyboard=keyboard)


def get_settings_menu() -> types.InlineKeyboardMarkup:
    """Получить меню настроек"""
    return types.InlineKeyboardMarkup(inline_keyboard=[
        [
            types.InlineKeyboardButton(text="⏱️ Таймаут", callback_data="settings:timeout"),
            types.InlineKeyboardButton(text="📊 Шкала", callback_data="settings:scale")
        ],
        [
            types.InlineKeyboardButton(text="👑 Админы", callback_data="settings:admins"),
            types.InlineKeyboardButton(text="🔙 Назад", callback_data="menu:back")
        ]
    ])


def get_scale_menu() -> types.InlineKeyboardMarkup:
    """Получить меню выбора шкалы"""
    scales = [
        ['1', '2', '3', '5', '8', '13'],
        ['1', '2', '3', '5', '8', '13', '21'],
        ['0.5', '1', '2', '3', '5', '8', '13'],
        ['1', '2', '4', '8', '16', '32']
    ]
    
    buttons = []
    for i, scale in enumerate(scales):
        scale_text = ', '.join(scale)
        buttons.append([types.InlineKeyboardButton(
            text=f"📊 {scale_text}",
            callback_data=f"scale:{i}"
        )])
    
    buttons.append([types.InlineKeyboardButton(text="🔙 Назад", callback_data="menu:back")])
    
    return types.InlineKeyboardMarkup(inline_keyboard=buttons)


def get_timeout_menu() -> types.InlineKeyboardMarkup:
    """Получить меню выбора таймаута"""
    timeouts = [30, 60, 90, 120, 180, 300]
    
    buttons = []
    for i in range(0, len(timeouts), 2):
        row = []
        for j in range(2):
            if i + j < len(timeouts):
                timeout = timeouts[i + j]
                row.append(types.InlineKeyboardButton(
                    text=f"⏱️ {timeout} сек",
                    callback_data=f"timeout:{timeout}"
                ))
        buttons.append(row)
    
    buttons.append([types.InlineKeyboardButton(text="🔙 Назад", callback_data="menu:back")])
    
    return types.InlineKeyboardMarkup(inline_keyboard=buttons)


def get_stats_menu() -> types.InlineKeyboardMarkup:
    """Получить меню статистики"""
    return types.InlineKeyboardMarkup(inline_keyboard=[
        [
            types.InlineKeyboardButton(text="📊 Текущая сессия", callback_data="stats:current"),
            types.InlineKeyboardButton(text="📈 За сегодня", callback_data="stats:today")
        ],
        [
            types.InlineKeyboardButton(text="📋 История", callback_data="stats:history"),
            types.InlineKeyboardButton(text="🔙 Назад", callback_data="menu:back")
        ]
    ])


def get_help_menu() -> types.InlineKeyboardMarkup:
    """Получить меню помощи"""
    return types.InlineKeyboardMarkup(inline_keyboard=[
        [
            types.InlineKeyboardButton(text="📖 Команды", callback_data="help:commands"),
            types.InlineKeyboardButton(text="🎯 Как играть", callback_data="help:how_to_play")
        ],
        [
            types.InlineKeyboardButton(text="⚙️ Настройки", callback_data="help:settings"),
            types.InlineKeyboardButton(text="🔙 Назад", callback_data="menu:back")
        ]
    ])
