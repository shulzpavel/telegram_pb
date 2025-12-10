"""Participant model for Planning Poker."""

from dataclasses import dataclass
from typing import Any, Dict

from config import UserRole


@dataclass
class Participant:
    """Represents a participant in a session."""

    user_id: int
    name: str
    role: UserRole

    def to_dict(self) -> Dict[str, Any]:
        """Convert participant to dictionary."""
        return {
            "name": self.name,
            "role": self.role.value,
        }

    @classmethod
    def from_dict(cls, user_id: int, data: Dict[str, Any]) -> "Participant":
        """Create participant from dictionary."""
        return cls(
            user_id=user_id,
            name=data.get("name", "Unknown"),
            role=UserRole(data.get("role", UserRole.PARTICIPANT.value)),
        )

