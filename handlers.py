from aiogram import types, Router, F
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, FSInputFile
from aiogram.exceptions import TelegramBadRequest, TelegramRetryAfter
from config import HARD_ADMINS, ALLOWED_CHAT_ID, ALLOWED_TOPIC_ID
import state as state_storage
from state import PokerStates
from datetime import datetime, timedelta
import copy
import asyncio
import os

router = Router()
fibonacci_values = ['1', '2', '3', '5', '8', '13']
vote_timeout_seconds = 90
active_vote_message_id = None
active_vote_task = None
active_timer_task = None
t10_ping_sent = False


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

def _format_mmss(seconds: int) -> str:
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
    if msg.chat.id != ALLOWED_CHAT_ID or msg.message_thread_id != ALLOWED_TOPIC_ID:
        return

    args = msg.text.split()
    if len(args) != 2 or args[1] != state_storage.current_token:
        try:
            await msg.answer("❌ Неверный токен.")
        except TelegramRetryAfter as e:
            await asyncio.sleep(e.retry_after)
            await msg.answer("❌ Неверный токен.")
        return

    state_storage.participants[msg.from_user.id] = msg.from_user.full_name
    try:
        await msg.answer(f"✅ {msg.from_user.full_name} присоединился к сессии.")
    except TelegramRetryAfter as e:
        await asyncio.sleep(e.retry_after)
        await msg.answer(f"✅ {msg.from_user.full_name} присоединился к сессии.")
    if is_admin(msg.from_user):
        try:
            await msg.answer("📌 Главное меню:", reply_markup=get_main_menu())
        except TelegramRetryAfter as e:
            await asyncio.sleep(e.retry_after)
            await msg.answer("📌 Главное меню:", reply_markup=get_main_menu())

@router.callback_query(F.data.startswith("menu:"))
async def handle_menu(callback: CallbackQuery, state: FSMContext):

    await callback.answer()

    if callback.message.chat.id != ALLOWED_CHAT_ID or callback.message.message_thread_id != ALLOWED_TOPIC_ID:
        return
    if not is_admin(callback.from_user):
        return

    action = callback.data.split(":")[1]

    if action == "new_task":
        try:
            await callback.message.answer("✏️ Кидай список задач в формате:\nНазвание задачи https://ссылка")
        except TelegramRetryAfter as e:
            await asyncio.sleep(e.retry_after)
            await callback.message.answer("✏️ Кидай список задач в формате:\nНазвание задачи https://ссылка")
        await state.set_state(PokerStates.waiting_for_task_text)

    elif action == "summary":
        await show_full_day_summary(callback.message)

    elif action == "show_participants":
        if not state_storage.participants:
            try:
                await callback.message.answer("⛔ Участников пока нет.")
            except TelegramRetryAfter as e:
                await asyncio.sleep(e.retry_after)
                await callback.message.answer("⛔ Участников пока нет.")
        else:
            text = "👥 Участники:\n" + "\n".join(f"- {v}" for v in state_storage.participants.values())
            try:
                await callback.message.answer(text)
            except TelegramRetryAfter as e:
                await asyncio.sleep(e.retry_after)
                await callback.message.answer(text)

    elif action == "leave":
        user_id = callback.from_user.id
        if user_id in state_storage.participants:
            del state_storage.participants[user_id]
            state_storage.votes.pop(user_id, None)
            try:
                await callback.message.answer("🚪 Вы покинули сессию.")
            except TelegramRetryAfter as e:
                await asyncio.sleep(e.retry_after)
                await callback.message.answer("🚪 Вы покинули сессию.")

    elif action == "kick_participant":
        if not state_storage.participants:
            try:
                await callback.message.answer("⛔ Участников пока нет.")
            except TelegramRetryAfter as e:
                await asyncio.sleep(e.retry_after)
                await callback.message.answer("⛔ Участников пока нет.")
            return

        buttons = [
            [types.InlineKeyboardButton(text=name, callback_data=f"kick_user:{uid}")]
            for uid, name in state_storage.participants.items()
        ]
        keyboard = types.InlineKeyboardMarkup(inline_keyboard=buttons)
        try:
            await callback.message.answer("👤 Выберите участника для удаления:", reply_markup=keyboard)
        except TelegramRetryAfter as e:
            await asyncio.sleep(e.retry_after)
            await callback.message.answer("👤 Выберите участника для удаления:", reply_markup=keyboard)

