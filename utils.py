"""
Утилиты для Telegram Poker Bot
"""
import asyncio
import re
from typing import List, Optional, Dict, Any, Tuple
from datetime import datetime, timedelta
from aiogram import types
from aiogram.exceptions import TelegramRetryAfter
from domain.entities import DomainSession as Session, DomainParticipant as Participant


def format_time_mmss(seconds: int) -> str:
    """Форматировать время в MM:SS"""
    seconds = max(0, int(seconds))
    m, s = divmod(seconds, 60)
    return f"{m:02d}:{s:02d}"


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


def get_main_menu() -> types.InlineKeyboardMarkup:
    """Получить главное меню"""
    return types.InlineKeyboardMarkup(inline_keyboard=[
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
    ])


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
    
    buttons.append([types.InlineKeyboardButton(text="🔙 Назад", callback_data="menu:settings")])
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
                    text=f"⏱️ {timeout}с", 
                    callback_data=f"timeout:{timeout}"
                ))
        buttons.append(row)
    
    buttons.append([types.InlineKeyboardButton(text="🔙 Назад", callback_data="menu:settings")])
    return types.InlineKeyboardMarkup(inline_keyboard=buttons)


async def safe_send_message(
    message_func, 
    text: str, 
    reply_markup: Optional[types.InlineKeyboardMarkup] = None,
    parse_mode: Optional[str] = None,
    disable_web_page_preview: bool = False,
    **kwargs
) -> Optional[types.Message]:
    """Безопасная отправка сообщения с обработкой TelegramRetryAfter"""
    import logging
    logger = logging.getLogger(__name__)
    
    # Check if message contains links
    contains_links = '<a href=' in text or ('[' in text and '](' in text) or 'https://' in text
    
    # If message contains links, disable web page preview to ensure links are clickable
    if contains_links and not disable_web_page_preview:
        disable_web_page_preview = True
        logger.info(f"SAFE_SEND_MESSAGE: Links detected, disabling web page preview")
    
    logger.info(f"SAFE_SEND_MESSAGE: text_length={len(text)}, parse_mode={parse_mode}, disable_web_page_preview={disable_web_page_preview}")
    logger.info(f"SAFE_SEND_MESSAGE: contains_links={contains_links}")
    
    try:
        result = await message_func(
            text, 
            reply_markup=reply_markup,
            parse_mode=parse_mode,
            disable_web_page_preview=disable_web_page_preview,
            **kwargs
        )
        logger.info(f"SAFE_SEND_MESSAGE: Success - message_id={result.message_id if result else None}")
        return result
    except TelegramRetryAfter as e:
        logger.warning(f"SAFE_SEND_MESSAGE: TelegramRetryAfter, sleeping {e.retry_after}s")
        await asyncio.sleep(e.retry_after)
        result = await message_func(
            text, 
            reply_markup=reply_markup,
            parse_mode=parse_mode,
            disable_web_page_preview=disable_web_page_preview,
            **kwargs
        )
        logger.info(f"SAFE_SEND_MESSAGE: Retry success - message_id={result.message_id if result else None}")
        return result
    except Exception as e:
        logger.error(f"SAFE_SEND_MESSAGE: Error: {e}")
        return None


async def safe_edit_message(
    bot, 
    chat_id: int, 
    message_id: int, 
    text: str, 
    reply_markup: Optional[types.InlineKeyboardMarkup] = None,
    parse_mode: Optional[str] = None,
    disable_web_page_preview: bool = False,
    **kwargs
) -> bool:
    """Безопасное редактирование сообщения"""
    try:
        await bot.edit_message_text(
            chat_id=chat_id,
            message_id=message_id,
            text=text,
            reply_markup=reply_markup,
            parse_mode=parse_mode,
            disable_web_page_preview=disable_web_page_preview,
            **kwargs
        )
        return True
    except TelegramRetryAfter as e:
        await asyncio.sleep(e.retry_after)
        try:
            await bot.edit_message_text(
                chat_id=chat_id,
                message_id=message_id,
                text=text,
                reply_markup=reply_markup,
                parse_mode=parse_mode,
                disable_web_page_preview=disable_web_page_preview,
                **kwargs
            )
            return True
        except Exception:
            return False
    except Exception:
        return False


