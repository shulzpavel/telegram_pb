"""HTTP adapter for Jira API client."""

import asyncio
import logging
import os
import re
from typing import Any, Dict, Iterable, List, Optional
from urllib.parse import quote

import aiohttp

from app.ports.jira_client import JiraClient
from app.utils.jira_text import adf_to_plain_text, truncate_text

logger = logging.getLogger(__name__)


class JiraHttpClient(JiraClient):
    """HTTP implementation of Jira client."""

    def __init__(
        self,
        base_url: str,
        username: str,
        api_token: str,
        story_points_field: str,
        timeout: int = 30,
        retry_attempts: int = 3,
    ) -> None:
        self.base_url = base_url
        self.username = username
        self.api_token = api_token
        self.story_points_field = story_points_field
        self._key_pattern = re.compile(r"\b([A-Z][A-Z0-9]+-\d+)\b")
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

    async def _make_request(
        self,
        method: str,
        endpoint: str,
        data: Optional[Dict[str, Any]] = None,
        api_versions: Optional[Iterable[str]] = None,
    ) -> Optional[Dict[str, Any]]:
        """Execute async HTTP request to Jira, trying multiple API versions."""
        if not self.api_token or not self.username:
            return None

        headers = {"Accept": "application/json", "Content-Type": "application/json"}
        auth = aiohttp.BasicAuth(self.username, self.api_token)
        method = method.upper()
        versions = list(api_versions or ["3"])

        session = await self._get_session()
        transient_statuses = {429, 500, 502, 503, 504}

        for version in versions:
            url = f"{self.base_url}/rest/api/{version}/{endpoint}"
            for attempt in range(1, self._retry_attempts + 1):
                try:
                    async with session.request(
                        method, url, auth=auth, headers=headers, json=data
                    ) as response:
                        # Handle redirects and deprecated endpoints
                        if response.status in {301, 302, 303, 307, 308, 404, 410}:
                            if version != versions[-1]:
                                break
                            if response.status in {404, 410}:
                                return None

                        if response.status in transient_statuses and attempt < self._retry_attempts:
                            logger.warning(
                                "Jira API transient status, retrying: status=%s endpoint=%s attempt=%s",
                                response.status,
                                endpoint,
                                attempt,
                            )
                            await asyncio.sleep(0.25 * attempt)
                            continue

                        response.raise_for_status()

                        if response.status == 204 or response.content_length == 0:
                            return {"success": True}

                        return await response.json()

                except aiohttp.ClientResponseError as error:
                    status = error.status
                    # If API version is unavailable (e.g., 410), try next version
                    if status in {301, 302, 303, 307, 308, 404, 410} and version != versions[-1]:
                        break
                    # For authentication errors (401), provide detailed information without leaking token
                    if status == 401:
                        try:
                            body = await error.response.text()
                        except Exception:
                            body = "<no body>"
                        logger.error(
                            "Jira API authentication error: status=401 url=%s username=%s token=%s body=%s",
                            url,
                            self.username,
                            "***",
                            body,
                        )
                        return None
                    if status in {404, 403}:
                        return None
                    try:
                        body = await error.response.text()
                    except Exception:
                        body = "<no body>"
                    logger.warning("Jira API error: status=%s url=%s body=%s", status, url, body)
                    if status in transient_statuses and attempt < self._retry_attempts:
                        await asyncio.sleep(0.25 * attempt)
                        continue
                except aiohttp.ClientError as error:
                    logger.warning("Jira API request failed: url=%s attempt=%s error=%s", url, attempt, error)
                    if attempt < self._retry_attempts:
                        await asyncio.sleep(0.25 * attempt)
                        continue
                    break
                except ValueError as error:
                    logger.warning("Jira API JSON parsing error: url=%s error=%r", url, error)
                    break

        return None

    async def search_issues(self, jql: str, max_results: int = 100) -> Optional[Dict[str, Any]]:
        """Execute search for issues using arbitrary JQL."""
        max_results = max(1, min(max_results, 1000))
        page_size = min(100, max_results)
        issues: List[Dict[str, Any]] = []
        start_at = 0

        while len(issues) < max_results:
            payload = {
                "jql": jql,
                "startAt": start_at,
                "maxResults": min(page_size, max_results - len(issues)),
                "fields": ["summary", self.story_points_field, "key"],
            }
            result = await self._make_request("POST", "search", payload, api_versions=["3"])
            page = result.get("issues", []) if result else []
            if not page:
                break
            issues.extend(page)
            total = result.get("total") if result else None
            start_at += len(page)
            if len(page) < payload["maxResults"] or (isinstance(total, int) and start_at >= total):
                break

        if issues:
            return {"issues": issues[:max_results], "maxResults": max_results}

        legacy_issues: List[Dict[str, Any]] = []
        next_page_token: Optional[str] = None
        while len(legacy_issues) < max_results:
            legacy_payload: Dict[str, Any] = {
                "jql": jql,
                "maxResults": min(page_size, max_results - len(legacy_issues)),
                "fields": ["summary", self.story_points_field, "key"],
            }
            if next_page_token:
                legacy_payload["nextPageToken"] = next_page_token
            legacy_result = await self._make_request("POST", "search/jql", legacy_payload, api_versions=["3"])
            page = legacy_result.get("issues", []) if legacy_result else []
            if not page:
                break
            legacy_issues.extend(page)
            next_page_token = legacy_result.get("nextPageToken") if legacy_result else None
            if not next_page_token or len(page) < legacy_payload["maxResults"]:
                break

        if legacy_issues:
            if legacy_issues and "id" in legacy_issues[0] and "key" not in legacy_issues[0]:
                detailed_issues = []
                for issue in legacy_issues[:max_results]:
                    detail = await self._make_request("GET", f"issue/{issue['id']}", api_versions=["3", "2"])
                    if detail:
                        detailed_issues.append(detail)
                if detailed_issues:
                    return {"issues": detailed_issues}
            return {"issues": legacy_issues[:max_results], "maxResults": max_results}

        return None

    def get_issue_url(self, issue_key: str) -> str:
        """Get URL for issue."""
        return f"{self.base_url}/browse/{issue_key}"

    async def update_story_points(self, issue_key: str, story_points: int) -> bool:
        """Update story points for issue."""
        payload = {"fields": {self.story_points_field: story_points}}
        result = await self._make_request("PUT", f"issue/{issue_key}", payload, api_versions=["3", "2"])
        return result is not None

    async def parse_jira_request(self, text: str, max_results: int = 500) -> Optional[List[Dict[str, Any]]]:
        """Return list of tasks by JQL."""
        if not text:
            return None

        jql = text.strip()
        if not jql:
            return None

        try:
            response = await self.search_issues(jql, max_results=max_results)
            if not response or "issues" not in response:
                logger.info("No Jira issues from search")
                # Fallback: if search didn't work, try to get tasks by keys from JQL
                fallback_issues: List[Dict[str, Any]] = []
                for key in self._key_pattern.findall(text):
                    details = await self._fetch_issue_by_key(key)
                    if details:
                        fallback_issues.append(details)
                return fallback_issues or None

            issues: List[Dict[str, Any]] = []
            for issue in response.get("issues", []):
                issue_key = issue.get("key")
                if not issue_key:
                    continue

                fields = issue.get("fields", {})
                summary = fields.get("summary", issue_key)
                raw_story_points = fields.get(self.story_points_field)
                story_points = raw_story_points if isinstance(raw_story_points, (int, float)) else 0

                issues.append(
                    {
                        "key": issue_key,
                        "summary": summary,
                        "url": self.get_issue_url(issue_key),
                        "story_points": story_points,
                    }
                )

            return issues or None
        except Exception as error:
            logger.warning("Error processing Jira request: %s", error)
            # Fallback: if search didn't work, try to get tasks by keys from JQL
            fallback_issues: List[Dict[str, Any]] = []
            for key in self._key_pattern.findall(text):
                details = await self._fetch_issue_by_key(key)
                if details:
                    fallback_issues.append(details)
            return fallback_issues or None

    async def _fetch_issue_by_key(self, issue_key: str) -> Optional[Dict[str, Any]]:
        """Fetch issue details by key."""
        issue = await self._make_request("GET", f"issue/{issue_key}", api_versions=["3", "2"])
        if not issue:
            return None

        fields = issue.get("fields", {})
        summary = fields.get("summary", issue_key)
        raw_story_points = fields.get(self.story_points_field)
        story_points = raw_story_points if isinstance(raw_story_points, (int, float)) else 0

        return {
            "key": issue_key,
            "summary": summary,
            "url": self.get_issue_url(issue_key),
            "story_points": story_points,
        }

    def _issue_context_from_fields(self, issue_key: str, fields: Dict[str, Any]) -> Dict[str, Any]:
        summary = str(fields.get("summary") or issue_key)
        raw_description = fields.get("description")
        if isinstance(raw_description, dict):
            description = adf_to_plain_text(raw_description)
        else:
            description = str(raw_description or "").strip()

        max_chars = max(500, int(os.getenv("ANTHROPIC_MAX_CONTEXT_CHARS", "6000")))
        description = truncate_text(description, max_chars)

        issue_type_field = fields.get("issuetype") or {}
        issue_type = issue_type_field.get("name") if isinstance(issue_type_field, dict) else None

        labels = [str(item) for item in (fields.get("labels") or []) if item]
        components = [
            str(component.get("name"))
            for component in (fields.get("components") or [])
            if isinstance(component, dict) and component.get("name")
        ]

        raw_story_points = fields.get(self.story_points_field)
        story_points = raw_story_points if isinstance(raw_story_points, (int, float)) else None

        return {
            "key": issue_key,
            "summary": summary,
            "url": self.get_issue_url(issue_key),
            "description": description,
            "issue_type": issue_type,
            "labels": labels[:20],
            "components": components[:20],
            "story_points": story_points,
        }

    async def fetch_issue_context(self, issue_key: str) -> Optional[Dict[str, Any]]:
        """Fetch issue fields used for LLM planning hints."""
        fields_list = quote(
            f"summary,description,labels,components,issuetype,{self.story_points_field}",
            safe=",",
        )
        issue = await self._make_request(
            "GET",
            f"issue/{issue_key}?fields={fields_list}",
            api_versions=["3", "2"],
        )
        if not issue:
            return None
        fields = issue.get("fields") or {}
        return self._issue_context_from_fields(issue_key, fields)
