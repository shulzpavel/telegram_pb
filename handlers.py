from aiogram import types, Router, F
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery
from config import ADMINS, ALLOWED_CHAT_ID , ALLOWED_TOPIC_ID
import state
from datetime import datetime
import copy

router = Router()
fibonacci_values = ['1', '2', '3', '5', '8', '13']

def is_admin(user):
    return user.username and ('@' + user.username) in ADMINS

def get_main_menu():
    return types.InlineKeyboardMarkup(inline_keyboard=[
        [
            types.InlineKeyboardButton(text="🆕 Список задач", callback_data="menu:new_task"),
            types.InlineKeyboardButton(text="📋 Итоги дня", callback_data="menu:summary")
        ],
        [
            types.InlineKeyboardButton(text="♻️ Обнулить голоса", callback_data="menu:revote"),
            types.InlineKeyboardButton(text="🔚 Завершить голосование", callback_data="menu:reveal")
        ],
        [
            types.InlineKeyboardButton(text="👥 Участники", callback_data="menu:participants"),
            types.InlineKeyboardButton(text="🚪 Покинуть", callback_data="menu:leave")
        ]
    ])

@router.message(Command("join"))
async def join(msg: types.Message):
    if msg.chat.id != ALLOWED_CHAT_ID or msg.message_thread_id != ALLOWED_TOPIC_ID:
        return

    args = msg.text.split()
    if len(args) != 2 or args[1] != state.current_token:
        await msg.answer("❌ Неверный токен.")
        return

    state.participants[msg.from_user.id] = msg.from_user.full_name
    await msg.answer(f"✅ {msg.from_user.full_name} присоединился к сессии.")
    if is_admin(msg.from_user):
        await msg.answer("📌 Главное меню:", reply_markup=get_main_menu())

@router.callback_query(F.data.startswith("menu:"))
async def handle_menu(callback: CallbackQuery, **kwargs):
    fsm: FSMContext = kwargs["state"]
    await callback.answer()

    if callback.message.chat.id != ALLOWED_CHAT_ID or callback.message.message_thread_id != ALLOWED_TOPIC_ID:
        return

    action = callback.data.split(":")[1]
    if callback.message.chat.id != ALLOWED_CHAT_ID or not is_admin(callback.from_user):
        return

    if action == "new_task":
        await callback.message.answer(
            "✏️ Кидай список задач в формате:\nНазвание задачи https://ссылка",
            parse_mode=None
        )
        await fsm.set_state(state.PokerStates.waiting_for_task_text)

    elif action == "summary":
        await show_summary(callback.message)

    elif action == "revote":
        state.votes.clear()
        await callback.message.answer("🔄 Голоса обнулены.")

    elif action == "reveal":
        await reveal_votes(callback)

    elif action == "participants":
        if not state.participants:
            await callback.message.answer("⛔ Участников пока нет.")
        else:
            text = "👥 Участники:\n" + "\n".join(f"- {v}" for v in state.participants.values())
            await callback.message.answer(text)

    elif action == "leave":
        user_id = callback.from_user.id
        if user_id in state.participants:
            del state.participants[user_id]
            state.votes.pop(user_id, None)
            await callback.message.answer("🚪 Вы покинули сессию.")

@router.message(state.PokerStates.waiting_for_task_text)
async def receive_task_list(msg: types.Message, **kwargs):
    fsm: FSMContext = kwargs["state"]
    raw_lines = msg.text.strip().splitlines()
    state.tasks_queue = [line.strip() for line in raw_lines if line.strip()]
    state.current_task_index = 0
    state.votes.clear()
    state.last_batch.clear()  # очищаем предыдущий банч
    await fsm.clear()
    await start_next_task(msg)