@router.callback_query(F.data.startswith("kick_user:"))
async def kick_user(callback: CallbackQuery):
    if callback.message.chat.id != ALLOWED_CHAT_ID or callback.message.message_thread_id != ALLOWED_TOPIC_ID:
        return
    if not is_admin(callback.from_user):
        return

    uid = int(callback.data.split(":")[1])
    name = state_storage.participants.pop(uid, None)
    state_storage.votes.pop(uid, None)

    if name:
        try:
            await callback.message.answer(f"🚫 Участник <b>{name}</b> удалён из сессии.", parse_mode="HTML")
        except TelegramRetryAfter as e:
            await asyncio.sleep(e.retry_after)
            await callback.message.answer(f"🚫 Участник <b>{name}</b> удалён из сессии.", parse_mode="HTML")
    else:
        try:
            await callback.message.answer("❌ Участник уже был удалён.")
        except TelegramRetryAfter as e:
            await asyncio.sleep(e.retry_after)
            await callback.message.answer("❌ Участник уже был удалён.")

@router.message(PokerStates.waiting_for_task_text)
async def receive_task_list(msg: types.Message, state: FSMContext):
    if msg.chat.id != ALLOWED_CHAT_ID or msg.message_thread_id != ALLOWED_TOPIC_ID:
        return

    raw_lines = msg.text.strip().splitlines()
    state_storage.tasks_queue = [line.strip() for line in raw_lines if line.strip()]
    state_storage.current_task_index = 0
    state_storage.votes.clear()
    state_storage.last_batch.clear()
    state_storage.batch_completed = False

    await state.clear()
    await start_next_task(msg)


async def vote_timeout(msg: types.Message):
    await asyncio.sleep(vote_timeout_seconds)

    if state_storage.current_task_index >= len(state_storage.tasks_queue):
        return

    try:
        await msg.answer("⏰ Время на голосование вышло. Показываю результаты...")
    except TelegramRetryAfter as e:
        await asyncio.sleep(e.retry_after)
        await msg.answer("⏰ Время на голосование вышло. Показываю результаты...")
    await reveal_votes(msg)

async def start_next_task(msg: types.Message):
    global active_vote_message_id, active_vote_task, active_timer_task, t10_ping_sent

    if getattr(state_storage, "batch_completed", False):
        return

    if state_storage.current_task_index >= len(state_storage.tasks_queue):
        state_storage.batch_completed = True
        await show_summary(msg)
        return

    state_storage.current_task = state_storage.tasks_queue[state_storage.current_task_index]
    state_storage.votes.clear()

    # deadline для таймера
    state_storage.vote_deadline = datetime.now() + timedelta(seconds=vote_timeout_seconds)
    t10_ping_sent = False

    remaining = (state_storage.vote_deadline - datetime.now()).total_seconds()
    text = (
        f"📝 Оценка задачи:\n\n"
        f"{state_storage.current_task}\n\n"
        f"Выберите вашу оценку:\n\n"
        f"⏳ Осталось: {_format_mmss(remaining)}"
    )

    try:
        sent_msg = await msg.answer(text, reply_markup=_build_admin_keyboard(), disable_web_page_preview=True)
    except TelegramRetryAfter as e:
        await asyncio.sleep(e.retry_after)
        sent_msg = await msg.answer(text, reply_markup=_build_admin_keyboard(), disable_web_page_preview=True)

    active_vote_message_id = sent_msg.message_id

    # перезапускаем задачи таймаута и таймера
    if active_vote_task and not active_vote_task.done():
        active_vote_task.cancel()
    if active_timer_task and not active_timer_task.done():
        active_timer_task.cancel()

    active_vote_task = asyncio.create_task(vote_timeout(msg))
    active_timer_task = asyncio.create_task(update_timer(msg))

