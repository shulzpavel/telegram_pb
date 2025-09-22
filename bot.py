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
from typing import Optional, List, Dict, Any
from jira_service import jira_service
import json

# Создаем роутер
router = Router()

# Функции для сохранения состояния
def save_state():
    """Сохранить состояние в файл"""
    # Создаем папку data, если её нет
    os.makedirs('data', exist_ok=True)
    
    state = {
        'participants': {str(k): {'name': v['name'], 'role': v['role'].value} for k, v in participants.items()},
        'votes': {str(k): v for k, v in votes.items()},
        'history': history,
        'current_task': current_task,
        'tasks_queue': tasks_queue,
        'current_task_index': current_task_index,
        'last_batch': last_batch,
        'batch_completed': batch_completed
    }
    with open('data/state.json', 'w', encoding='utf-8') as f:
        json.dump(state, f, ensure_ascii=False, indent=2)

def load_state():
    """Загрузить состояние из файла"""
    global participants, votes, history, current_task, tasks_queue, current_task_index, last_batch, batch_completed
    
    try:
        with open('data/state.json', 'r', encoding='utf-8') as f:
            state = json.load(f)
        
        # Восстанавливаем participants
        participants = {}
        for user_id_str, data in state.get('participants', {}).items():
            participants[int(user_id_str)] = {
                'name': data['name'],
                'role': UserRole(data['role'])
            }
        
        # Восстанавливаем остальные переменные
        votes = {int(k): v for k, v in state.get('votes', {}).items()}
        history = state.get('history', [])
        current_task = state.get('current_task')
        tasks_queue = state.get('tasks_queue', [])
        current_task_index = state.get('current_task_index', 0)
        last_batch = state.get('last_batch', [])
        batch_completed = state.get('batch_completed', False)
        
        print(f"✅ Состояние загружено: {len(participants)} участников")
    except FileNotFoundError:
        print("📝 Файл состояния не найден, начинаем с чистого листа")
    except Exception as e:
        print(f"❌ Ошибка загрузки состояния: {e}")

# Простое хранилище
participants = {}
votes = {}  # Текущие голоса для активной задачи
history = []
current_task = None
tasks_queue = []  # Список задач с полной информацией
current_task_index = 0
last_batch = []
batch_completed = False

# Jira интеграция
jira_tasks = {}  # task_key -> {summary, url, story_points}
current_jira_task = None

# Глобальные переменные для голосования
active_vote_message_id = None
active_vote_task = None
active_timer_task = None
vote_deadline = None
t10_ping_sent = False

fibonacci_values = ['1', '2', '3', '5', '8', '13']
vote_timeout_seconds = 90

def get_user_role(user_id: int) -> Optional[UserRole]:
    """Получить роль пользователя"""
    if user_id in participants:
        return participants[user_id]['role']
    return None

def can_vote(user_id: int) -> bool:
    """Проверить, может ли пользователь голосовать"""
    role = get_user_role(user_id)
    return role is not None and role in [UserRole.PARTICIPANT, UserRole.LEAD]

def can_manage_session(user_id: int) -> bool:
    """Проверить, может ли пользователь управлять сессией"""
    role = get_user_role(user_id)
    return role is not None and role in [UserRole.ADMIN, UserRole.LEAD]

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
    
    # Сохраняем состояние
    save_state()
    
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
    
    # Проверяем, что пользователь авторизован
    if user_id not in participants:
        try:
            await callback.answer("⚠️ Вы не авторизованы. Напишите /join <токен> или нажмите /start для инструкций.", show_alert=True)
        except TelegramRetryAfter as e:
            await asyncio.sleep(e.retry_after)
            await callback.answer("⚠️ Вы не авторизованы. Напишите /join <токен> или нажмите /start для инструкций.", show_alert=True)
        return
    
    # Проверяем права на управление сессией
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
            await callback.message.answer("✏️ Отправь JQL запрос из Jira (например: key = FLEX-365 или project = FLEX ORDER BY created DESC)")
        except TelegramRetryAfter as e:
            await asyncio.sleep(e.retry_after)
            await callback.message.answer("✏️ Отправь JQL запрос из Jira (например: key = FLEX-365 или project = FLEX ORDER BY created DESC)")

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
async def handle_text_input(msg: types.Message):
    if msg.chat.id != ALLOWED_CHAT_ID or (ALLOWED_TOPIC_ID and msg.message_thread_id != ALLOWED_TOPIC_ID):
        return
    
    user_id = msg.from_user.id
    if user_id not in participants:
        try:
            await msg.answer("⚠️ Вы не авторизованы. Напишите <code>/join &lt;токен&gt;</code> или нажмите /start для инструкций.", parse_mode="HTML")
        except TelegramRetryAfter as e:
            await asyncio.sleep(e.retry_after)
            await msg.answer("⚠️ Вы не авторизованы. Напишите <code>/join &lt;токен&gt;</code> или нажмите /start для инструкций.", parse_mode="HTML")
        return
    
    # Проверяем, может ли пользователь добавлять задачи
    if not can_manage_session(user_id):
        try:
            await msg.answer("❌ Только лидеры и администраторы могут добавлять задачи.")
        except TelegramRetryAfter as e:
            await asyncio.sleep(e.retry_after)
            await msg.answer("❌ Только лидеры и администраторы могут добавлять задачи.")
        return
    
    if not msg.text:
        return
    
    jira_issues = jira_service.parse_jira_request(msg.text)
    if not jira_issues:
        try:
            await msg.answer("❌ Не удалось получить задачи из Jira по запросу. Проверь JQL и попробуй снова.")
        except TelegramRetryAfter as e:
            await asyncio.sleep(e.retry_after)
            await msg.answer("❌ Не удалось получить задачи из Jira по запросу. Проверь JQL и попробуй снова.")
        return

    await handle_jira_request(msg, jira_issues)

