from aiogram.fsm.state import State, StatesGroup

# FSM states used by handlers
class PokerStates(StatesGroup):
    idle = State()
    entering_batch = State()
    voting = State()
    waiting_for_votes = State()
    showing_results = State()
    waiting_for_task_text = State()

# Shared in-memory data used by handlers
participants: dict[int, str] = {}
votes: dict[int, str] = {}
history: list[dict] = []

current_task: str | None = None
current_token: str = 'magic_token'

tasks_queue: list[str] = []
current_task_index: int = 0

last_batch: list[dict] = []
batch_completed: bool = False