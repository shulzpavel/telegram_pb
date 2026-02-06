"""Use case for showing voting results."""

from typing import List, Optional, Tuple

from app.domain.session import Session
from app.domain.task import Task
from app.ports.session_repository import SessionRepository


class VotingPolicy:
    """Policy for calculating voting results."""

    @staticmethod
    def get_max_vote(votes: dict) -> int:
        """Get maximum vote value (ignoring 'skip' votes)."""
        if not votes:
            return 0
        numeric_votes = []
        for vote in votes.values():
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
    def get_most_common_vote(votes: dict) -> int:
        """Get most common vote value (ignoring 'skip' votes)."""
        from collections import Counter
        
        if not votes:
            return 0
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
    def calculate_average_vote(votes: dict) -> float:
        """Calculate average vote value (ignoring 'skip' votes)."""
        if not votes:
            return 0.0
        numeric_votes = []
        for vote in votes.values():
            if vote == "skip":
                continue
            try:
                numeric_votes.append(int(vote))
            except (ValueError, TypeError):
                continue
        if not numeric_votes:
            return 0.0
        return sum(numeric_votes) / len(numeric_votes)


class ShowResultsUseCase:
    """Use case for showing voting results."""

    def __init__(self, session_repo: SessionRepository):
        self.session_repo = session_repo
        self.policy = VotingPolicy()

    def get_batch_results(self, chat_id: int, topic_id: Optional[int]) -> Optional[List[Task]]:
        """Get last batch results."""
        session = self.session_repo.get_session(chat_id, topic_id)
        return session.last_batch if session.last_batch else None

    def get_day_summary(self, chat_id: int, topic_id: Optional[int]) -> Tuple[List[Task], int]:
        """Get day summary with total story points."""
        session = self.session_repo.get_session(chat_id, topic_id)
        total_sp = sum(self.policy.get_max_vote(task.votes) for task in session.history)
        return session.history, total_sp