async def start_next_task(msg: types.Message):
    if state.current_task_index >= len(state.tasks_queue):
        await show_summary(msg)
        return

    state.current_task = state.tasks_queue[state.current_task_index]
    state.votes.clear()

    keyboard = types.InlineKeyboardMarkup(inline_keyboard=[
        [types.InlineKeyboardButton(text=v, callback_data=f"vote:{v}") for v in fibonacci_values[i:i+3]]
        for i in range(0, len(fibonacci_values), 3)
    ])
    await msg.answer(
        f"📝 Оценка задачи:\n\n{state.current_task}\n\nВыберите вашу оценку:",
        reply_markup=keyboard
    )

@router.callback_query(F.data.startswith("vote:"))
async def vote_handler(callback: types.CallbackQuery):
    await callback.answer()
    if callback.message.chat.id != ALLOWED_CHAT_ID:
        return

    value = callback.data.split(":")[1]
    user_id = callback.from_user.id

    if user_id not in state.participants:
        await callback.answer("❌ Вы не зарегистрированы через /join.")
        return

    already_voted = user_id in state.votes
    state.votes[user_id] = value
    await callback.answer("✅ Голос учтён!" if not already_voted else "♻️ Обновлено")

    if len(state.votes) == len(state.participants):
        await reveal_votes(callback)

async def reveal_votes(callback: types.CallbackQuery):
    msg = callback.message
    if not state.votes:
        await msg.answer("❌ Нет голосов.")
        return

    result = "📊 Результаты голосования:\n"
    total = 0
    count = 0
    for uid, value in state.votes.items():
        name = state.participants.get(uid, f"ID {uid}")
        result += f"- {name}: {value}\n"
        try:
            total += int(value)
            count += 1
        except ValueError:
            continue
    if count > 0:
        avg = round(total / count, 1)
        result += f"\n📈 Средняя оценка: {avg}"
    else:
        result += "\n📈 Невозможно вычислить среднюю оценку"

    await msg.answer(result)

    state.history.append({
        'task': state.current_task,
        'votes': copy.deepcopy(state.votes),
        'timestamp': datetime.now()
    })
    state.last_batch.append({
    'task': state.current_task,
    'votes': copy.deepcopy(state.votes),
    'timestamp': datetime.now()
})
    state.current_task_index += 1
    await start_next_task(msg)

async def show_summary(msg: types.Message):
    if not state.last_batch:
        await msg.answer("📭 Сессия ещё не проводилась.")
        return

    text = "📦 Итоги последнего набора задач:\n"
    total_all = 0
    count_all = 0

    for i, h in enumerate(state.last_batch, 1):
        text += f"\n🔹 <b>{i}. {h['task']}</b>\n"
        total = 0
        count = 0
        for uid, v in h['votes'].items():
            name = state.participants.get(uid, f"ID {uid}")
            text += f"— {name}: {v}\n"
            try:
                total += int(v)
                count += 1
                total_all += int(v)
                count_all += 1
            except ValueError:
                continue
        if count > 0:
            avg = round(total / count, 1)
            text += f"📈 Среднее: {avg}\n"
        else:
            text += "📈 Среднее: невозможно посчитать\n"

    if count_all > 0:
        overall = round(total_all, 1)
        text += f"\n📦 Сумма SP за банч: {overall}"
    await msg.answer(text)

@router.message(Command("start", "help"))
async def help_command(msg: types.Message):
    if msg.chat.id != ALLOWED_CHAT_ID:
        return
    text = (
        "Чтобы подключиться:\n"
        "🤖 Привет! Я бот для планирования задач Planning Poker.\n\n"
        "Команды для админов (доступны через кнопки):\n"
        "`/join magic_token`\n\n"
        "— 🆕 Список задач\n"
        "— 📋 Итоги текущего банча\n"
        "— ♻️ Обнулить голоса\n"
        "— 🔚 Завершить вручную\n"
    )
    await msg.answer(text, parse_mode="Markdown")

@router.message()
async def unknown_input(msg: types.Message):
    if msg.chat.id != ALLOWED_CHAT_ID:
        return
    if msg.from_user.id not in state.participants:
        await msg.answer("⚠️ Вы не авторизованы. Напишите `/join` и введи токен или нажмите /start для инструкций.")