from aiogram import types, Router, F
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, FSInputFile
from config import ADMINS, ALLOWED_CHAT_ID, ALLOWED_TOPIC_ID
import state
from datetime import datetime, timedelta
import copy
import asyncio
import os

router = Router()
fibonacci_values = ['1', '2', '3', '5', '8', '13']
vote_timeout_seconds = 90
active_vote_message_id = None
active_vote_task = None

HARD_ADMINS = {'@shults_shults_shults', '@naumov_egor'}

def is_admin(user):
    return user.username and ('@' + user.username) in HARD_ADMINS

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
async def handle_menu(callback: CallbackQuery, fsm_state: FSMContext):

    await callback.answer()

    if callback.message.chat.id != ALLOWED_CHAT_ID or callback.message.message_thread_id != ALLOWED_TOPIC_ID:
        return
    if not is_admin(callback.from_user):
        return

    action = callback.data.split(":")[1]

    if action == "new_task":
        await callback.message.answer("✏️ Кидай список задач в формате:\nНазвание задачи https://ссылка")
        await state_context.set_state(state.PokerStates.waiting_for_task_text)

    elif action == "summary":
        await show_full_day_summary(callback.message)

    elif action == "show_participants":
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

    elif action == "kick_participant":
        if not state.participants:
            await callback.message.answer("⛔ Участников пока нет.")
            return

        buttons = [
            [types.InlineKeyboardButton(text=name, callback_data=f"kick_user:{uid}")]
            for uid, name in state.participants.items()
        ]
        keyboard = types.InlineKeyboardMarkup(inline_keyboard=buttons)
        await callback.message.answer("👤 Выберите участника для удаления:", reply_markup=keyboard)

@router.callback_query(F.data.startswith("kick_user:"))
async def kick_user(callback: CallbackQuery):
    if callback.message.chat.id != ALLOWED_CHAT_ID or callback.message.message_thread_id != ALLOWED_TOPIC_ID:
        return
    if not is_admin(callback.from_user):
        return

    uid = int(callback.data.split(":")[1])
    name = state.participants.pop(uid, None)
    state.votes.pop(uid, None)

    if name:
        await callback.message.answer(f"🚫 Участник <b>{name}</b> удалён из сессии.", parse_mode="HTML")
    else:
        await callback.message.answer("❌ Участник уже был удалён.")

@router.message(state.PokerStates.waiting_for_task_text)
async def receive_task_list(msg: types.Message, state_context: FSMContext):
    if msg.chat.id != ALLOWED_CHAT_ID or msg.message_thread_id != ALLOWED_TOPIC_ID:
        return

    raw_lines = msg.text.strip().splitlines()
    state.tasks_queue = [line.strip() for line in raw_lines if line.strip()]
    state.current_task_index = 0
    state.votes.clear()
    state.last_batch.clear()
    state.batch_completed = False

    await state_context.clear()
    await start_next_task(msg)

async def vote_timeout(msg: types.Message):
    await asyncio.sleep(vote_timeout_seconds)

    if state.current_task_index >= len(state.tasks_queue):
        return

    await msg.answer("⏰ Время на голосование вышло. Показываю результаты...")
    await reveal_votes(msg)

async def start_next_task(msg: types.Message):
    global active_vote_message_id, active_vote_task

    if getattr(state, "batch_completed", False):
        return

    if state.current_task_index >= len(state.tasks_queue):
        state.batch_completed = True
        await show_summary(msg)
        return

    state.current_task = state.tasks_queue[state.current_task_index]
    state.votes.clear()

    keyboard = types.InlineKeyboardMarkup(inline_keyboard=[
        [types.InlineKeyboardButton(text=v, callback_data=f"vote:{v}") for v in fibonacci_values[i:i + 3]]
        for i in range(0, len(fibonacci_values), 3)
    ])

    sent_msg = await msg.answer(
        f"📝 Оценка задачи:\n\n{state.current_task}\n\nВыберите вашу оценку:",
        reply_markup=keyboard
    )

    active_vote_message_id = sent_msg.message_id
    if active_vote_task and not active_vote_task.done():
        active_vote_task.cancel()
    active_vote_task = asyncio.create_task(vote_timeout(msg))

@router.callback_query(F.data.startswith("vote:"))
async def vote_handler(callback: CallbackQuery):
    global active_vote_message_id, active_vote_task

    if callback.message.message_id != active_vote_message_id:
        await callback.answer("❌ Это уже неактивное голосование.", show_alert=True)
        return

    if callback.message.chat.id != ALLOWED_CHAT_ID or callback.message.message_thread_id != ALLOWED_TOPIC_ID:
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
        if active_vote_task and not active_vote_task.done():
            active_vote_task.cancel()
        await reveal_votes(callback.message)

async def reveal_votes(msg: types.Message):
    global active_vote_message_id, active_vote_task

    if not state.votes:
        await msg.answer("❌ Нет голосов.")
        return

    await msg.answer("✅ Задача оценена.")
    active_vote_message_id = None
    if active_vote_task and not active_vote_task.done():
        active_vote_task.cancel()

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

    output_path = "summary_report.txt"
    with open(output_path, "w") as f:
        for i, h in enumerate(state.last_batch, 1):
            f.write(f"{i}. {h['task']}\n")
            sorted_votes = sorted(h['votes'].items(), key=lambda x: state.participants.get(x[0], ""))
            for uid, v in sorted_votes:
                name = state.participants.get(uid, f"ID {uid}")
                f.write(f"  - {name}: {v}\n")
            f.write("\n")

    file = FSInputFile(output_path)
    await msg.answer_document(file, caption="📄 Отчет по последнему банчу")
    os.remove(output_path)
    await msg.answer("📌 Главное меню:", reply_markup=get_main_menu())

async def show_full_day_summary(msg: types.Message):
    if not state.history:
        await msg.answer("📭 За сегодня ещё не было задач.")
        return

    output_path = "day_summary.txt"
    total = 0
    with open(output_path, "w") as f:
        for i, h in enumerate(state.history, 1):
            f.write(f"{i}. {h['task']}\n")
            max_vote = 0
            sorted_votes = sorted(h['votes'].items(), key=lambda x: state.participants.get(x[0], ""))
            for uid, v in sorted_votes:
                name = state.participants.get(uid, f"ID {uid}")
                f.write(f"  - {name}: {v}\n")
                try:
                    max_vote = max(max_vote, int(v))
                except:
                    pass
            total += max_vote
            f.write("\n")
        f.write(f"Всего SP за день: {total}\n")

    file = FSInputFile(output_path)
    await msg.answer_document(file, caption="📊 Итоги дня")
    os.remove(output_path)

@router.message(Command("start", "help"))
async def help_command(msg: types.Message):
    if msg.chat.id != ALLOWED_CHAT_ID:
        return
    text = (
        "🤖 Привет! Я бот для планирования задач Planning Poker.\n\n"
        "Чтобы подключиться:\n"
        "`/join your_token_here`\n\n"
        "— 🆕 Список задач\n"
        "— 📋 Итоги текущего банча\n"
        "— 📊 Итоги всего дня\n"
        "— ♻️ Обнулить голоса\n"
        "— 🔚 Завершить вручную\n"
    )
    await msg.answer(text, parse_mode="Markdown")

@router.message()
async def unknown_input(msg: types.Message):
    if msg.chat.id != ALLOWED_CHAT_ID or msg.message_thread_id != ALLOWED_TOPIC_ID:
        return
    if msg.from_user.id not in state.participants:
        await msg.answer("⚠️ Вы не авторизованы. Напишите `/join <токен>` или нажмите /start для инструкций.")