async def update_timer(msg: types.Message):
    global active_vote_message_id, active_timer_task, t10_ping_sent
    while True:
        if active_vote_message_id is None:
            break
        remaining = int((state_storage.vote_deadline - datetime.now()).total_seconds())
        if remaining <= 0:
            break

        # За 10 сек до конца — один раз пингануть непроголосовавших
        if remaining <= 10 and not t10_ping_sent:
            not_voted = [uid for uid in state_storage.participants.keys() if uid not in state_storage.votes]
            if not_voted:
                # упоминаем по user_id через HTML-ссылки
                mentions = [f'<a href="tg://user?id={uid}">{state_storage.participants.get(uid, "user")}</a>' for uid in not_voted]
                try:
                    try:
                        await msg.answer("⏳ Осталось 10 сек. Ждём: " + ", ".join(mentions), parse_mode="HTML")
                    except TelegramRetryAfter as e:
                        await asyncio.sleep(e.retry_after)
                        await msg.answer("⏳ Осталось 10 сек. Ждём: " + ", ".join(mentions), parse_mode="HTML")
                except Exception:
                    pass
            t10_ping_sent = True

        try:
            await msg.bot.edit_message_text(
                chat_id=msg.chat.id,
                message_id=active_vote_message_id,
                text=(
                    f"📝 Оценка задачи:\n\n"
                    f"{state_storage.current_task}\n\n"
                    f"Выберите вашу оценку:\n\n"
                    f"⏳ Осталось: {_format_mmss(remaining)}"
                ),
                reply_markup=_build_admin_keyboard(),
                disable_web_page_preview=True,
            )
        except TelegramBadRequest as e:
            # Игнорируем частые «message is not modified» и другие косметические ошибки
            pass
        except Exception:
            pass

        await asyncio.sleep(5)

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

    if user_id not in state_storage.participants:
        try:
            await callback.answer("❌ Вы не зарегистрированы через /join.")
        except TelegramRetryAfter as e:
            await asyncio.sleep(e.retry_after)
            await callback.answer("❌ Вы не зарегистрированы через /join.")
        return

    already_voted = user_id in state_storage.votes
    state_storage.votes[user_id] = value
    try:
        await callback.answer("✅ Голос учтён!" if not already_voted else "♻️ Обновлено")
    except TelegramRetryAfter as e:
        await asyncio.sleep(e.retry_after)
        await callback.answer("✅ Голос учтён!" if not already_voted else "♻️ Обновлено")

    if len(state_storage.votes) == len(state_storage.participants):
        if active_vote_task and not active_vote_task.done():
            active_vote_task.cancel()
        try:
            if active_timer_task and not active_timer_task.done():
                active_timer_task.cancel()
        except Exception:
            pass
        await reveal_votes(callback.message)

@router.callback_query(F.data.startswith("timer:"))
async def timer_control(callback: CallbackQuery):
    global active_vote_message_id, active_vote_task, active_timer_task
    if callback.message.chat.id != ALLOWED_CHAT_ID or callback.message.message_thread_id != ALLOWED_TOPIC_ID:
        return
    if not is_admin(callback.from_user):
        try:
            await callback.answer("Только админ.", show_alert=True)
        except TelegramRetryAfter as e:
            await asyncio.sleep(e.retry_after)
            await callback.answer("Только админ.", show_alert=True)
        return
    if callback.message.message_id != active_vote_message_id:
        try:
            await callback.answer("Это уже неактивное голосование.")
        except TelegramRetryAfter as e:
            await asyncio.sleep(e.retry_after)
            await callback.answer("Это уже неактивное голосование.")
        return

    now = datetime.now()
    action = callback.data.split(":")[1]
    if action == "+30":
        state_storage.vote_deadline = (getattr(state_storage, 'vote_deadline', now) or now) + timedelta(seconds=30)
        try:
            await callback.answer("⏱ +30 сек")
        except TelegramRetryAfter as e:
            await asyncio.sleep(e.retry_after)
            await callback.answer("⏱ +30 сек")
    elif action == "-30":
        state_storage.vote_deadline = max(now, (getattr(state_storage, 'vote_deadline', now) or now) - timedelta(seconds=30))
        try:
            await callback.answer("⏱ −30 сек")
        except TelegramRetryAfter as e:
            await asyncio.sleep(e.retry_after)
            await callback.answer("⏱ −30 сек")
    elif action == "finish":
        if active_vote_task and not active_vote_task.done():
            active_vote_task.cancel()
        if active_timer_task and not active_timer_task.done():
            active_timer_task.cancel()
        try:
            await callback.answer("Завершено")
        except TelegramRetryAfter as e:
            await asyncio.sleep(e.retry_after)
            await callback.answer("Завершено")
        await reveal_votes(callback.message)
        return

    # Форсим перерисовку карточки
    try:
        remaining = int((state_storage.vote_deadline - datetime.now()).total_seconds())
        await callback.message.bot.edit_message_text(
            chat_id=callback.message.chat.id,
            message_id=active_vote_message_id,
            text=(
                f"📝 Оценка задачи:\n\n"
                f"{state_storage.current_task}\n\n"
                f"Выберите вашу оценку:\n\n"
                f"⏳ Осталось: {_format_mmss(remaining)}"
            ),
            reply_markup=_build_admin_keyboard(),
            disable_web_page_preview=True,
        )
    except Exception:
        pass

