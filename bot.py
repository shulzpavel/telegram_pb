#!/usr/bin/env python3
"""
Исправленная версия бота с системой ролей
"""

import asyncio
from aiogram import Bot, Dispatcher, types, Router, F
from aiogram.filters import Command
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.exceptions import TelegramRetryAfter
from config import BOT_TOKEN, ALLOWED_CHAT_ID, ALLOWED_TOPIC_ID, USER_TOKEN, LEAD_TOKEN, ADMIN_TOKEN, UserRole
from datetime import datetime, timedelta
import copy
import os

# Создаем роутер
router = Router()

# Простое хранилище
participants = {}
votes = {}
history = []
current_task = None
tasks_queue = []
current_task_index = 0
last_batch = []
batch_completed = False

# Глобальные переменные для голосования
active_vote_message_id = None
active_vote_task = None
active_timer_task = None
vote_deadline = None
t10_ping_sent = False

fibonacci_values = ['1', '2', '3', '5', '8', '13']
vote_timeout_seconds = 90

def get_user_role(user_id: int) -> UserRole:
    """Получить роль пользователя"""
    if user_id in participants:
        return participants[user_id]['role']
    return UserRole.PARTICIPANT

def can_vote(user_id: int) -> bool:
    """Проверить, может ли пользователь голосовать"""
    role = get_user_role(user_id)
    return role in [UserRole.PARTICIPANT, UserRole.LEAD]

def can_manage_session(user_id: int) -> bool:
    """Проверить, может ли пользователь управлять сессией"""
    role = get_user_role(user_id)
    return role in [UserRole.ADMIN, UserRole.LEAD]

def get_main_menu():
    return types.InlineKeyboardMarkup(inline_keyboard=[
        [
            types.InlineKeyboardButton(text="🆕 Список задач", callback_data="menu:new_task"),
            types.InlineKeyboardButton(text="📋 Итоги дня", callback_data="menu:summary")
        ],
        [
            types.InlineKeyboardButton(text="👥 Участники", callback_data="menu:show_participants"),
            types.InlineKeyboardButton(text="🚪 Покинуть", callback_data="menu:leave"),
            types.InlineKeyboardButton(text="🗑️ Удалить участника", callback_data="menu:kick_participant")
        ]
    ])

def _format_mmss(seconds) -> str:
    seconds = max(0, int(seconds))
    m, s = divmod(seconds, 60)
    return f"{m:02d}:{s:02d}"

def _build_vote_keyboard() -> types.InlineKeyboardMarkup:
    return types.InlineKeyboardMarkup(inline_keyboard=[
        [types.InlineKeyboardButton(text=v, callback_data=f"vote:{v}") for v in fibonacci_values[i:i + 3]]
        for i in range(0, len(fibonacci_values), 3)
    ])

def _build_admin_keyboard() -> types.InlineKeyboardMarkup:
    rows = [
        [types.InlineKeyboardButton(text=v, callback_data=f"vote:{v}") for v in fibonacci_values[i:i + 3]]
        for i in range(0, len(fibonacci_values), 3)
    ]
    rows.append([
        types.InlineKeyboardButton(text="＋30 сек", callback_data="timer:+30"),
        types.InlineKeyboardButton(text="－30 сек", callback_data="timer:-30"),
        types.InlineKeyboardButton(text="Завершить", callback_data="timer:finish"),
    ])
    return types.InlineKeyboardMarkup(inline_keyboard=rows)

@router.message(Command("join"))
async def join(msg: types.Message):
    if msg.chat.id != ALLOWED_CHAT_ID or (ALLOWED_TOPIC_ID and msg.message_thread_id != ALLOWED_TOPIC_ID):
        return

    if not msg.text:
        try:
            await msg.answer("❌ Использование: /join <токен>")
        except TelegramRetryAfter as e:
            await asyncio.sleep(e.retry_after)
            await msg.answer("❌ Использование: /join <токен>")
        return
    
    args = msg.text.split()
    if len(args) != 2:
        try:
            await msg.answer("❌ Использование: /join <токен>")
        except TelegramRetryAfter as e:
            await asyncio.sleep(e.retry_after)
            await msg.answer("❌ Использование: /join <токен>")
        return

    token = args[1]
    user_id = msg.from_user.id
    
    # Определяем роль по токену
    if token == ADMIN_TOKEN:
        role = UserRole.ADMIN
        role_name = "Администратор"
    elif token == LEAD_TOKEN:
        role = UserRole.LEAD
        role_name = "Лидер"
    elif token == USER_TOKEN:
        role = UserRole.PARTICIPANT
        role_name = "Участник"
    else:
        try:
            await msg.answer("❌ Неверный токен.")
        except TelegramRetryAfter as e:
            await asyncio.sleep(e.retry_after)
            await msg.answer("❌ Неверный токен.")
        return

    # Добавляем/обновляем пользователя с ролью
    participants[user_id] = {
        'name': msg.from_user.full_name,
        'role': role
    }
    
    # Админы не участвуют в голосовании
    if role == UserRole.ADMIN:
        votes.pop(user_id, None)
    
    try:
        await msg.answer(f"✅ {msg.from_user.full_name} присоединился как {role_name}.")
        await msg.answer("📌 Главное меню:", reply_markup=get_main_menu())
    except TelegramRetryAfter as e:
        await asyncio.sleep(e.retry_after)
        await msg.answer(f"✅ {msg.from_user.full_name} присоединился как {role_name}.")
        await msg.answer("📌 Главное меню:", reply_markup=get_main_menu())

