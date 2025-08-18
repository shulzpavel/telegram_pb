from aiogram import types, Router, F
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, FSInputFile
from config import HARD_ADMINS, ALLOWED_CHAT_ID, ALLOWED_TOPIC_ID
import state as state_storage
from state import PokerStates
from datetime import datetime, timedelta
import copy
import asyncio
import os
import aiohttp

router = Router()
fibonacci_values = ['1', '2', '3', '5', '8', '13']
vote_timeout_seconds = 90
active_vote_message_id = None
active_vote_task = None
active_timer_task = None

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
            types.InlineKeyboardButton(text="📥 Импорт из Jira", callback_data="menu:import_jira"),
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

def _get_jira_config():
    # Попытка достать из config.py, иначе из переменных окружения
    from config import __dict__ as cfg
    base_url = cfg.get('JIRA_BASE_URL') or os.getenv('JIRA_BASE_URL')
    email = cfg.get('JIRA_EMAIL') or os.getenv('JIRA_EMAIL')
    token = cfg.get('JIRA_API_TOKEN') or os.getenv('JIRA_API_TOKEN')
    max_results = cfg.get('JIRA_MAX_RESULTS') or int(os.getenv('JIRA_MAX_RESULTS') or 20)
    return base_url, email, token, max_results

async def jira_search(jql: str, limit: int = 20):
    base_url, email, token, max_results = _get_jira_config()
    if not (base_url and email and token):
        return {'error': 'Jira не сконфигурирована. Задай JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN в config.py или переменных окружения.'}
    url = base_url.rstrip('/') + '/rest/api/3/search'
    payload = {
        'jql': jql,
        'startAt': 0,
        'maxResults': min(limit, max_results),
        'fields': ['summary']
    }
    auth = aiohttp.BasicAuth(email, token)
    headers = {'Accept': 'application/json', 'Content-Type': 'application/json'}
    async with aiohttp.ClientSession(auth=auth, headers=headers) as session:
        async with session.post(url, json=payload, timeout=aiohttp.ClientTimeout(total=30)) as resp:
            if resp.status == 401:
                return {'error': 'Jira 401 Unauthorized. Проверь JIRA_EMAIL и JIRA_API_TOKEN.'}
            if resp.status == 400:
                data = await resp.json()
                return {'error': f"Ошибка JQL: {data.get('errorMessages') or data}"}
            if resp.status >= 300:
                text = await resp.text()
                return {'error': f'Jira HTTP {resp.status}: {text[:300]}'}
            data = await resp.json()
            issues = data.get('issues', [])
            results = []
            for it in issues:
                key = it.get('key')
                summary = (it.get('fields') or {}).get('summary') or ''
                url_issue = base_url.rstrip('/') + '/browse/' + key
                results.append({'key': key, 'summary': summary, 'url': url_issue})
            return {'issues': results}

