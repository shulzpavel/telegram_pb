"""File-based adapter for session repository."""

from pathlib import Path
from typing import Optional

from app.domain.participant import Participant
from app.domain.session import Session
from app.domain.task import Task
from app.ports.session_repository import SessionRepository
from config import UserRole
from session_store import SessionState, SessionStore


class FileSessionRepository(SessionRepository):
    """File-based implementation of session repository."""

    def __init__(self, state_file: Path):
        self.store = SessionStore(state_file)

    async def get_session(self, chat_id: int, topic_id: Optional[int]) -> Session:
        """Get or create session."""
        session_state = self.store.get_session(chat_id, topic_id)
        return self._state_to_session(session_state)

    async def save_session(self, session: Session) -> None:
        """Save session state."""
        session_state = self._session_to_state(session)
        self.store.save_session(session_state)

    async def delete_session(self, chat_id: int, topic_id: Optional[int]) -> None:
        """Delete session."""
        self.store.delete_session(chat_id, topic_id)

    def _state_to_session(self, state: SessionState) -> Session:
        """Convert SessionState to Session model."""
        participants = {
            uid: Participant.from_dict(uid, data) for uid, data in state.participants.items()
        }

        tasks_queue = [Task.from_dict(task) for task in state.tasks_queue]
        history = [Task.from_dict(task) for task in state.history]
        last_batch = [Task.from_dict(task) for task in state.last_batch]

        session = Session(
            chat_id=state.chat_id,
            topic_id=state.topic_id,
            participants=participants,
            tasks_queue=tasks_queue,
            current_task_index=state.current_task_index,
            history=history,
            last_batch=last_batch,
            batch_completed=state.batch_completed,
            active_vote_message_id=state.active_vote_message_id,
            current_batch_id=state.current_batch_id,
            current_batch_started_at=state.current_batch_started_at,
        )
        return session

    def _session_to_state(self, session: Session) -> SessionState:
        """Convert Session model to SessionState."""
        participants = {uid: p.to_dict() for uid, p in session.participants.items()}

        tasks_queue = [task.to_dict() for task in session.tasks_queue]
        history = [task.to_dict() for task in session.history]
        last_batch = [task.to_dict() for task in session.last_batch]

        # Convert votes to the format expected by SessionState
        votes = {}
        if session.current_task:
            votes = session.current_task.votes

        state = SessionState(
            chat_id=session.chat_id,
            topic_id=session.topic_id,
            participants=participants,
            votes=votes,
            tasks_queue=tasks_queue,
            current_task_index=session.current_task_index,
            history=history,
            last_batch=last_batch,
            batch_completed=session.batch_completed,
            active_vote_message_id=session.active_vote_message_id,
            current_batch_id=session.current_batch_id,
            current_batch_started_at=session.current_batch_started_at,
        )
        return state
