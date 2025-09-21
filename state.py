from aiogram.fsm.state import State, StatesGroup
from config import UserRole
from typing import Optional, Dict, List, Any

# FSM states used by handlers
class PokerStates(StatesGroup):
    idle = State()
    entering_batch = State()
    voting = State()
    waiting_for_votes = State()
    showing_results = State()
    waiting_for_task_text = State()

# Shared in-memory data used by handlers
participants: Dict[int, Dict[str, Any]] = {}  # user_id -> {'name': str, 'role': UserRole}
votes: Dict[int, str] = {}
history: List[Dict[str, Any]] = []

current_task: Optional[str] = None
current_token: str = 'magic_token'

tasks_queue: List[str] = []
current_task_index: int = 0

last_batch: List[Dict[str, Any]] = []
batch_completed: bool = False

# Глобальные переменные для голосования
active_vote_message_id: Optional[int] = None
active_vote_task = None
active_timer_task = None
vote_deadline = None
t10_ping_sent: bool = False