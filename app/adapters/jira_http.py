"""HTTP adapter for Jira API client."""

import re
from typing import Any, Dict, Iterable, List, Optional

import aiohttp

from app.ports.jira_client import JiraClient


class JiraHttpClient(JiraClient):
    """HTTP implementation of Jira client."""

    def __init__(
        self,
        base_url: str,
        username: str,
        api_token: str,
        story_points_field: str,
        timeout: int = 30,
    ) -> None:
        self.base_url = base_url
        self.username = username
        self.api_token = api_token
        self.story_points_field = story_points_field
        self._key_pattern = re.compile(r"\b([A-Z][A-Z0-9]+-\d+)\b")
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

        for version in versions:
            url = f"{self.base_url}/rest/api/{version}/{endpoint}"
            try:
                async with session.request(
                    method, url, auth=auth, headers=headers, json=data
                ) as response:
                    # Handle redirects and deprecated endpoints
                    if response.status in {301, 302, 303, 307, 308, 404, 410}:
                        if version != versions[-1]:
                            continue
                        if response.status in {404, 410}:
                            return None

                    response.raise_for_status()

                    if response.status == 204 or response.content_length == 0:
                        return {"success": True}

                    return await response.json()

            except aiohttp.ClientResponseError as error:
                status = error.status
                # If API version is unavailable (e.g., 410), try next version
                if status in {301, 302, 303, 307, 308, 404, 410} and version != versions[-1]:
                    continue
                # For authentication errors (401), provide detailed information
                if status == 401:
                    try:
                        body = await error.response.text()
                    except Exception:
                        body = "<no body>"
                    print(f"Jira API authentication error (401): {body}")
                    print(f"  URL: {url}")
                    print(f"  Username: {self.username}")
                    print(f"  Token: {self.api_token[:20] if self.api_token else 'None'}...")
                    # Don't continue attempts for auth errors
                    return None
                # For 404 (not found) and 403 (no permissions) errors, silently return None
                if status in {404, 403}:
                    return None
                # For other errors, print information only if not 410 (deprecated API)
                if status != 410:
                    try:
                        body = await error.response.text()
                    except Exception:
                        body = "<no body>"
                    print(f"Jira API error {status}: {body}")
            except aiohttp.ClientError as error:
                print(f"Jira API error: {error}")
                break
            except ValueError as error:
                print(f"JSON parsing error: {error!r}")
                continue

        return None

    async def search_issues(self, jql: str, max_results: int = 100) -> Optional[Dict[str, Any]]:
        """Execute search for issues using arbitrary JQL."""
        payload = {
            "jql": jql,
            "maxResults": max_results,
            "fields": ["summary", self.story_points_field, "key"],
        }

        # Try new endpoint /rest/api/3/search
        result = await self._make_request("POST", "search", payload, api_versions=["3"])
        if result and result.get("issues"):
            return result

        # If that didn't work, try legacy endpoint /rest/api/3/search/jql
        legacy_payload = {"jql": jql, "maxResults": max_results}
        legacy_result = await self._make_request("POST", "search/jql", legacy_payload, api_versions=["3"])

        if legacy_result and legacy_result.get("issues"):
            issues = legacy_result["issues"]
            # If response only contains IDs, fetch full information
            if issues and "id" in issues[0] and "key" not in issues[0]:
                issue_ids = [issue["id"] for issue in issues]
                detailed_issues = []
                for issue_id in issue_ids:
                    detail = await self._make_request("GET", f"issue/{issue_id}", api_versions=["3", "2"])
                    if detail:
                        detailed_issues.append(detail)
                if detailed_issues:
                    return {"issues": detailed_issues}
            else:
                return legacy_result

        return None

    def get_issue_url(self, issue_key: str) -> str:
        """Get URL for issue."""
        return f"{self.base_url}/browse/{issue_key}"

    async def update_story_points(self, issue_key: str, story_points: int) -> bool:
        """Update story points for issue."""
        payload = {"fields": {self.story_points_field: story_points}}
        result = await self._make_request("PUT", f"issue/{issue_key}", payload, api_versions=["3", "2"])
        return result is not None

    async def parse_jira_request(self, text: str) -> Optional[List[Dict[str, Any]]]:
        """Return list of tasks by JQL."""
        if not text:
            return None

        jql = text.strip()
        if not jql:
            return None

        try:
            response = await self.search_issues(jql)
            if not response or "issues" not in response:
                print("No issues from search")
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
            print(f"Error processing Jira request: {error}")
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
