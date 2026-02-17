"""Use case for 'needs review' - move current task to end of queue."""

from typing import Optional, Tuple

from app.domain.session import Session
from app.domain.task import Task
from app.ports.session_repository import SessionRepository


class NeedsReviewUseCase:
    """Use case for moving current task to end of queue for re-voting."""

    def __init__(self, session_repo: SessionRepository):
        self.session_repo = session_repo

    async def execute(
        self,
        chat_id: int,
        topic_id: Optional[int],
        user_id: int,
    ) -> Tuple[bool, Optional[Session]]:
        """Move current task to end of queue. Caller must check can_manage before.
        Returns (batch_finished, updated_session).
        """
        session = await self.session_repo.get_session(chat_id, topic_id)

        if not session.current_task:
            return False, session

        current_index = session.current_task_index
        task_to_review = session.current_task
        was_single_task = len(session.tasks_queue) == 1

        task = session.tasks_queue.pop(current_index)
        task.votes.clear()
        session.tasks_queue.append(task)

        if was_single_task:
            session.active_vote_message_id = None
            await self.session_repo.save_session(session)
            return True, session

        # После pop+append: если были на последней задаче, переходим к предыдущей
        if current_index >= len(session.tasks_queue) - 1:
            session.current_task_index = max(0, current_index - 1)

        session.active_vote_message_id = None
        await self.session_repo.save_session(session)

        # Есть ли следующая задача для голосования?
        next_task = session.current_task
        batch_finished = next_task is None or next_task == task_to_review
        return batch_finished, session
