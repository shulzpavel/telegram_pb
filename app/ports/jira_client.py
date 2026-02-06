"""Jira client interface."""

from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional


class JiraClient(ABC):
    """Interface for Jira API client."""

    @abstractmethod
    async def search_issues(self, jql: str, max_results: int = 100) -> Optional[Dict[str, Any]]:
        """Execute search for issues using arbitrary JQL."""
        pass

    @abstractmethod
    def get_issue_url(self, issue_key: str) -> str:
        """Get URL for issue."""
        pass

    @abstractmethod
    async def update_story_points(self, issue_key: str, story_points: int) -> bool:
        """Update story points for issue."""
        pass

    @abstractmethod
    async def parse_jira_request(self, text: str) -> Optional[List[Dict[str, Any]]]:
        """Return list of tasks by JQL or issue keys."""
        pass
