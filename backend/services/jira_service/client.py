"""Jira service client - wraps JiraHttpClient with caching."""

import asyncio
import os
from collections import OrderedDict
from typing import Any, Dict, List, Mapping, Optional
from datetime import datetime, timedelta

from app.adapters.jira_http import JiraHttpClient
from config import JIRA_API_TOKEN, JIRA_URL, JIRA_USERNAME, STORY_POINTS_FIELD


class JiraServiceClient:
    """Jira service client with caching."""

    def __init__(self):
        self._client = JiraHttpClient(
            base_url=JIRA_URL,
            username=JIRA_USERNAME,
            api_token=JIRA_API_TOKEN,
            story_points_field=STORY_POINTS_FIELD,
        )
        # Simple in-memory cache (TTL: 5 minutes)
        self._cache: OrderedDict[str, tuple[Any, datetime]] = OrderedDict()
        self._cache_ttl = timedelta(minutes=5)
        self._cache_max_items = max(1, int(os.getenv("JIRA_CACHE_MAX_ITEMS", "1000")))
        self._inflight: dict[str, asyncio.Task[Any]] = {}

    def _get_cache_key(self, operation: str, *args) -> str:
        """Generate cache key."""
        return f"{operation}:{':'.join(str(a) for a in args)}"

    def _is_cache_valid(self, cached_at: datetime) -> bool:
        """Check if cache entry is still valid."""
        return datetime.utcnow() - cached_at < self._cache_ttl

    def _get_cached(self, cache_key: str) -> Optional[Any]:
        cached = self._cache.get(cache_key)
        if not cached:
            return None
        result, cached_at = cached
        if not self._is_cache_valid(cached_at):
            self._cache.pop(cache_key, None)
            return None
        self._cache.move_to_end(cache_key)
        return result

    def _set_cached(self, cache_key: str, result: Any) -> None:
        self._cache[cache_key] = (result, datetime.utcnow())
        self._cache.move_to_end(cache_key)
        while len(self._cache) > self._cache_max_items:
            self._cache.popitem(last=False)

    async def search_issues(self, jql: str, max_results: int = 100) -> Optional[Dict[str, Any]]:
        """Search issues with caching."""
        cache_key = self._get_cache_key("search", jql, max_results)

        cached = self._get_cached(cache_key)
        if cached is not None:
            return cached

        result = await self._client.search_issues(jql, max_results)
        if result:
            self._set_cached(cache_key, result)

        return result

    async def parse_jira_request(self, text: str, max_results: int = 500) -> Optional[List[Dict[str, Any]]]:
        """Parse Jira request with caching."""
        cache_key = self._get_cache_key("parse", text, max_results)

        cached = self._get_cached(cache_key)
        if cached is not None:
            return cached

        result = await self._client.parse_jira_request(text, max_results=max_results)
        if result:
            self._set_cached(cache_key, result)

        return result

    async def parse_jira_scope_issues(
        self,
        text: str,
        max_results: int = 500,
        *,
        force_refresh: bool = False,
        milestone_status_targets: Optional[list[str]] = None,
        enrich_changelog: bool = True,
    ) -> Optional[List[Dict[str, Any]]]:
        """Parse Jira scope-dashboard issues with caching and in-flight deduplication."""
        targets_key = ",".join(milestone_status_targets or [])
        enrich_key = "1" if enrich_changelog else "0"
        cache_key = self._get_cache_key("parse_scope", text, max_results, targets_key, enrich_key)

        if not force_refresh:
            cached = self._get_cached(cache_key)
            if cached is not None:
                return cached

        inflight = self._inflight.get(cache_key)
        if inflight is not None:
            return await inflight

        async def _run() -> Optional[List[Dict[str, Any]]]:
            result = await self._client.parse_jira_scope_issues(
                text,
                max_results=max_results,
                milestone_status_targets=milestone_status_targets,
                enrich_changelog=enrich_changelog,
            )
            if result is not None:
                self._set_cached(cache_key, result)
            return result

        task = asyncio.create_task(_run())
        self._inflight[cache_key] = task
        try:
            return await task
        finally:
            self._inflight.pop(cache_key, None)

    async def update_story_points(self, issue_key: str, story_points: int) -> bool:
        """Update story points (no caching)."""
        # Invalidate cache for this issue
        for key in list(self._cache.keys()):
            if issue_key in key:
                del self._cache[key]

        return await self._client.update_story_points(issue_key, story_points)

    async def update_story_points_fields(self, issue_key: str, fields: Mapping[str, int]) -> Dict[str, bool]:
        """Update multiple story-point fields with partial success."""
        for key in list(self._cache.keys()):
            if issue_key in key:
                del self._cache[key]
        return await self._client.update_story_points_fields(issue_key, fields)

    async def add_issue_comment(self, issue_key: str, text: str) -> Optional[Dict[str, Any]]:
        """Append a Jira comment and clear cached issue/search projections."""
        self._cache.clear()
        return await self._client.add_issue_comment(issue_key, text)

    async def add_issue_comment_adf(self, issue_key: str, body: Mapping[str, Any]) -> Optional[Dict[str, Any]]:
        """Append an ADF Jira comment and clear cached issue/search projections."""
        self._cache.clear()
        return await self._client.add_issue_comment_adf(issue_key, body)

    async def update_issue_comment_adf(
        self,
        issue_key: str,
        comment_id: str,
        body: Mapping[str, Any],
    ) -> Optional[Dict[str, Any]]:
        """Update an existing Jira comment with ADF and clear cache."""
        self._cache.clear()
        return await self._client.update_issue_comment_adf(issue_key, comment_id, body)

    def get_issue_url(self, issue_key: str) -> str:
        """Get issue URL."""
        return self._client.get_issue_url(issue_key)

    async def _fetch_issue_by_key(self, issue_key: str) -> Optional[Dict[str, Any]]:
        """Fetch issue by key with caching."""
        cache_key = self._get_cache_key("issue", issue_key)

        cached = self._get_cached(cache_key)
        if cached is not None:
            return cached

        result = await self._client._fetch_issue_by_key(issue_key)
        if result:
            self._set_cached(cache_key, result)

        return result

    async def fetch_issue_context(self, issue_key: str) -> Optional[Dict[str, Any]]:
        """Fetch rich issue context for LLM summaries."""
        cache_key = self._get_cache_key("context", issue_key)

        cached = self._get_cached(cache_key)
        if cached is not None:
            return cached

        result = await self._client.fetch_issue_context(issue_key)
        if result:
            self._set_cached(cache_key, result)

        return result

    async def close(self) -> None:
        """Close client connections."""
        await self._client.close()