async def handle_jira_request(msg: types.Message, jira_issues: List[Dict[str, Any]]):
    """Обработать список задач из Jira"""
    try:
        start_new_session = len(tasks_queue) == 0
        added_count = 0
        skipped_keys = []
        existing_keys = {task.get('jira_key') for task in tasks_queue if task.get('jira_key')}

        for issue in jira_issues:
            jira_key = issue.get('key')
            if not jira_key:
                continue

            if jira_key in existing_keys:
                skipped_keys.append(jira_key)
                continue

            summary = issue.get('summary', jira_key)
            url = issue.get('url')
            story_points = issue.get('story_points')

            task_text = f"{summary} {url}" if url else summary
            task_data = {
                'text': task_text,
                'jira_key': jira_key,
                'summary': summary,
                'url': url,
                'votes': {},
                'story_points': story_points
            }
            tasks_queue.append(task_data)
            existing_keys.add(jira_key)

            jira_tasks[jira_key] = {
                'summary': summary,
                'url': url,
                'story_points': story_points
            }

            added_count += 1

        if added_count == 0:
            message = "❌ По запросу не найдено новых задач." if not skipped_keys else "⚠️ Все найденные задачи уже есть в очереди."
            try:
                await msg.answer(message)
            except TelegramRetryAfter as e:
                await asyncio.sleep(e.retry_after)
                await msg.answer(message)
            return

        response_text = [f"✅ Добавлено {added_count} задач из Jira."]
        if skipped_keys:
            response_text.append("⚠️ Пропущены уже добавленные: " + ", ".join(skipped_keys))

        try:
            await msg.answer("\n".join(response_text))
        except TelegramRetryAfter as e:
            await asyncio.sleep(e.retry_after)
            await msg.answer("\n".join(response_text))

        if start_new_session:
            await start_voting_session(msg)
        
    except Exception as e:
        await msg.answer(f"❌ Ошибка при обработке запроса из Jira: {e}")

async def start_voting_session(msg: types.Message):
    """Начать сессию голосования"""
    global current_task_index, current_task, votes, batch_completed
    
    if not tasks_queue:
        await msg.answer("❌ Нет задач для голосования.")
        return
    
    current_task_index = 0
    votes.clear()
    batch_completed = False
    
    await start_next_task(msg)

async def start_next_task(msg: types.Message):
    """Начать голосование по следующей задаче"""
    global current_task, current_task_index, active_vote_message_id, current_jira_task, votes
    
    if current_task_index >= len(tasks_queue):
        await finish_batch(msg)
        return
    
    task_data = tasks_queue[current_task_index]
    current_task = task_data['text']
    current_jira_task = task_data.get('jira_key')
    
    # Очищаем голоса для новой задачи
    votes.clear()
    
    # Создаем клавиатуру для голосования
    keyboard = _build_vote_keyboard()
    
    text = f"📝 Оценка задачи {current_task_index + 1}/{len(tasks_queue)}:\n\n{current_task}\n\nВыберите вашу оценку:"
    
    try:
        sent_msg = await msg.answer(text, reply_markup=keyboard, disable_web_page_preview=True)
        active_vote_message_id = sent_msg.message_id
    except TelegramRetryAfter as e:
        await asyncio.sleep(e.retry_after)
        sent_msg = await msg.answer(text, reply_markup=keyboard, disable_web_page_preview=True)
        active_vote_message_id = sent_msg.message_id

async def finish_batch(msg: types.Message):
    """Завершить банч задач"""
    global batch_completed, last_batch
    
    batch_completed = True
    
    # Сохраняем результаты с голосами для каждой задачи
    batch_result = {
        'tasks': tasks_queue.copy(),  # Теперь содержит полную информацию о задачах с голосами
        'timestamp': datetime.now()
    }
    last_batch.append(batch_result)
    history.append(batch_result)
    
    # Показываем результаты
    await show_batch_results(msg)
    
    # Очищаем очередь
    tasks_queue.clear()
    votes.clear()
    current_task_index = 0

