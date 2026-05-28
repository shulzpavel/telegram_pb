"""HTTP adapter for Jira API client."""

import asyncio
import html
import logging
import os
import re
from typing import Any, Dict, Iterable, List, Optional
from urllib.parse import parse_qs, quote, urljoin, urlparse

import aiohttp

from app.ports.jira_client import JiraClient
from app.utils.jira_html import html_to_plain_text, sanitize_jira_html
from app.utils.jira_text import adf_to_plain_text, truncate_text

logger = logging.getLogger(__name__)

_URL_RE = re.compile(r"https?://[^\s<>'\")]+", re.IGNORECASE)


def _normalise_base_url(value: str) -> str:
    return (value or "").strip().rstrip("/")


def _default_confluence_base_url(jira_base_url: str) -> str:
    parsed = urlparse(jira_base_url or "")
    if not parsed.scheme or not parsed.netloc:
        return ""
    return f"{parsed.scheme}://{parsed.netloc}/wiki"


def _confluence_page_id_from_url(url: str, confluence_base_url: str) -> Optional[str]:
    parsed_url = urlparse(url)
    parsed_base = urlparse(confluence_base_url)
    if not parsed_url.scheme or not parsed_url.netloc or not parsed_base.netloc:
        return None
    if parsed_url.netloc.lower() != parsed_base.netloc.lower():
        return None

    query_page_id = (parse_qs(parsed_url.query).get("pageId") or [None])[0]
    if query_page_id and query_page_id.isdigit():
        return query_page_id

    path = parsed_url.path
    match = re.search(r"/pages/(\d+)(?:/|$)", path)
    if match:
        return match.group(1)
    return None


def _extract_urls_from_adf(node: Any) -> list[str]:
    urls: list[str] = []
    if isinstance(node, list):
        for item in node:
            urls.extend(_extract_urls_from_adf(item))
        return urls
    if not isinstance(node, dict):
        return urls

    for mark in node.get("marks") or []:
        if isinstance(mark, dict):
            attrs = mark.get("attrs") or {}
            href = attrs.get("href")
            if isinstance(href, str):
                urls.append(href)
    for child in node.get("content") or []:
        urls.extend(_extract_urls_from_adf(child))
    return urls


