"""Voting service for Planning Poker."""

from collections import Counter
from datetime import datetime
from typing import List

from app.models.session import Session
from app.models.task import Task


class VotingService:
    """Service for managing voting logic."""

    @staticmethod
    def count_votes(votes: dict) -> int:
        """Count total number of votes."""
        return len(votes)

    @staticmethod
    def get_most_common_vote(votes: dict) -> int:
        """Get most common vote value (ignoring 'skip' votes)."""
        if not votes:
            return 0
        # Фильтруем skip голоса
        valid_votes = {k: v for k, v in votes.items() if v != "skip"}
        if not valid_votes:
            return 0
        vote_counts = Counter(valid_votes.values())
        most_common = vote_counts.most_common(1)[0][0]
        try:
            return int(most_common)
        except (ValueError, TypeError):
            return 0

    @staticmethod
    def get_max_vote(votes: dict) -> int:
        """Get maximum vote value (ignoring 'skip' votes)."""
        if not votes:
            return 0
        numeric_votes = []
        for vote in votes.values():
            # Пропускаем голоса "skip"
            if vote == "skip":
                continue
            try:
                numeric_votes.append(int(vote))
            except (ValueError, TypeError):
                continue
        if not numeric_votes:
            return 0
        return max(numeric_votes)

    @staticmethod
    def calculate_average_vote(votes: dict) -> float:
        """Calculate average vote value (ignoring 'skip' votes)."""
        if not votes:
            return 0.0
        numeric_votes = []
        for vote in votes.values():
            # Пропускаем голоса "skip"
            if vote == "skip":
                continue
            try:
                numeric_votes.append(int(vote))
            except (ValueError, TypeError):
                continue
        if not numeric_votes:
            return 0.0
        return sum(numeric_votes) / len(numeric_votes)

    @staticmethod
    def all_voters_voted(session: Session) -> bool:
        """Check if all eligible voters have voted (including skip votes)."""
        if not session.current_task:
            return False
        eligible_voters = [uid for uid in session.participants if session.can_vote(uid)]
        if not eligible_voters:
            return False
        current_votes = session.current_task.votes
        # Учитываем всех, кто проголосовал или пропустил
        return len(current_votes) >= len(eligible_voters)

    @staticmethod
    def complete_task(session: Session) -> None:
        """Mark current task as completed."""
        if session.current_task:
            session.current_task.completed_at = datetime.utcnow().isoformat()

    @staticmethod
    def finish_batch(session: Session) -> List[Task]:
        """Finish current batch and move tasks to history."""
        completed_tasks = []
        finished_at = datetime.utcnow().isoformat()

        for task in session.tasks_queue:
            task.completed_at = finished_at
            completed_tasks.append(task)

        session.last_batch = completed_tasks.copy()
        session.history.extend(completed_tasks)
        session.tasks_queue.clear()
        session.current_task_index = 0
        session.batch_completed = True
        session.active_vote_message_id = None
        # Сбрасываем метку времени начала батча
        session.current_batch_started_at = None

        return completed_tasks