async def safe_answer_callback(
    callback_query, 
    text: str, 
    show_alert: bool = False
) -> None:
    """Безопасный ответ на callback query"""
    try:
        await callback_query.answer(text, show_alert=show_alert)
    except TelegramRetryAfter as e:
        await asyncio.sleep(e.retry_after)
        try:
            await callback_query.answer(text, show_alert=show_alert)
        except Exception:
            pass
    except Exception:
        pass


def format_participants_list(participants: List[Participant]) -> str:
    """Форматировать список участников"""
    if not participants:
        return "⛔ Участников пока нет."
    
    lines = ["👥 Участники:"]
    for participant in participants:
        admin_mark = "👑" if participant.is_admin() else "👤"
        lines.append(f"{admin_mark} {participant.full_name.value}")
    
    return "\n".join(lines)


def format_vote_results(session: Session) -> str:
    """Форматировать результаты голосования"""
    if not session.current_task or not session.current_task.votes:
        return "❌ Нет голосов."
    
    lines = ["📊 Результаты голосования:"]
    votes = session.current_task.votes
    
    # Сортируем по именам участников
    from domain.value_objects import UserId, Username, FullName
    sorted_votes = sorted(
        votes.items(), 
        key=lambda x: session.participants.get(x[0], Participant(UserId(0), Username(""), FullName(""))).full_name.value
    )
    
    for user_id, vote in sorted_votes:
        participant = session.participants.get(user_id)
        if participant:
            lines.append(f"👤 {participant.full_name.value}: {vote.value.value}")
    
    return "\n".join(lines)