@router.callback_query(F.data.startswith("menu:"))
async def handle_menu(callback: types.CallbackQuery):
    await callback.answer()

    if callback.message.chat.id != ALLOWED_CHAT_ID or (ALLOWED_TOPIC_ID and callback.message.message_thread_id != ALLOWED_TOPIC_ID):
        return
    
    user_id = callback.from_user.id
    if not can_manage_session(user_id):
        try:
            await callback.answer("❌ Только лидеры и администраторы могут управлять сессией.", show_alert=True)
        except TelegramRetryAfter as e:
            await asyncio.sleep(e.retry_after)
            await callback.answer("❌ Только лидеры и администраторы могут управлять сессией.", show_alert=True)
        return

    # Админы не участвуют в голосовании
    if get_user_role(user_id) == UserRole.ADMIN:
        votes.pop(user_id, None)

    action = callback.data.split(":")[1]

    if action == "new_task":
        try:
            await callback.message.answer("✏️ Кидай список задач в формате:\nНазвание задачи https://ссылка")
        except TelegramRetryAfter as e:
            await asyncio.sleep(e.retry_after)
            await callback.message.answer("✏️ Кидай список задач в формате:\nНазвание задачи https://ссылка")

    elif action == "summary":
        await show_full_day_summary(callback.message)

    elif action == "show_participants":
        if not participants:
            try:
                await callback.message.answer("⛔ Участников пока нет.")
            except TelegramRetryAfter as e:
                await asyncio.sleep(e.retry_after)
                await callback.message.answer("⛔ Участников пока нет.")
        else:
            text = "👥 Участники:\n"
            for user_id, user_data in participants.items():
                role_emoji = {
                    UserRole.ADMIN: "👑",
                    UserRole.LEAD: "⭐", 
                    UserRole.PARTICIPANT: "👤"
                }
                role_name = {
                    UserRole.ADMIN: "Админ",
                    UserRole.LEAD: "Лидер",
                    UserRole.PARTICIPANT: "Участник"
                }
                emoji = role_emoji.get(user_data['role'], "👤")
                role = role_name.get(user_data['role'], "Участник")
                text += f"- {emoji} {user_data['name']} ({role})\n"
            try:
                await callback.message.answer(text)
            except TelegramRetryAfter as e:
                await asyncio.sleep(e.retry_after)
                await callback.message.answer(text)

    elif action == "leave":
        user_id = callback.from_user.id
        if user_id in participants:
            del participants[user_id]
            votes.pop(user_id, None)
            try:
                await callback.message.answer("🚪 Вы покинули сессию.")
            except TelegramRetryAfter as e:
                await asyncio.sleep(e.retry_after)
                await callback.message.answer("🚪 Вы покинули сессию.")

    elif action == "kick_participant":
        if not participants:
            try:
                await callback.message.answer("⛔ Участников пока нет.")
            except TelegramRetryAfter as e:
                await asyncio.sleep(e.retry_after)
                await callback.message.answer("⛔ Участников пока нет.")
            return

        buttons = [
            [types.InlineKeyboardButton(text=f"{user_data['name']} ({user_data['role'].value})", callback_data=f"kick_user:{uid}")]
            for uid, user_data in participants.items()
        ]
        keyboard = types.InlineKeyboardMarkup(inline_keyboard=buttons)
        try:
            await callback.message.answer("👤 Выберите участника для удаления:", reply_markup=keyboard)
        except TelegramRetryAfter as e:
            await asyncio.sleep(e.retry_after)
            await callback.message.answer("👤 Выберите участника для удаления:", reply_markup=keyboard)