def extract_confluence_page_ids(
    *,
    confluence_base_url: str,
    description: str = "",
    description_html: str = "",
    description_adf: Any = None,
) -> list[str]:
    """Extract safe Confluence page ids from Jira text/html/ADF fields."""
    if not confluence_base_url:
        return []
    candidates = []
    candidates.extend(_URL_RE.findall(description or ""))
    candidates.extend(_URL_RE.findall(description_html or ""))
    candidates.extend(_extract_urls_from_adf(description_adf))

    page_ids: list[str] = []
    seen: set[str] = set()
    for candidate in candidates:
        page_id = _confluence_page_id_from_url(candidate.rstrip(".,;"), confluence_base_url)
        if page_id and page_id not in seen:
            page_ids.append(page_id)
            seen.add(page_id)
    return page_ids


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
        self.confluence_base_url = _normalise_base_url(
            os.getenv("CONFLUENCE_BASE_URL") or _default_confluence_base_url(base_url)
        )
        self.confluence_username = os.getenv("CONFLUENCE_USERNAME") or username
        self.confluence_api_token = os.getenv("CONFLUENCE_API_TOKEN") or api_token
        self._confluence_max_pages = max(0, int(os.getenv("CONFLUENCE_MAX_PAGES_PER_ISSUE", "2")))

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

    def _issue_context_from_fields(
        self,
        issue_key: str,
        fields: Dict[str, Any],
        rendered_fields: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        summary = str(fields.get("summary") or issue_key)
        raw_description = fields.get("description")
        if isinstance(raw_description, dict):
            description = adf_to_plain_text(raw_description)
            # Keep the raw ADF tree alongside the plain-text projection.
            # The voter UI renders this to preserve original Jira
            # formatting (lists, headings, code, links). The plain text
            # is still what the AI prompt consumes.
            description_adf: Optional[Dict[str, Any]] = raw_description
        else:
            description = str(raw_description or "").strip()
            description_adf = None
            if raw_description is not None and not isinstance(raw_description, str):
                logger.warning(
                    "jira description unexpected type key=%s type=%s",
                    issue_key,
                    type(raw_description).__name__,
                )

        # Jira Cloud can return description as a flat string when the REST
        # client fell back to API v2, OR when ADF exists but the voter UI
        # needs the same look as Jira itself. ``renderedFields.description``
        # is server-rendered HTML — closest match to what you see in Jira.
        description_html: Optional[str] = None
        if rendered_fields and isinstance(rendered_fields, dict):
            raw_html = rendered_fields.get("description")
            if isinstance(raw_html, str) and raw_html.strip():
                description_html = sanitize_jira_html(raw_html) or None

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
            "description_adf": description_adf,
            "description_html": description_html,
            "issue_type": issue_type,
            "labels": labels[:20],
            "components": components[:20],
            "story_points": story_points,
        }

    def _confluence_configured(self) -> bool:
        return bool(
            self.confluence_base_url
            and self.confluence_username
            and self.confluence_api_token
            and self._confluence_max_pages > 0
        )

    async def _fetch_confluence_page_context(self, page_id: str) -> Optional[Dict[str, Any]]:
        """Fetch a Confluence page by id and return sanitized display context."""
        if not self._confluence_configured() or not page_id.isdigit():
            return None

        session = await self._get_session()
        auth = aiohttp.BasicAuth(self.confluence_username, self.confluence_api_token)
        url = f"{self.confluence_base_url}/rest/api/content/{page_id}?expand=body.view,_links"
        try:
            async with session.get(
                url,
                auth=auth,
                headers={"Accept": "application/json"},
            ) as response:
                if response.status in {401, 403, 404}:
                    logger.warning("Confluence page fetch non-200 page_id=%s status=%s", page_id, response.status)
                    return None
                response.raise_for_status()
                data = await response.json()
        except Exception as error:
            logger.warning("Confluence page fetch failed page_id=%s err=%r", page_id, error)
            return None

        if not isinstance(data, dict):
            return None
        title = str(data.get("title") or f"Confluence page {page_id}")
        raw_html = ((data.get("body") or {}).get("view") or {}).get("value")
        safe_html = sanitize_jira_html(raw_html or "")
        text = truncate_text(html_to_plain_text(safe_html), int(os.getenv("ANTHROPIC_MAX_CONTEXT_CHARS", "6000")))
        links = data.get("_links") if isinstance(data.get("_links"), dict) else {}
        webui = links.get("webui") if isinstance(links.get("webui"), str) else ""
        page_url = urljoin(f"{self.confluence_base_url}/", webui.lstrip("/")) if webui else f"{self.confluence_base_url}/pages/{page_id}"
        if not safe_html and not text:
            return None
        return {
            "type": "confluence",
            "id": page_id,
            "title": title,
            "url": page_url,
            "description": text,
            "description_html": safe_html,
        }

    async def _augment_context_with_confluence(self, context: Dict[str, Any]) -> Dict[str, Any]:
        """Append linked Confluence page content to Jira issue context."""
        page_ids = extract_confluence_page_ids(
            confluence_base_url=self.confluence_base_url,
            description=context.get("description") or "",
            description_html=context.get("description_html") or "",
            description_adf=context.get("description_adf"),
        )
        if not page_ids:
            context["description_sources"] = [
                {"type": "jira", "url": context.get("url"), "title": context.get("key")}
            ]
            return context

        pages: list[Dict[str, Any]] = []
        for page_id in page_ids[: self._confluence_max_pages]:
            page = await self._fetch_confluence_page_context(page_id)
            if page:
                pages.append(page)
        if not pages:
            context["description_sources"] = [
                {"type": "jira", "url": context.get("url"), "title": context.get("key")}
            ]
            return context

        jira_text = str(context.get("description") or "").strip()
        confluence_text = "\n\n".join(
            f"Confluence: {page['title']}\n{page['description']}"
            for page in pages
            if page.get("description")
        )
        context["description"] = truncate_text(
            "\n\n".join(part for part in [jira_text, confluence_text] if part),
            int(os.getenv("ANTHROPIC_MAX_CONTEXT_CHARS", "6000")),
        )

        jira_html = str(context.get("description_html") or "").strip()
        if not jira_html and jira_text:
            jira_html = "".join(f"<p>{html.escape(line)}</p>" for line in jira_text.splitlines() if line.strip())
        confluence_html = "".join(
            f'<hr /><h3>Confluence: <a href="{html.escape(str(page["url"]))}" target="_blank" rel="noreferrer">{html.escape(str(page["title"]))}</a></h3>{page["description_html"]}'
            for page in pages
            if page.get("description_html")
        )
        context["description_html"] = sanitize_jira_html("".join([jira_html, confluence_html]))
        context["description_sources"] = [
            {"type": "jira", "url": context.get("url"), "title": context.get("key")},
            *[
                {"type": "confluence", "url": page.get("url"), "title": page.get("title")}
                for page in pages
            ],
        ]
        return context

    async def fetch_issue_context(self, issue_key: str) -> Optional[Dict[str, Any]]:
        """Fetch issue fields used for LLM planning hints."""
        fields_list = quote(
            f"summary,description,labels,components,issuetype,{self.story_points_field}",
            safe=",",
        )
        # API v3 only + renderedFields: v2 returns description as a single
        # plain/wiki string (no ADF, no newlines) which is exactly the
        # "wall of text" voters were seeing. renderedFields is what Jira
        # UI uses to paint headings, lists, and tables.
        issue = await self._make_request(
            "GET",
            f"issue/{issue_key}?expand=renderedFields&fields={fields_list}",
            api_versions=["3"],
        )
        if not issue:
            return None
        fields = issue.get("fields") or {}
        rendered = issue.get("renderedFields")
        context = self._issue_context_from_fields(
            issue_key,
            fields,
            rendered if isinstance(rendered, dict) else None,
        )
        return await self._augment_context_with_confluence(context)
