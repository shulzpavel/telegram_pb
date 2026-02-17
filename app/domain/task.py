"""Task model for Planning Poker."""

from dataclasses import dataclass, field
from typing import Any, Dict, Optional


@dataclass
class Task:
    """Represents a task for voting."""

    jira_key: Optional[str] = None
    summary: str = ""
    url: Optional[str] = None
    story_points: Optional[int] = None
    votes: Dict[int, str] = field(default_factory=dict)
    completed_at: Optional[str] = None
    jql: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert task to dictionary."""
        return {
            "jira_key": self.jira_key,
            "summary": self.summary,
            "url": self.url,
            "story_points": self.story_points,
            "votes": {str(k): v for k, v in self.votes.items()},
            "completed_at": self.completed_at,
            "jql": self.jql,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Task":
        """Create task from dictionary."""
        votes = {}
        if "votes" in data and isinstance(data["votes"], dict):
            try:
                votes = {int(k): v for k, v in data["votes"].items()}
            except (ValueError, TypeError):
                votes = {}
        return cls(
            jira_key=data.get("jira_key"),
            summary=data.get("summary", ""),
            url=data.get("url"),
            story_points=data.get("story_points"),
            votes=votes,
            completed_at=data.get("completed_at"),
            jql=data.get("jql"),
        )

    @property
    def text(self) -> str:
        """Get task text representation."""
        parts = [self.summary]
        if self.url:
            parts.append(self.url)
        return " ".join(parts).strip()

