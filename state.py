from aiogram.fsm.state import State, StatesGroup
from datetime import datetime

class PokerStates(StatesGroup):
    waiting_for_task_text = State()

participants = {}
votes = {}
history = []

current_task = None
current_token = 'magic_token'

tasks_queue = []
current_task_index = 0

last_batch = []