async def reveal_votes(msg: types.Message):
    global active_vote_message_id, active_vote_task

    if not state_storage.votes:
        try:
            await msg.answer("❌ Нет голосов.")
        except TelegramRetryAfter as e:
            await asyncio.sleep(e.retry_after)
            await msg.answer("❌ Нет голосов.")
        return

    # останавливаем таймер
    try:
        if active_timer_task and not active_timer_task.done():
            active_timer_task.cancel()
    except Exception:
        pass

    total_tasks = len(state_storage.tasks_queue)
    remaining_tasks = max(0, total_tasks - (state_storage.current_task_index + 1))
    try:
        await msg.answer(f"✅ Задача оценена. Осталось {remaining_tasks} из {total_tasks} задач.")
    except TelegramRetryAfter as e:
        await asyncio.sleep(e.retry_after)
        await msg.answer(f"✅ Задача оценена. Осталось {remaining_tasks} из {total_tasks} задач.")
    active_vote_message_id = None
    if active_vote_task and not active_vote_task.done():
        active_vote_task.cancel()

    state_storage.history.append({
        'task': state_storage.current_task,
        'votes': copy.deepcopy(state_storage.votes),
        'timestamp': datetime.now()
    })
    state_storage.last_batch.append({
        'task': state_storage.current_task,
        'votes': copy.deepcopy(state_storage.votes),
        'timestamp': datetime.now()
    })
    state_storage.current_task_index += 1
    await start_next_task(msg)

async def show_summary(msg: types.Message):
    if not state_storage.last_batch:
        try:
            await msg.answer("📭 Сессия ещё не проводилась.")
        except TelegramRetryAfter as e:
            await asyncio.sleep(e.retry_after)
            await msg.answer("📭 Сессия ещё не проводилась.")
        return

    output_path = "summary_report.txt"
    with open(output_path, "w") as f:
        for i, h in enumerate(state_storage.last_batch, 1):
            f.write(f"{i}. {h['task']}\n")
            sorted_votes = sorted(h['votes'].items(), key=lambda x: state_storage.participants.get(x[0], ""))
            for uid, v in sorted_votes:
                name = state_storage.participants.get(uid, f"ID {uid}")
                f.write(f"  - {name}: {v}\n")
            f.write("\n")

    file = FSInputFile(output_path)
    try:
        await msg.answer_document(file, caption="📄 Отчет по последнему банчу")
    except TelegramRetryAfter as e:
        await asyncio.sleep(e.retry_after)
        await msg.answer_document(file, caption="📄 Отчет по последнему банчу")
    os.remove(output_path)
    try:
        await msg.answer("📌 Главное меню:", reply_markup=get_main_menu())
    except TelegramRetryAfter as e:
        await asyncio.sleep(e.retry_after)
        await msg.answer("📌 Главное меню:", reply_markup=get_main_menu())

async def show_full_day_summary(msg: types.Message):
    if not state_storage.history:
        try:
            await msg.answer("📭 За сегодня ещё не было задач.")
        except TelegramRetryAfter as e:
            await asyncio.sleep(e.retry_after)
            await msg.answer("📭 За сегодня ещё не было задач.")
        return

    output_path = "day_summary.txt"
    total = 0
    with open(output_path, "w") as f:
        for i, h in enumerate(state_storage.history, 1):
            f.write(f"{i}. {h['task']}\n")
            max_vote = 0
            sorted_votes = sorted(h['votes'].items(), key=lambda x: state_storage.participants.get(x[0], ""))
            for uid, v in sorted_votes:
                name = state_storage.participants.get(uid, f"ID {uid}")
                f.write(f"  - {name}: {v}\n")
                try:
                    max_vote = max(max_vote, int(v))
                except:
                    pass
            total += max_vote
            f.write("\n")
        f.write(f"Всего SP за день: {total}\n")

    file = FSInputFile(output_path)
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
        "Чтобы подключиться:\n"
        "`/join your_token_here`\n\n"
        "— 🆕 Список задач\n"
        "— 📋 Итоги текущего банча\n"
        "— 📊 Итоги всего дня\n"
        "— ♻️ Обнулить голоса\n"
        "— 🔚 Завершить вручную\n"
    )
    try:
        await msg.answer(text, parse_mode="Markdown")
    except TelegramRetryAfter as e:
        await asyncio.sleep(e.retry_after)
        await msg.answer(text, parse_mode="Markdown")

@router.message()
async def unknown_input(msg: types.Message):
    if msg.chat.id != ALLOWED_CHAT_ID or msg.message_thread_id != ALLOWED_TOPIC_ID:
        return
    if msg.from_user.id not in state_storage.participants:
        try:
            await msg.answer("⚠️ Вы не авторизованы. Напишите <code>/join &lt;токен&gt;</code> или нажмите /start для инструкций.", parse_mode="HTML")
        except TelegramRetryAfter as e:
            await asyncio.sleep(e.retry_after)
            await msg.answer("⚠️ Вы не авторизованы. Напишите <code>/join &lt;токен&gt;</code> или нажмите /start для инструкций.", parse_mode="HTML")
