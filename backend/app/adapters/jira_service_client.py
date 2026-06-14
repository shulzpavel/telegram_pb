"""HTTP client adapter for Jira Service microservice."""

import asyncio
import logging
import os
from typing import Any, Dict, List, Mapping, Optional

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
        """Update story points via Jira Service.

        Retries are applied for both transient HTTP statuses (429/5xx) and
        transport-level network errors so a flaky connection does not surface
        as a failed Story Points write on the first hiccup.
        """
        url = f"{self.base_url}/api/v1/issue/{issue_key}/story-points"
        session = await self._get_session()
        transient_statuses = {429, 500, 502, 503, 504}
        last_error: Optional[BaseException] = None

        for attempt in range(1, self._retry_attempts + 1):
            try:
                async with session.put(
                    url,
                    json={"issue_key": issue_key, "story_points": story_points},
                ) as resp:
                    if resp.status == 200:
                        return True
                    if resp.status in transient_statuses and attempt < self._retry_attempts:
                        await asyncio.sleep(0.2 * attempt)
                        continue
                    body = (await resp.text())[:500]
                    raise RuntimeError(
                        f"Jira Service returned status {resp.status}: {body}"
                    )
            except aiohttp.ClientError as exc:
                last_error = exc
                if attempt >= self._retry_attempts:
                    break
                logger.warning(
                    "Jira Service update_story_points retrying: key=%s attempt=%s err=%r",
                    issue_key,
                    attempt,
                    exc,
                )
                await asyncio.sleep(0.2 * attempt)

        raise RuntimeError(f"Jira Service unavailable: {last_error}") from last_error

    async def update_story_points_fields(self, issue_key: str, fields: Mapping[str, int]) -> Dict[str, bool]:
        """Update multiple SP fields via Jira Service with partial success."""
        url = f"{self.base_url}/api/v1/issue/{issue_key}/story-points/fields"
        session = await self._get_session()
        async with session.put(url, json={"issue_key": issue_key, "fields": dict(fields)}) as resp:
            if resp.status != 200:
                return {field_id: False for field_id in fields}
            data = await resp.json()
        results = data.get("results") if isinstance(data, dict) else None
        if not isinstance(results, dict):
            return {field_id: False for field_id in fields}
        return {str(field_id): bool(ok) for field_id, ok in results.items()}

    async def add_issue_comment(self, issue_key: str, text: str) -> dict[str, Any]:
        """Append a comment through Jira Service."""
        url = f"{self.base_url}/api/v1/issue/{issue_key}/comment"
        try:
            return await self._post_json(url, {"text": text})
        except Exception as e:
            raise RuntimeError(f"Failed to add Jira comment via Jira Service: {e}") from e

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

    async def parse_jira_scope_issues(
        self,
        text: str,
        max_results: int = 500,
        *,
        force_refresh: bool = False,
        milestone_status_targets: Optional[list[str]] = None,
        enrich_changelog: bool = True,
    ) -> Optional[List[Dict[str, Any]]]:
        """Fetch scope-dashboard issues via Jira Service."""
        url = f"{self.base_url}/api/v1/search/scope"
        payload: dict[str, Any] = {
            "jql": text,
            "max_results": max_results,
            "force_refresh": force_refresh,
            "enrich_changelog": enrich_changelog,
        }
        if milestone_status_targets:
            payload["milestone_status_targets"] = milestone_status_targets
        try:
            data = await self._post_json(url, payload)
            issues = data.get("issues", [])
            return [
                {
                    "key": issue["key"],
                    "summary": issue["summary"],
                    "url": issue["url"],
                    "story_points": issue.get("story_points"),
                    "story_points_source": issue.get("story_points_source"),
                    "story_points_plan": issue.get("story_points_plan"),
                    "story_points_fact": issue.get("story_points_fact"),
                    "story_points_dev": issue.get("story_points_dev"),
                    "story_points_test": issue.get("story_points_test"),
                    "story_point_estimate": issue.get("story_point_estimate"),
                    "status": issue.get("status") or {},
                    "issue_type": {"name": issue.get("issue_type") or ""},
                    "labels": issue.get("labels") or [],
                    "created": issue.get("created"),
                    "updated": issue.get("updated"),
                    "status_changed_at": issue.get("status_changed_at"),
                    "status_entered_at": issue.get("status_entered_at"),
                    "epic_linked_at": issue.get("epic_linked_at"),
                    "due_date": issue.get("due_date"),
                    "resolution": issue.get("resolution"),
                    "resolution_date": issue.get("resolution_date"),
                    "parent_key": issue.get("parent_key"),
                    "epic_key": issue.get("epic_key"),
                    "priority": issue.get("priority"),
                    "assignee": issue.get("assignee"),
                    "developer": issue.get("developer"),
                    "developer_source": issue.get("developer_source"),
                    "role_contributors": issue.get("role_contributors") or {},
                    "role_contributors_list": issue.get("role_contributors_list") or [],
                    "role_workload_items": issue.get("role_workload_items") or [],
                    "role_evidence": issue.get("role_evidence") or [],
                    "story_points_front": issue.get("story_points_front"),
                    "story_points_back": issue.get("story_points_back"),
                    "story_points_qa": issue.get("story_points_qa"),
                    "reporter": issue.get("reporter"),
                    "components": issue.get("components") or [],
                    "fix_versions": issue.get("fix_versions") or [],
                    "versions": issue.get("versions") or [],
                    "sprints": issue.get("sprints") or [],
                    "sprint": issue.get("sprint"),
                    "team": issue.get("team"),
                    "team_labels": issue.get("team_labels") or [],
                    "plan_status": issue.get("plan_status"),
                    "plan_change_reason": issue.get("plan_change_reason"),
                    "plan_change_reasons": issue.get("plan_change_reasons") or [],
                    "final_priority": issue.get("final_priority"),
                    "severity": issue.get("severity"),
                    "domain": issue.get("domain"),
                    "request_type": issue.get("request_type"),
                    "checklist_progress": issue.get("checklist_progress"),
                    "last_comment": issue.get("last_comment"),
                    "last_comment_author": issue.get("last_comment_author"),
                    "last_comment_at": issue.get("last_comment_at"),
                }
                for issue in issues
            ]
        except Exception as e:
            raise RuntimeError(f"Failed to fetch scope issues via Jira Service: {e}") from e
