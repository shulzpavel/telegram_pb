"""Session model for Planning Poker."""

from dataclasses import dataclass, field
from typing import Dict, List, Optional

from app.models.participant import Participant
from app.models.task import Task
from config import UserRole


@dataclass
class Session:
    """Represents a planning poker session."""

    chat_id: int
    topic_id: Optional[int]
    participants: Dict[int, Participant] = field(default_factory=dict)
    tasks_queue: List[Task] = field(default_factory=list)
    current_task_index: int = 0
    history: List[Task] = field(default_factory=list)
    last_batch: List[Task] = field(default_factory=list)
    batch_completed: bool = False
    active_vote_message_id: Optional[int] = None
    current_batch_id: Optional[str] = None
    current_batch_started_at: Optional[str] = None

    @property
    def current_task(self) -> Optional[Task]:
        """Get current task."""
        if 0 <= self.current_task_index < len(self.tasks_queue):
            return self.tasks_queue[self.current_task_index]
        return None

    @property
    def current_votes(self) -> Dict[int, str]:
        """Get votes for current task."""
        task = self.current_task
        return task.votes if task else {}

    def get_participant_role(self, user_id: int) -> Optional[UserRole]:
        """Get participant role."""
        participant = self.participants.get(user_id)
        return participant.role if participant else None

    def can_vote(self, user_id: int) -> bool:
        """Check if user can vote."""
        role = self.get_participant_role(user_id)
        return role in {UserRole.PARTICIPANT, UserRole.LEAD}

    def can_manage(self, user_id: int) -> bool:
        """Check if user can manage session."""
        role = self.get_participant_role(user_id)
        return role in {UserRole.ADMIN, UserRole.LEAD}

