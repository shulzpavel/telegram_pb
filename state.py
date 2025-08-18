from aiogram.fsm.state import State, StatesGroup

class PokerStates(StatesGroup):
    idle = State()
    entering_batch = State()        # ввод пачки задач
    voting = State()                # идёт голосование
    waiting_for_votes = State()     # ждём отстающих
    showing_results = State()       # показываем итоги
    waiting_for_task_text = State()

participants = {}
votes = {}
history = []

current_task = None
current_token = 'magic_token'

tasks_queue = []
current_task_index = 0

last_batch = []