from aiogram.fsm.state import State, StatesGroup

class PokerStates(StatesGroup):
    idle = State()
    entering_batch = State()
    voting = State()
    waiting_for_votes = State()
    showing_results = State()
    waiting_for_task_text = State()
    waiting_for_jql = State()  # ← добавь эту строку

participants = {}
votes = {}
history = []

current_task = None
current_token = 'magic_token'

tasks_queue = []
current_task_index = 0

last_batch = []