@router.message(Command("join"))
async def join(msg: types.Message):
    if msg.chat.id != ALLOWED_CHAT_ID or msg.message_thread_id != ALLOWED_TOPIC_ID:
        return

    args = msg.text.split()
    if len(args) != 2 or args[1] != state_storage.current_token:
        await msg.answer("❌ Неверный токен.")
        return

    state_storage.participants[msg.from_user.id] = msg.from_user.full_name
    await msg.answer(f"✅ {msg.from_user.full_name} присоединился к сессии.")
    if is_admin(msg.from_user):
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
        await callback.message.answer("✏️ Кидай список задач в формате:\nНазвание задачи https://ссылка")
        await state.set_state(PokerStates.waiting_for_task_text)

    elif action == "summary":
        await show_full_day_summary(callback.message)

    elif action == "import_jira":
        await callback.message.answer(
            "🔎 Отправь JQL-запрос одной строкой. Пример: `project = MEDIA and statusCategory != Done order by updated desc`",
            parse_mode="Markdown"
        )
        await state.set_state(PokerStates.waiting_for_jql)

    elif action == "show_participants":
        if not state_storage.participants:
            await callback.message.answer("⛔ Участников пока нет.")
        else:
            text = "👥 Участники:\n" + "\n".join(f"- {v}" for v in state_storage.participants.values())
            await callback.message.answer(text)

    elif action == "leave":
        user_id = callback.from_user.id
        if user_id in state_storage.participants:
            del state_storage.participants[user_id]
            state_storage.votes.pop(user_id, None)
            await callback.message.answer("🚪 Вы покинули сессию.")

    elif action == "kick_participant":
        if not state_storage.participants:
            await callback.message.answer("⛔ Участников пока нет.")
            return

        buttons = [
            [types.InlineKeyboardButton(text=name, callback_data=f"kick_user:{uid}")]
            for uid, name in state_storage.participants.items()
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
    name = state_storage.participants.pop(uid, None)
    state_storage.votes.pop(uid, None)

    if name:
        await callback.message.answer(f"🚫 Участник <b>{name}</b> удалён из сессии.", parse_mode="HTML")
    else:
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

@router.message(PokerStates.waiting_for_jql)
async def receive_jql(msg: types.Message, state: FSMContext):
    if msg.chat.id != ALLOWED_CHAT_ID or msg.message_thread_id != ALLOWED_TOPIC_ID:
        return
    jql = msg.text.strip()
    await _handle_jql_and_start(msg, state, jql)

async def _handle_jql_and_start(msg: types.Message, state: FSMContext, jql: str):
    if not jql:
        await msg.answer("❌ Пустой JQL.")
        return
    await msg.answer("⏳ Ищу задачи в Jira по JQL...")
    result = await jira_search(jql)
    if 'error' in result:
        await msg.answer(f"❌ {result['error']}")
        await state.clear()
        return
    issues = result.get('issues', [])
    if not issues:
        await msg.answer("📭 По этому JQL задач не нашлось.")
        await state.clear()
        return
    # Превращаем в список строк под текущий формат банча
    lines = [f"{it['key']} {it['summary']} {it['url']}".strip() for it in issues]
    state_storage.tasks_queue = lines
    state_storage.current_task_index = 0
    state_storage.votes.clear()
    state_storage.last_batch.clear()
    state_storage.batch_completed = False
    await state.clear()
    await msg.answer(f"✅ Импортировано из Jira: {len(lines)} задач. Запускаю голосование…")
    await start_next_task(msg)

@router.message(Command("jql"))
async def jql_command(msg: types.Message, state: FSMContext):
    if msg.chat.id != ALLOWED_CHAT_ID or msg.message_thread_id != ALLOWED_TOPIC_ID:
        return
    parts = msg.text.split(maxsplit=1)
    if len(parts) < 2:
        await msg.answer("⚠️ Использование: /jql <JQL>")
        return
    jql = parts[1].strip()
    await _handle_jql_and_start(msg, state, jql)

async def vote_timeout(msg: types.Message):
    await asyncio.sleep(vote_timeout_seconds)

    if state_storage.current_task_index >= len(state_storage.tasks_queue):
        return

    await msg.answer("⏰ Время на голосование вышло. Показываю результаты...")
    await reveal_votes(msg)

async def start_next_task(msg: types.Message):
    global active_vote_message_id, active_vote_task, active_timer_task

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

    remaining = (state_storage.vote_deadline - datetime.now()).total_seconds()
    text = (
        f"📝 Оценка задачи:\n\n"
        f"{state_storage.current_task}\n\n"
        f"Выберите вашу оценку:\n\n"
        f"⏳ Осталось: {_format_mmss(remaining)}"
    )

    keyboard = _build_vote_keyboard()
    sent_msg = await msg.answer(text, reply_markup=keyboard)

    active_vote_message_id = sent_msg.message_id

    # перезапускаем задачи таймаута и таймера
    if active_vote_task and not active_vote_task.done():
        active_vote_task.cancel()
    if active_timer_task and not active_timer_task.done():
        active_timer_task.cancel()

    active_vote_task = asyncio.create_task(vote_timeout(msg))
    active_timer_task = asyncio.create_task(update_timer(msg))

async def update_timer(msg: types.Message):
    global active_vote_message_id, active_timer_task
    # Обновляем раз в 5 секунд до нуля или пока голосование не завершится
    while True:
        # если сообщение уже неактивно — выходим
        if active_vote_message_id is None:
            break
        remaining = int((state_storage.vote_deadline - datetime.now()).total_seconds())
        if remaining <= 0:
            break
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
                reply_markup=_build_vote_keyboard()
            )
        except Exception:
            # Игнорируем редкие гонки/ошибки Telegram при частых апдейтах
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
        await callback.answer("❌ Вы не зарегистрированы через /join.")
        return

    already_voted = user_id in state_storage.votes
    state_storage.votes[user_id] = value
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

async def reveal_votes(msg: types.Message):
    global active_vote_message_id, active_vote_task

    if not state_storage.votes:
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
    await msg.answer_document(file, caption="📄 Отчет по последнему банчу")
    os.remove(output_path)
    await msg.answer("📌 Главное меню:", reply_markup=get_main_menu())

async def show_full_day_summary(msg: types.Message):
    if not state_storage.history:
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
    if msg.from_user.id not in state_storage.participants:
        await msg.answer("⚠️ Вы не авторизованы. Напишите <code>/join &lt;токен&gt;</code> или нажмите /start для инструкций.", parse_mode="HTML")
