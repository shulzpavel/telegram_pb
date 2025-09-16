"""
Модели данных для Telegram Poker Bot
"""
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any
from datetime import datetime
from enum import Enum
from aiogram.fsm.state import State, StatesGroup


class VoteResult(Enum):
    """Результат голосования"""
    PENDING = "pending"
    COMPLETED = "completed"
    TIMEOUT = "timeout"


@dataclass
class Participant:
    """Участник сессии"""
    user_id: int
    username: str
    full_name: str
    is_admin: bool = False


@dataclass
class Vote:
    """Голос участника"""
    user_id: int
    value: str
    timestamp: datetime


@dataclass
class Task:
    """Задача для оценки"""
    text: str
    index: int
    votes: Dict[int, Vote] = field(default_factory=dict)
    result: VoteResult = VoteResult.PENDING
    deadline: Optional[datetime] = None


@dataclass
class Session:
    """Сессия планирования покера"""
    chat_id: int
    topic_id: int
    participants: Dict[int, Participant] = field(default_factory=dict)
    tasks: List[Task] = field(default_factory=list)
    all_tasks: List[Task] = field(default_factory=list)  # Все задачи
    current_task_index: int = 0
    current_batch_index: int = 0  # Индекс текущего банча
    batch_size: int = 10  # Размер банча
    history: List[Dict[str, Any]] = field(default_factory=list)
    last_batch: List[Dict[str, Any]] = field(default_factory=list)
    batch_completed: bool = False
    active_vote_message_id: Optional[int] = None
    vote_deadline: Optional[datetime] = None
    default_timeout: int = 90
    scale: List[str] = field(default_factory=lambda: ['1', '2', '3', '5', '8', '13'])
    t10_ping_sent: bool = False
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)

    @property
    def current_task(self) -> Optional[Task]:
        """Текущая задача"""
        if 0 <= self.current_task_index < len(self.tasks):
            return self.tasks[self.current_task_index]
        return None

    @property
    def is_voting_active(self) -> bool:
        """Активно ли голосование"""
        return self.active_vote_message_id is not None

    def add_participant(self, participant: Participant) -> None:
        """Добавить участника"""
        self.participants[participant.user_id] = participant
        self.updated_at = datetime.now()

    def remove_participant(self, user_id: int) -> Optional[Participant]:
        """Удалить участника"""
        participant = self.participants.pop(user_id, None)
        if participant:
            self.updated_at = datetime.now()
        return participant

    def add_vote(self, user_id: int, value: str) -> bool:
        """Добавить голос"""
        if not self.current_task or user_id not in self.participants:
            return False
        
        vote = Vote(user_id=user_id, value=value, timestamp=datetime.now())
        self.current_task.votes[user_id] = vote
        self.updated_at = datetime.now()
        return True

    def is_all_voted(self) -> bool:
        """Все ли участники проголосовали"""
        if not self.current_task:
            return False
        return len(self.current_task.votes) == len(self.participants)

    def get_not_voted_participants(self) -> List[Participant]:
        """Получить список не проголосовавших участников"""
        if not self.current_task:
            return []
        
        voted_user_ids = set(self.current_task.votes.keys())
        return [
            participant for participant in self.participants.values()
            if participant.user_id not in voted_user_ids
        ]


# FSM states used by handlers
class PokerStates(StatesGroup):
    idle = State()
    entering_batch = State()
    voting = State()
    waiting_for_votes = State()
    showing_results = State()
    waiting_for_task_text = State()


@dataclass
class GroupConfig:
    """Конфигурация группы"""
    chat_id: int
    topic_id: int
    admins: List[str]
    timeout: int = 90
    scale: List[str] = field(default_factory=lambda: ['1', '2', '3', '5', '8', '13'])
    is_active: bool = True
    created_at: datetime = field(default_factory=datetime.now)
