from aiogram.fsm.state import State, StatesGroup
from typing import Dict, Tuple, Any
from enum import Enum

class UserRole(Enum):
    PARTICIPANT = "participant"
    LEAD = "lead" 
    ADMIN = "admin"

class PokerStates(StatesGroup):
    idle = State()
    entering_batch = State()
    voting = State()
    waiting_for_votes = State()
    showing_results = State()
    waiting_for_task_text = State()

# Токены для подключения
BOT_TOKEN = "7826785109:AAGIgiAvvrFVR7kYKuQa6z4WqhYzwGjvGhg"
ALLOWED_CHAT_ID = -1003087077812
ALLOWED_TOPIC_ID = None  # Для обычных групп без топиков

# Токены для ролей
USER_TOKEN = "user_token"
LEAD_TOKEN = "lead_token" 
ADMIN_TOKEN = "admin_token"

# Хардкод админов (можно расширить)
HARD_ADMINS = ["@admin1", "@admin2"]  # Замените на реальные username

# Сессионное хранилище по (chat_id, topic_id)
sessions: Dict[Tuple[int, int], Dict[str, Any]] = {}

# Настройки по умолчанию
DEFAULT_TIMEOUT = 90
DEFAULT_SCALE = ['1', '2', '3', '5', '8', '13']

def get_session(chat_id: int, topic_id: int) -> Dict[str, Any]:
    """
    Вернуть (или создать) сессию для пары (chat_id, topic_id).
    """
    key = (chat_id, topic_id)
    s = sessions.get(key)
    if s is None:
        s = {
            'participants': {},          # user_id -> {'name': str, 'role': UserRole}
            'votes': {},                 # user_id -> value (str)
            'history': [],               # список завершенных задач банча
            'current_task': None,        # текст текущей задачи
            'tasks_queue': [],           # список задач в банче
            'current_task_index': 0,     # индекс текущей задачи
            'last_batch': [],            # последний банч (для отчета)
            'batch_completed': False,
            'active_vote_message_id': None,
            'active_vote_task': None,
            'active_timer_task': None,
            'vote_deadline': None,
            'default_timeout': DEFAULT_TIMEOUT,
            'scale': DEFAULT_SCALE[:],
            'revotes_on_current': 0,
            't10_ping_sent': False,
            'await_spread_resolution': False,
        }
        sessions[key] = s
    return s