async def show_batch_results(msg: types.Message):
    """Показать результаты банча"""
    if not last_batch:
        return
    
    result = last_batch[-1]
    text = "📊 Результаты голосования:\n\n"
    
    for i, task_data in enumerate(result['tasks'], 1):
        task_text = task_data['text']
        jira_key = task_data.get('jira_key')
        text += f"{i}. {task_text}"
        if jira_key:
            text += f" (Jira: {jira_key})"
        text += "\n"
        
        # Показываем голоса для этой задачи
        task_votes = task_data.get('votes', {})
        if task_votes:
            for uid, vote in task_votes.items():
                user_data = participants.get(uid, {})
                name = user_data.get('name', f'User {uid}')
                text += f"   - {name}: {vote}\n"
        text += "\n"
    
    # Добавляем кнопку для обновления SP в Jira
    keyboard = types.InlineKeyboardMarkup(inline_keyboard=[
        [types.InlineKeyboardButton(text="🔄 Обновить SP в Jira", callback_data="update_jira_sp")],
        [types.InlineKeyboardButton(text="📋 Главное меню", callback_data="menu:main")]
    ])
    
    try:
        await msg.answer(text, reply_markup=keyboard)
    except TelegramRetryAfter as e:
        await asyncio.sleep(e.retry_after)
        await msg.answer(text, reply_markup=keyboard)

@router.callback_query(F.data.startswith("vote:"))
async def handle_vote(callback: types.CallbackQuery):
    """Обработать голосование"""
    global current_task_index
    
    await callback.answer()
    
    if callback.message.chat.id != ALLOWED_CHAT_ID or (ALLOWED_TOPIC_ID and callback.message.message_thread_id != ALLOWED_TOPIC_ID):
        return
    
    user_id = callback.from_user.id
    if user_id not in participants:
        await callback.answer("❌ Вы не зарегистрированы через /join.", show_alert=True)
        return
    
    # Проверяем, может ли пользователь голосовать
    if not can_vote(user_id):
        await callback.answer("❌ Администраторы не участвуют в голосовании.", show_alert=True)
        return
    
    value = callback.data.split(":")[1]
    votes[user_id] = value
    
    # Сохраняем голос в текущую задачу
    if current_task_index < len(tasks_queue):
        tasks_queue[current_task_index]['votes'][user_id] = value
    
    await callback.answer("✅ Голос учтён!")
    
    # Проверяем, все ли проголосовали
    voting_participants = {uid: data for uid, data in participants.items() if can_vote(uid)}
    if len(votes) >= len(voting_participants):
        # Переходим к следующей задаче
        current_task_index += 1
        await start_next_task(callback.message)

@router.callback_query(F.data == "update_jira_sp")
async def handle_update_jira_sp(callback: types.CallbackQuery):
    """Обновить Story Points в Jira"""
    await callback.answer()
    
    if callback.message.chat.id != ALLOWED_CHAT_ID or (ALLOWED_TOPIC_ID and callback.message.message_thread_id != ALLOWED_TOPIC_ID):
        return
    
    user_id = callback.from_user.id
    if not can_manage_session(user_id):
        await callback.answer("❌ Только лидеры и администраторы могут обновлять SP.", show_alert=True)
        return
    
    if not last_batch:
        await callback.answer("❌ Нет результатов для обновления.", show_alert=True)
        return
    
    result = last_batch[-1]
    updated_count = 0
    
    try:
        # Обновляем SP для всех Jira задач в банче
        jira_tasks_in_batch = [task for task in result['tasks'] if task.get('jira_key')]
        
        if not jira_tasks_in_batch:
            await callback.message.answer("❌ В этом банче нет Jira задач для обновления.")
            return
        
        updated_count = 0
        for task_data in jira_tasks_in_batch:
            jira_key = task_data['jira_key']
            task_votes = task_data.get('votes', {})
            
            if not task_votes:
                await callback.message.answer(f"❌ Нет голосов для задачи {jira_key}.")
                continue
                
            # Вычисляем наиболее частое значение голосов для этой задачи
            from collections import Counter
            vote_counts = Counter(task_votes.values())
            most_common_vote = vote_counts.most_common(1)[0][0]
            story_points = int(most_common_vote)
            
            # Обновляем SP в Jira
            if jira_service.update_story_points(jira_key, story_points):
                jira_tasks[jira_key]['story_points'] = story_points
                task_data['story_points'] = story_points
                updated_count += 1
                await callback.message.answer(f"✅ Обновлено SP для {jira_key}: {story_points} points")
            else:
                await callback.message.answer(f"❌ Не удалось обновить SP для {jira_key}")
        
        if updated_count > 0:
            await callback.message.answer(f"🎉 Обновлено {updated_count} задач в Jira!")
            
    except Exception as e:
        await callback.message.answer(f"❌ Ошибка при обновлении Jira: {e}")

async def main():
    print("🚀 Planning Poker bot with roles starting...")
    
    # Загружаем сохраненное состояние
    load_state()
    
    bot = Bot(token=BOT_TOKEN, parse_mode="HTML")
    dp = Dispatcher(storage=MemoryStorage())
    dp.include_router(router)
    print("✅ Bot is polling. Waiting for messages...")
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())