@router.callback_query(F.data.startswith("kick_user:"))
async def kick_user(callback: types.CallbackQuery):
    if callback.message.chat.id != ALLOWED_CHAT_ID or (ALLOWED_TOPIC_ID and callback.message.message_thread_id != ALLOWED_TOPIC_ID):
        return
    
    user_id = callback.from_user.id
    if not can_manage_session(user_id):
        try:
            await callback.answer("❌ Только лидеры и администраторы могут удалять участников.", show_alert=True)
        except TelegramRetryAfter as e:
            await asyncio.sleep(e.retry_after)
            await callback.answer("❌ Только лидеры и администраторы могут удалять участников.", show_alert=True)
        return

    uid = int(callback.data.split(":")[1])
    user_data = participants.pop(uid, None)
    votes.pop(uid, None)

    if user_data:
        try:
            await callback.message.answer(f"🚫 Участник <b>{user_data['name']}</b> удалён из сессии.", parse_mode="HTML")
        except TelegramRetryAfter as e:
            await asyncio.sleep(e.retry_after)
            await callback.message.answer(f"🚫 Участник <b>{user_data['name']}</b> удалён из сессии.", parse_mode="HTML")
    else:
        try:
            await callback.message.answer("❌ Участник уже был удалён.")
        except TelegramRetryAfter as e:
            await asyncio.sleep(e.retry_after)
            await callback.message.answer("❌ Участник уже был удалён.")

async def show_full_day_summary(msg: types.Message):
    if not history:
        try:
            await msg.answer("📭 За сегодня ещё не было задач.")
        except TelegramRetryAfter as e:
            await asyncio.sleep(e.retry_after)
            await msg.answer("📭 За сегодня ещё не было задач.")
        return

    output_path = "day_summary.txt"
    total = 0
    with open(output_path, "w") as f:
        for i, h in enumerate(history, 1):
            f.write(f"{i}. {h['task']}\n")
            max_vote = 0
            sorted_votes = sorted(h['votes'].items(), key=lambda x: participants.get(x[0], {}).get('name', ''))
            for uid, v in sorted_votes:
                user_data = participants.get(uid, {})
                name = user_data.get('name', f"ID {uid}")
                role = user_data.get('role', UserRole.PARTICIPANT)
                f.write(f"  - {name} ({role.value}): {v}\n")
                try:
                    max_vote = max(max_vote, int(v))
                except:
                    pass
            total += max_vote
            f.write("\n")
        f.write(f"Всего SP за день: {total}\n")

    file = types.FSInputFile(output_path)
    try:
        await msg.answer_document(file, caption="📊 Итоги дня")
    except TelegramRetryAfter as e:
        await asyncio.sleep(e.retry_after)
        await msg.answer_document(file, caption="📊 Итоги дня")
    os.remove(output_path)

@router.message(Command("start", "help"))
async def help_command(msg: types.Message):
    if msg.chat.id != ALLOWED_CHAT_ID:
        return
    text = (
        "🤖 Привет! Я бот для планирования задач Planning Poker.\n\n"
        "Роли и токены:\n"
        f"• Участник: `/join {USER_TOKEN}`\n"
        f"• Лидер: `/join {LEAD_TOKEN}`\n"
        f"• Администратор: `/join {ADMIN_TOKEN}`\n\n"
        "Возможности:\n"
        "— 🆕 Список задач (лидеры и админы)\n"
        "— 📋 Итоги текущего банча\n"
        "— 📊 Итоги всего дня\n"
        "— 👥 Просмотр участников\n"
        "— 🚪 Покинуть сессию\n"
        "— 🗑️ Удалить участника (лидеры и админы)\n\n"
        "Голосование:\n"
        "• Участники и лидеры могут голосовать\n"
        "• Администраторы не участвуют в голосовании\n"
        "• Лидеры могут управлять сессией и голосовать"
    )
    try:
        await msg.answer(text, parse_mode="Markdown")
    except TelegramRetryAfter as e:
        await asyncio.sleep(e.retry_after)
        await msg.answer(text, parse_mode="Markdown")

@router.message()
async def unknown_input(msg: types.Message):
    if msg.chat.id != ALLOWED_CHAT_ID or (ALLOWED_TOPIC_ID and msg.message_thread_id != ALLOWED_TOPIC_ID):
        return
    
    user_id = msg.from_user.id
    if user_id not in participants:
        try:
            await msg.answer("⚠️ Вы не авторизованы. Напишите <code>/join &lt;токен&gt;</code> или нажмите /start для инструкций.", parse_mode="HTML")
        except TelegramRetryAfter as e:
            await asyncio.sleep(e.retry_after)
            await msg.answer("⚠️ Вы не авторизованы. Напишите <code>/join &lt;токен&gt;</code> или нажмите /start для инструкций.", parse_mode="HTML")

async def main():
    print("🚀 Planning Poker bot with roles starting...")
    bot = Bot(token=BOT_TOKEN, parse_mode="HTML")
    dp = Dispatcher(storage=MemoryStorage())
    dp.include_router(router)
    print("✅ Bot is polling. Waiting for messages...")
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())
