"""HTTP client adapter for Jira Service microservice."""

import asyncio
import logging
import os
from typing import Any, Dict, List, Optional

import aiohttp

from app.ports.jira_client import JiraClient

logger = logging.getLogger(__name__)


class JiraServiceHttpClient(JiraClient):
    """HTTP client for Jira Service microservice."""

    def __init__(self, base_url: str = None, timeout: int = 30, retry_attempts: int = 3):
        self.base_url = base_url or os.getenv("JIRA_SERVICE_URL", "http://localhost:8001")
        self._session: Optional[aiohttp.ClientSession] = None
        self._timeout = aiohttp.ClientTimeout(total=timeout)
        self._retry_attempts = max(1, retry_attempts)

    async def _get_session(self) -> aiohttp.ClientSession:
        """Get or create aiohttp session."""
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(timeout=self._timeout)
        return self._session

    async def close(self) -> None:
        """Close aiohttp session."""
        if self._session and not self._session.closed:
            await self._session.close()

    async def _post_json(self, url: str, body: dict[str, Any]) -> dict[str, Any]:
        session = await self._get_session()
        transient_statuses = {429, 500, 502, 503, 504}
        last_error: Optional[BaseException] = None
        for attempt in range(1, self._retry_attempts + 1):
            try:
                async with session.post(url, json=body) as resp:
                    if resp.status == 200:
                        return await resp.json()
                    if resp.status in transient_statuses and attempt < self._retry_attempts:
                        await asyncio.sleep(0.2 * attempt)
                        continue
                    raise RuntimeError(f"Jira Service returned status {resp.status}: {(await resp.text())[:500]}")
            except aiohttp.ClientError as exc:
                last_error = exc
                if attempt >= self._retry_attempts:
                    break
                logger.warning("Jira Service request failed, retrying: url=%s attempt=%s", url, attempt)
                await asyncio.sleep(0.2 * attempt)
        raise RuntimeError(f"Jira Service unavailable: {last_error}") from last_error

    async def search_issues(self, jql: str, max_results: int = 100) -> Optional[Dict[str, Any]]:
        """Search issues via Jira Service."""
        url = f"{self.base_url}/api/v1/search"

        try:
            data = await self._post_json(url, {"jql": jql, "max_results": max_results})
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
        except Exception as e:
            raise RuntimeError(f"Failed to search issues via Jira Service: {e}") from e

    def get_issue_url(self, issue_key: str) -> str:
        """Get issue URL (constructs from base URL)."""
        # Extract Jira base URL from service URL or use default
        jira_base = os.getenv("JIRA_URL", "https://jira.example.com")
        return f"{jira_base}/browse/{issue_key}"

    async def update_story_points(self, issue_key: str, story_points: int) -> bool:
        """Update story points via Jira Service."""
        url = f"{self.base_url}/api/v1/issue/{issue_key}/story-points"

        try:
            session = await self._get_session()
            transient_statuses = {429, 500, 502, 503, 504}
            for attempt in range(1, self._retry_attempts + 1):
                async with session.put(
                    url,
                    json={"issue_key": issue_key, "story_points": story_points},
                ) as resp:
                    if resp.status == 200:
                        return True
                    if resp.status in transient_statuses and attempt < self._retry_attempts:
                        await asyncio.sleep(0.2 * attempt)
                        continue
                    raise RuntimeError(f"Jira Service returned status {resp.status}")
            return False
        except aiohttp.ClientError as e:
            raise RuntimeError(f"Jira Service unavailable: {e}") from e
        except Exception as e:
            raise RuntimeError(f"Failed to update story points via Jira Service: {e}") from e

    async def parse_jira_request(self, text: str, max_results: int = 500) -> Optional[List[Dict[str, Any]]]:
        """Parse Jira request via Jira Service."""
        url = f"{self.base_url}/api/v1/parse"

        try:
            data = await self._post_json(url, {"jql": text, "max_results": max_results})
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
        except Exception as e:
            raise RuntimeError(f"Failed to parse Jira request via Jira Service: {e}") from e
