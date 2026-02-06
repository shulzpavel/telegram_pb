"""Session repository interface."""

from abc import ABC, abstractmethod
from typing import Optional

from app.domain.session import Session


class SessionRepository(ABC):
    """Interface for session persistence."""

    @abstractmethod
    async def get_session(self, chat_id: int, topic_id: Optional[int]) -> Session:
        """Get or create session."""
        pass

    @abstractmethod
    async def save_session(self, session: Session) -> None:
        """Save session state."""
        pass

    @abstractmethod
    async def delete_session(self, chat_id: int, topic_id: Optional[int]) -> None:
        """Delete session."""
        pass