def calculate_task_estimate(session: Session) -> Optional[str]:
    """Вычислить оценку задачи"""
    if not session.current_task or not session.current_task.votes:
        return None
    
    votes = []
    for vote in session.current_task.votes.values():
        try:
            votes.append(int(vote.value.value))
        except (ValueError, AttributeError):
            continue
    
    if not votes:
        return None
    
    # Простая медиана
    votes.sort()
    n = len(votes)
    if n % 2 == 0:
        median = (votes[n//2 - 1] + votes[n//2]) / 2
    else:
        median = votes[n//2]
    
    return f"📈 Оценка: {median} SP"


def generate_summary_report(session: Session, is_daily: bool = False) -> str:
    """Генерировать отчет по сессии"""
    history = session.history if not is_daily else [
        h for h in session.history 
        if datetime.fromisoformat(h['timestamp']).date() == datetime.now().date()
    ]
    
    if not history:
        return "📭 Нет данных для отчета."
    
    lines = []
    if is_daily:
        lines.append("📊 ИТОГИ ДНЯ")
    else:
        lines.append("📋 ОТЧЕТ ПО СЕССИИ")
    
    lines.append("=" * 30)
    
    total_sp = 0
    for i, h in enumerate(history, 1):
        lines.append(f"\n{i}. {h['task']}")
        
        # Сортируем голоса по именам
        from domain.value_objects import UserId, Username, FullName
        sorted_votes = sorted(
            h['votes'].items(), 
            key=lambda x: session.participants.get(UserId(int(x[0])), Participant(UserId(0), Username(""), FullName(""))).full_name.value
        )
        
        max_vote = 0
        for uid_str, vote_value in sorted_votes:
            uid = UserId(int(uid_str))
            participant = session.participants.get(uid)
            if participant:
                lines.append(f"  👤 {participant.full_name.value}: {vote_value}")
                try:
                    max_vote = max(max_vote, int(vote_value))
                except ValueError:
                    pass
        
        total_sp += max_vote
    
    lines.append(f"\n📈 Всего SP: {total_sp}")
    return "\n".join(lines)


def get_stats_menu() -> types.InlineKeyboardMarkup:
    """Получить меню статистики"""
    return types.InlineKeyboardMarkup(inline_keyboard=[
        [
            types.InlineKeyboardButton(text="📊 За сегодня", callback_data="stats:today"),
            types.InlineKeyboardButton(text="📈 За последнее голосование", callback_data="stats:last_session")
        ],
        [
            types.InlineKeyboardButton(text="👥 Активность участников", callback_data="stats:participants"),
            types.InlineKeyboardButton(text="🎯 Средние оценки", callback_data="stats:averages")
        ],
        [
            types.InlineKeyboardButton(text="🔙 Назад", callback_data="menu:back")
        ]
    ])


def get_help_menu() -> types.InlineKeyboardMarkup:
    """Получить меню помощи"""
    return types.InlineKeyboardMarkup(inline_keyboard=[
        [
            types.InlineKeyboardButton(text="📖 Команды", callback_data="help:commands"),
            types.InlineKeyboardButton(text="🎮 Как играть", callback_data="help:howto")
        ],
        [
            types.InlineKeyboardButton(text="⚙️ Настройки", callback_data="help:settings"),
            types.InlineKeyboardButton(text="🔧 Админка", callback_data="help:admin")
        ],
        [
            types.InlineKeyboardButton(text="🔙 Назад", callback_data="menu:back")
        ]
    ])


def get_participants_menu() -> types.InlineKeyboardMarkup:
    """Получить меню участников"""
    return types.InlineKeyboardMarkup(inline_keyboard=[
        [
            types.InlineKeyboardButton(text="🔙 Назад", callback_data="menu:back")
        ]
    ])


def format_task_with_progress(current: int, total: int, task_text: str, batch_info: Optional[tuple] = None) -> str:
    """Форматировать задачу с прогрессом"""
    import logging
    logger = logging.getLogger(__name__)
    
    from config import JIRA_BASE_URL
    
    logger.info(f"FORMAT_TASK: Original text: {task_text}")
    logger.info(f"FORMAT_TASK: JIRA_BASE_URL: {JIRA_BASE_URL}")
    
    # Process task text with Jira links
    jira_generator = create_jira_link_generator(JIRA_BASE_URL)
    processed_task_text = jira_generator.process_task_text(task_text)
    
    logger.info(f"FORMAT_TASK: Processed text: {processed_task_text}")
    
    progress_bar = "█" * (current * 10 // total) + "░" * (10 - (current * 10 // total))
    
    if batch_info:
        current_batch, total_batches = batch_info
        result = f"📝 Задача {current}/{total} (Банч {current_batch}/{total_batches})\n\n{processed_task_text}\n\n📊 Прогресс: {progress_bar} {current}/{total}"
    else:
        result = f"📝 Задача {current}/{total}\n\n{processed_task_text}\n\n📊 Прогресс: {progress_bar} {current}/{total}"
    
    # Truncate if too long (Telegram limit is 4096 characters)
    if len(result) > 4000:  # Leave some margin
        # Try to truncate the task description while keeping the link
        max_task_length = 4000 - len(result) + len(processed_task_text) - 100  # Leave 100 chars for safety
        if max_task_length > 50:  # Only truncate if we have reasonable space
            # Find the last complete HTML tag to avoid breaking links
            truncated_task = processed_task_text[:max_task_length]
            # If we're in the middle of an HTML tag, find the last complete one
            if '<' in truncated_task and '>' not in truncated_task[-10:]:
                last_tag_start = truncated_task.rfind('<')
                if last_tag_start > 0:
                    truncated_task = truncated_task[:last_tag_start]
            truncated_task = truncated_task + "..."
            
            if batch_info:
                current_batch, total_batches = batch_info
                result = f"📝 Задача {current}/{total} (Банч {current_batch}/{total_batches})\n\n{truncated_task}\n\n📊 Прогресс: {progress_bar} {current}/{total}"
            else:
                result = f"📝 Задача {current}/{total}\n\n{truncated_task}\n\n📊 Прогресс: {progress_bar} {current}/{total}"
    
    logger.info(f"FORMAT_TASK: Final result: {result[:100]}...")
    return result


def format_voting_status(session: Session) -> str:
    """Форматировать статус голосования"""
    if not session.current_task:
        return "⏸️ Голосование не активно"
    
    voted_count = len(session.current_task.votes)
    total_count = len(session.participants)
    
    if voted_count == 0:
        return "⏳ Ожидаем голосов..."
    elif voted_count == total_count:
        return "✅ Все проголосовали!"
    else:
        remaining = total_count - voted_count
        return f"📊 Проголосовало: {voted_count}/{total_count} (осталось: {remaining})"


def format_participant_stats(participants: List[Participant], history: List[Dict[str, Any]]) -> str:
    """Форматировать статистику участников"""
    if not participants:
        return "👥 Участников пока нет"
    
    lines = ["👥 СТАТИСТИКА УЧАСТНИКОВ", "=" * 25]
    
    # Подсчитываем активность каждого участника
    activity = {}
    for participant in participants:
        activity[participant.user_id] = 0
    
    for h in history:
        for uid_str in h['votes'].keys():
            uid = int(uid_str)
            if uid in activity:
                activity[uid] += 1
    
    # Сортируем по активности
    sorted_activity = sorted(activity.items(), key=lambda x: x[1], reverse=True)
    
    for uid, count in sorted_activity:
        participant = next((p for p in participants if p.user_id == uid), None)
        if participant:
            emoji = "🥇" if count == max(activity.values()) and count > 0 else "👤"
            lines.append(f"{emoji} {participant.full_name}: {count} голосов")
    
    return "\n".join(lines)


def format_average_estimates(history: List[Dict[str, Any]]) -> str:
    """Форматировать средние оценки"""
    if not history:
        return "📊 Нет данных для анализа"
    
    lines = ["📊 СРЕДНИЕ ОЦЕНКИ", "=" * 20]
    
    # Собираем все числовые оценки
    all_votes = []
    for h in history:
        for vote_value in h['votes'].values():
            try:
                all_votes.append(int(vote_value))
            except ValueError:
                pass
    
    if not all_votes:
        return "📊 Нет числовых оценок для анализа"
    
    # Вычисляем статистику
    avg_vote = sum(all_votes) / len(all_votes)
    min_vote = min(all_votes)
    max_vote = max(all_votes)
    
    # Распределение по значениям
    distribution = {}
    for vote in all_votes:
        distribution[vote] = distribution.get(vote, 0) + 1
    
    lines.append(f"📈 Средняя оценка: {avg_vote:.1f}")
    lines.append(f"📉 Минимальная: {min_vote}")
    lines.append(f"📈 Максимальная: {max_vote}")
    lines.append(f"📊 Всего голосов: {len(all_votes)}")
    
    lines.append("\n📋 Распределение:")
    for vote in sorted(distribution.keys()):
        count = distribution[vote]
        percentage = (count / len(all_votes)) * 100
        bar = "█" * int(percentage / 5)  # Максимум 20 символов
        lines.append(f"  {vote}: {count} ({percentage:.1f}%) {bar}")
    
    return "\n".join(lines)


def generate_voting_results_file(session: Session) -> Optional[str]:
    """Создать файл с результатами всех голосований банча"""
    if not session.last_batch:
        return None
    
    lines = []
    lines.append("📊 РЕЗУЛЬТАТЫ ГОЛОСОВАНИЯ")
    lines.append("=" * 50)
    lines.append(f"📅 Дата: {datetime.now().strftime('%d.%m.%Y %H:%M')}")
    lines.append(f"👥 Участников: {len(session.participants)}")
    lines.append(f"📝 Задач: {len(session.last_batch)}")
    lines.append("")
    
    total_sp = 0
    for i, task_data in enumerate(session.last_batch, 1):
        lines.append(f"📝 ЗАДАЧА {i}")
        lines.append("-" * 20)
        lines.append(f"Текст: {task_data['task']}")
        lines.append("")
        
        if task_data['votes']:
            lines.append("🗳️ Голоса:")
            from domain.value_objects import UserId
            for user_id, vote in task_data['votes'].items():
                participant = session.participants.get(UserId(int(user_id)))
                if participant:
                    lines.append(f"  👤 {participant.full_name.value}: {vote}")
            
            # Находим максимальный голос
            max_vote = 0
            for vote_value in task_data['votes'].values():
                try:
                    max_vote = max(max_vote, int(vote_value))
                except ValueError:
                    pass
            
            total_sp += max_vote
            lines.append(f"📈 Итоговая оценка: {max_vote} SP")
        else:
            lines.append("❌ Нет голосов")
        
        lines.append("")
    
    lines.append("📊 ИТОГИ")
    lines.append("-" * 20)
    lines.append(f"📈 Общий SP: {total_sp}")
    lines.append(f"📉 Средний SP на задачу: {total_sp/len(session.last_batch):.1f}")
    
    return "\n".join(lines)


def get_batch_summary_menu() -> types.InlineKeyboardMarkup:
    """Получить меню после завершения банча"""
    return types.InlineKeyboardMarkup(inline_keyboard=[
        [
            types.InlineKeyboardButton(text="📊 Статистика за день", callback_data="stats:today"),
            types.InlineKeyboardButton(text="📈 За последний банч", callback_data="stats:last_session")
        ],
        [
            types.InlineKeyboardButton(text="🔄 Следующий банч", callback_data="menu:next_batch"),
            types.InlineKeyboardButton(text="🏠 Главное меню", callback_data="menu:back")
        ]
    ])


def parse_task_list(text: str) -> List[str]:
    """Парсить список задач из различных форматов"""
    import re
    
    lines = text.strip().split('\n')
    tasks = []
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
            
        # Пропускаем разделители
        if line in ['---', '***', '___', '===']:
            continue
            
        # Убираем нумерацию (1., 2., etc.)
        line = re.sub(r'^\d+\.\s*', '', line)
        
        # Убираем маркеры (-, *, •, etc.)
        line = re.sub(r'^[-*•]\s*', '', line)
        
        # Убираем markdown чекбоксы (- [ ], - [x])
        line = re.sub(r'^-\s*\[[ x]\]\s*', '', line)
        
        # Убираем markdown заголовки (##, ###)
        line = re.sub(r'^#+\s*', '', line)
        
        # Убираем лишние пробелы
        line = line.strip()
        
        if line:
            # Process line for Jira links if it contains task keys
            from config import JIRA_BASE_URL
            
            jira_generator = create_jira_link_generator(JIRA_BASE_URL)
            # Check if line contains Jira task keys
            if jira_generator.extract_task_keys(line):
                # Convert to format suitable for Jira links: KEY - Description
                task_key, description = jira_generator.parse_task_from_text(line)
                if task_key:
                    line = f"{task_key} - {description}"
            
            tasks.append(line)
    
    return tasks






# ============================================================================
# JIRA UTILITIES
# ============================================================================

class JiraLinkGenerator:
    """Generator for Jira task links"""
    
    def __init__(self, jira_base_url: str = "https://media-life.atlassian.net"):
        self.jira_base_url = jira_base_url.rstrip('/')
        # Pattern to match Jira task keys (e.g., FLEX-1213, IBO2-1297, etc.)
        self.task_key_pattern = re.compile(r'\b([A-Z][A-Z0-9]+-\d+)\b')
    
    def extract_task_keys(self, text: str) -> List[str]:
        """Extract all Jira task keys from text"""
        return self.task_key_pattern.findall(text)
    
    def generate_jira_link(self, task_key: str) -> str:
        """Generate Jira link for task key"""
        return f"{self.jira_base_url}/browse/{task_key}"
    
    def process_task_text(self, task_text: str) -> str:
        """Process task text and add separate Jira link"""
        if not task_text:
            return task_text
        
        # Find all task keys in the text
        task_keys = self.extract_task_keys(task_text)
        
        if not task_keys:
            return task_text
        
        # Use the first task key found for the link
        first_task_key = task_keys[0]
        jira_link = self.generate_jira_link(first_task_key)
        
        # Remove task key from text (e.g., "FLEX-123 - Description" -> "Description")
        # Pattern: TASK_KEY - description
        pattern = rf'^{re.escape(first_task_key)}\s*-\s*'
        description_only = re.sub(pattern, '', task_text).strip()
        
        # Add link as separate line as plain text
        return f"{description_only}\n\n🔗 {jira_link}"
    
    def parse_task_from_text(self, task_text: str) -> Tuple[Optional[str], str]:
        """Parse task key and description from text"""
        if not task_text:
            return None, task_text
        
        # Try to extract task key from the beginning
        match = re.match(r'^([A-Z][A-Z0-9]+-\d+)\s*[-|:]\s*(.+)', task_text.strip())
        if match:
            task_key = match.group(1)
            description = match.group(2).strip()
            return task_key, description
        
        # If no task key at the beginning, look for any task key in the text
        task_keys = self.extract_task_keys(task_text)
        if task_keys:
            # Use the first task key found
            task_key = task_keys[0]
            # Remove the task key from the description
            description = re.sub(rf'\b{re.escape(task_key)}\b\s*[-|:]?\s*', '', task_text).strip()
            return task_key, description
        
        return None, task_text
    


def create_jira_link_generator(jira_base_url: Optional[str] = None) -> JiraLinkGenerator:
    """Factory function to create Jira link generator"""
    if jira_base_url:
        return JiraLinkGenerator(jira_base_url)
    else:
        return JiraLinkGenerator()




# ============================================================================
# UI CONTROLS FOR SESSION CONTROL
# ============================================================================

def create_batch_completion_keyboard() -> types.InlineKeyboardMarkup:
    """Create keyboard for batch completion decision"""
    return types.InlineKeyboardMarkup(inline_keyboard=[
        [
            types.InlineKeyboardButton(
                text="🔄 Продолжить оценку",
                callback_data="batch:continue"
            )
        ],
        [
            types.InlineKeyboardButton(
                text="⏸️ Передохнуть",
                callback_data="batch:pause"
            )
        ]
    ])


def create_pause_management_keyboard() -> types.InlineKeyboardMarkup:
    """Create keyboard for pause management"""
    return types.InlineKeyboardMarkup(inline_keyboard=[
        [
            types.InlineKeyboardButton(
                text="▶️ Продолжить оценку",
                callback_data="pause:resume"
            )
        ],
        [
            types.InlineKeyboardButton(
                text="📊 Показать статистику",
                callback_data="pause:stats"
            )
        ],
        [
            types.InlineKeyboardButton(
                text="🔄 Вернуться к обсуждению",
                callback_data="pause:back_to_discussion"
            )
        ]
    ])


def create_revoting_keyboard(task_count: int, current_index: int) -> types.InlineKeyboardMarkup:
    """Create keyboard for revoting process"""
    return types.InlineKeyboardMarkup(inline_keyboard=[
        [
            types.InlineKeyboardButton(
                text=f"🔄 Переголосовать ({current_index + 1}/{task_count})",
                callback_data="revote:start"
            )
        ],
        [
            types.InlineKeyboardButton(
                text="⏭️ Пропустить переголосование",
                callback_data="revote:skip"
            )
        ]
    ])


def create_revoting_task_keyboard() -> types.InlineKeyboardMarkup:
    """Create keyboard for individual revoting task"""
    return types.InlineKeyboardMarkup(inline_keyboard=[
        [
            types.InlineKeyboardButton(
                text="✅ Завершить переголосование",
                callback_data="revote:complete"
            )
        ]
    ])


def create_voting_scale_keyboard(scale: List[str]) -> types.InlineKeyboardMarkup:
    """Create voting scale keyboard for revoting"""
    rows = []
    for i in range(0, len(scale), 3):
        row = []
        for j in range(i, min(i + 3, len(scale))):
            row.append(types.InlineKeyboardButton(
                text=scale[j],
                callback_data=f"revote_vote:{scale[j]}"
            ))
        rows.append(row)
    
    return types.InlineKeyboardMarkup(inline_keyboard=rows)


def create_session_control_keyboard() -> types.InlineKeyboardMarkup:
    """Create main session control keyboard"""
    return types.InlineKeyboardMarkup(inline_keyboard=[
        [
            types.InlineKeyboardButton(
                text="⏸️ Приостановить",
                callback_data="control:pause"
            ),
            types.InlineKeyboardButton(
                text="▶️ Продолжить",
                callback_data="control:resume"
            )
        ],
        [
            types.InlineKeyboardButton(
                text="🔄 Переголосование",
                callback_data="control:revote"
            )
        ],
        [
            types.InlineKeyboardButton(
                text="📊 Статистика",
                callback_data="control:stats"
            )
        ]
    ])


def create_discrepancy_analysis_keyboard(tasks_with_discrepancies: List[dict]) -> types.InlineKeyboardMarkup:
    """Create keyboard for discrepancy analysis"""
    if not tasks_with_discrepancies:
        return types.InlineKeyboardMarkup(inline_keyboard=[
            [
                types.InlineKeyboardButton(
                    text="✅ Продолжить без переголосования",
                    callback_data="discrepancy:continue"
                )
            ]
        ])
    
    return types.InlineKeyboardMarkup(inline_keyboard=[
        [
            types.InlineKeyboardButton(
                text=f"🔄 Переголосовать ({len(tasks_with_discrepancies)} задач)",
                callback_data="discrepancy:revote"
            )
        ],
        [
            types.InlineKeyboardButton(
                text="⏭️ Продолжить без переголосования",
                callback_data="discrepancy:continue"
            )
        ]
    ])


def format_batch_completion_message(batch_info: dict) -> str:
    """Format batch completion message"""
    return f"""
🎯 **Банч завершен!**

📊 **Статистика банча:**
• Задач оценено: {batch_info.get('completed_in_batch', 0)}
• Средняя оценка: {batch_info.get('average_estimate', 'N/A')}
• Время выполнения: {batch_info.get('batch_duration', 'N/A')}

🤔 **Что делаем дальше?**
    """.strip()


def format_pause_message(pause_info: dict) -> str:
    """Format pause message"""
    return f"""
⏸️ **Сессия приостановлена**

📊 **Причина:** {pause_info.get('reason', 'неизвестно')}
⏰ **Время паузы:** {pause_info.get('pause_duration', 'неизвестно')}
📝 **Задач в очереди:** {pause_info.get('remaining_tasks', 0)}

🎯 **Доступные действия:**
    """.strip()


def format_revoting_message(revoting_info: dict) -> str:
    """Format revoting message"""
    from config import JIRA_BASE_URL
    
    # Process current task text with Jira links
    current_task = revoting_info.get('current_task', 'не выбрана')
    if current_task != 'не выбрана':
        jira_generator = create_jira_link_generator(JIRA_BASE_URL)
        current_task = jira_generator.process_task_text(current_task)
    
    return f"""
🔄 **Переголосование**

📊 **Статус:** {revoting_info.get('status', 'неизвестно')}
📝 **Задач для переголосования:** {revoting_info.get('tasks_count', 0)}
📍 **Текущая задача:** {revoting_info.get('current_index', 0) + 1}/{revoting_info.get('tasks_count', 0)}

🎯 **Текущая задача:** {current_task}
    """.strip()


def format_discrepancy_analysis(tasks_with_discrepancies: List[dict]) -> str:
    """Format discrepancy analysis message"""
    if not tasks_with_discrepancies:
        return "✅ **Расхождений не найдено!** Все оценки согласованы."
    
    from config import JIRA_BASE_URL
    
    jira_generator = create_jira_link_generator(JIRA_BASE_URL)
    message = "⚠️ **Найдены расхождения в оценках:**\n\n"
    
    for task in tasks_with_discrepancies:
        # Process task text with Jira links
        task_text = jira_generator.process_task_text(task['text'])
        # Truncate if too long
        display_text = task_text[:50] + "..." if len(task_text) > 50 else task_text
        
        message += f"📝 **Задача {task['index'] + 1}:** {display_text}\n"
        message += f"   • Мин: {task['min_vote']}, Макс: {task['max_vote']}\n"
        message += f"   • Расхождение: {task['discrepancy_ratio']:.1f}x\n\n"
    
    message += "🔄 **Рекомендуется переголосование для согласования оценок.**"
    
    return message


def format_batch_progress(batch_info: dict) -> str:
    """Format batch progress message"""
    progress_percent = (batch_info.get('completed_in_batch', 0) / 
                       batch_info.get('batch_size', 10)) * 100
    
    # Calculate average time per task if we have duration and completed tasks
    avg_time_per_task = "N/A"
    if batch_info.get('batch_duration') != 'N/A' and batch_info.get('completed_in_batch', 0) > 0:
        try:
            # Parse duration and calculate average
            duration_str = batch_info.get('batch_duration', '')
            if 'ч' in duration_str and 'м' in duration_str:
                # Format: "1ч 30м"
                parts = duration_str.replace('ч', '').replace('м', '').split()
                if len(parts) >= 2:
                    hours = int(parts[0])
                    minutes = int(parts[1])
                    total_minutes = hours * 60 + minutes
                    avg_minutes = total_minutes / batch_info.get('completed_in_batch', 1)
                    avg_time_per_task = f"{avg_minutes:.1f}м"
            elif 'м' in duration_str and 'с' in duration_str:
                # Format: "5м 30с"
                parts = duration_str.replace('м', '').replace('с', '').split()
                if len(parts) >= 2:
                    minutes = int(parts[0])
                    seconds = int(parts[1])
                    total_seconds = minutes * 60 + seconds
                    avg_seconds = total_seconds / batch_info.get('completed_in_batch', 1)
                    if avg_seconds >= 60:
                        avg_minutes = avg_seconds / 60
                        avg_time_per_task = f"{avg_minutes:.1f}м"
                    else:
                        avg_time_per_task = f"{avg_seconds:.0f}с"
        except Exception:
            pass
    
    return f"""
📊 **Прогресс банча**

🎯 **Задач выполнено:** {batch_info.get('completed_in_batch', 0)}/{batch_info.get('batch_size', 10)}
📈 **Прогресс:** {progress_percent:.1f}%
⏰ **Среднее время на задачу:** {avg_time_per_task}
📊 **Средняя оценка:** {batch_info.get('average_estimate', 'N/A')}
⏱️ **Время выполнения банча:** {batch_info.get('batch_duration', 'N/A')}

🔄 **Следующий банч:** {batch_info.get('total_tasks', 0) - batch_info.get('current_task_index', 0)} задач
    """.strip()


def parse_jira_jql(jql_query: str) -> List[str]:
    """Парсить список задач из Jira по JQL запросу"""
    try:
        import requests
        import base64
        from config import JIRA_BASE_URL, JIRA_EMAIL, JIRA_TOKEN
        
        # Получаем настройки Jira из конфига
        jira_base_url = JIRA_BASE_URL
        jira_email = JIRA_EMAIL
        jira_token = JIRA_TOKEN
        
        if not jira_email or not jira_token:
            print(f"JIRA_PARSER: Не настроены JIRA_EMAIL или JIRA_TOKEN")
            return []
        
        print(f"JIRA_PARSER: Начинаем парсинг JQL запроса: {jql_query}")
        
        # URL для поиска задач
        search_url = f"{jira_base_url}/rest/api/3/search/jql"
        
        # Заголовки для авторизации
        auth_string = f"{jira_email}:{jira_token}"
        auth_bytes = auth_string.encode('ascii')
        auth_b64 = base64.b64encode(auth_bytes).decode('ascii')
        
        headers = {
            'Authorization': f'Basic {auth_b64}',
            'Content-Type': 'application/json'
        }
        
        # Параметры запроса
        params = {
            'jql': jql_query,
            'fields': 'key,summary',
            'maxResults': 100  # Максимум 100 задач за раз
        }
        
        print(f"JIRA_PARSER: Отправляем запрос к {search_url}")
        
        # Отправляем запрос
        response = requests.get(search_url, headers=headers, params=params, timeout=30)
        
        if response.status_code != 200:
            print(f"JIRA_PARSER: Ошибка API: {response.status_code} - {response.text}")
            return []
        
        data = response.json()
        issues = data.get('issues', [])
        
        print(f"JIRA_PARSER: Найдено {len(issues)} задач")
        
        tasks = []
        for issue in issues:
            key = issue.get('key', '')
            summary = issue.get('fields', {}).get('summary', '')
            
            if key and summary:
                # Формируем задачу в формате: КЛЮЧ - Описание
                task_text = f"{key} - {summary}"
                tasks.append(task_text)
                print(f"JIRA_PARSER: Добавлена задача: {task_text}")
        
        print(f"JIRA_PARSER: Парсинг завершен, найдено {len(tasks)} задач")
        return tasks
        
    except Exception as e:
        print(f"JIRA_PARSER: Ошибка при парсинге JQL: {e}")
        return []
