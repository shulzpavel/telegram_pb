"""HTTP client adapter for Jira Service microservice."""

import os
from typing import Any, Dict, List, Optional

import aiohttp

from app.ports.jira_client import JiraClient


class JiraServiceHttpClient(JiraClient):
    """HTTP client for Jira Service microservice."""

    def __init__(self, base_url: str = None, timeout: int = 30):
        self.base_url = base_url or os.getenv("JIRA_SERVICE_URL", "http://localhost:8001")
        self._session: Optional[aiohttp.ClientSession] = None
        self._timeout = aiohttp.ClientTimeout(total=timeout)

    async def _get_session(self) -> aiohttp.ClientSession:
        """Get or create aiohttp session."""
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(timeout=self._timeout)
        return self._session

    async def close(self) -> None:
        """Close aiohttp session."""
        if self._session and not self._session.closed:
            await self._session.close()

    async def search_issues(self, jql: str, max_results: int = 100) -> Optional[Dict[str, Any]]:
        """Search issues via Jira Service."""
        session = await self._get_session()
        url = f"{self.base_url}/api/v1/search"
        
        try:
            async with session.post(
                url,
                json={"jql": jql, "max_results": max_results},
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    # Convert response format to match expected format
                    issues = data.get("issues", [])
                    return {
                        "issues": [
                            {
                                "key": issue["key"],
                                "summary": issue["summary"],
                                "url": issue["url"],
                                "story_points": issue.get("story_points", 0),
                            }
                            for issue in issues
                        ]
                    }
                raise RuntimeError(f"Jira Service returned status {resp.status}")
        except aiohttp.ClientError as e:
            raise RuntimeError(f"Jira Service unavailable: {e}") from e
        except Exception as e:
            raise RuntimeError(f"Failed to search issues via Jira Service: {e}") from e

    def get_issue_url(self, issue_key: str) -> str:
        """Get issue URL (constructs from base URL)."""
        # Extract Jira base URL from service URL or use default
        jira_base = os.getenv("JIRA_URL", "https://jira.example.com")
        return f"{jira_base}/browse/{issue_key}"

    async def update_story_points(self, issue_key: str, story_points: int) -> bool:
        """Update story points via Jira Service."""
        session = await self._get_session()
        url = f"{self.base_url}/api/v1/issue/{issue_key}/story-points"
        
        try:
            async with session.put(
                url,
                json={"issue_key": issue_key, "story_points": story_points},
            ) as resp:
                if resp.status == 200:
                    return True
                raise RuntimeError(f"Jira Service returned status {resp.status}")
        except aiohttp.ClientError as e:
            raise RuntimeError(f"Jira Service unavailable: {e}") from e
        except Exception as e:
            raise RuntimeError(f"Failed to update story points via Jira Service: {e}") from e

    async def parse_jira_request(self, text: str) -> Optional[List[Dict[str, Any]]]:
        """Parse Jira request via Jira Service."""
        session = await self._get_session()
        url = f"{self.base_url}/api/v1/parse"
        
        try:
            async with session.post(
                url,
                json={"jql": text, "max_results": 100},
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    issues = data.get("issues", [])
                    return [
                        {
                            "key": issue["key"],
                            "summary": issue["summary"],
                            "url": issue["url"],
                            "story_points": issue.get("story_points", 0),
                        }
                        for issue in issues
                    ]
                raise RuntimeError(f"Jira Service returned status {resp.status}")
        except aiohttp.ClientError as e:
            raise RuntimeError(f"Jira Service unavailable: {e}") from e
        except Exception as e:
            raise RuntimeError(f"Failed to parse Jira request via Jira Service: {e}") from e
