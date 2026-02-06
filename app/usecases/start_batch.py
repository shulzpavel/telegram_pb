"""Use case for starting voting batch."""

from datetime import datetime
from typing import Optional

from app.domain.session import Session
from app.ports.session_repository import SessionRepository


class StartBatchUseCase:
    """Use case for starting voting session."""

    def __init__(self, session_repo: SessionRepository):
        self.session_repo = session_repo

    async def execute(self, chat_id: int, topic_id: Optional[int]) -> bool:
        """Start voting session for tasks."""
        session = await self.session_repo.get_session(chat_id, topic_id)
        
        if not session.tasks_queue:
            return False
        
        session.current_task_index = 0
        session.batch_completed = False
        session.current_batch_started_at = datetime.utcnow().isoformat()
        if session.current_task:
            session.current_task.votes.clear()
        
        await self.session_repo.save_session(session)
        return True
