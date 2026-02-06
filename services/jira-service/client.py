"""Jira service client - wraps JiraHttpClient with caching."""

import asyncio
from typing import Any, Dict, List, Optional
from datetime import datetime, timedelta

import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

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
        self._cache: Dict[str, tuple[Any, datetime]] = {}
        self._cache_ttl = timedelta(minutes=5)

    def _get_cache_key(self, operation: str, *args) -> str:
        """Generate cache key."""
        return f"{operation}:{':'.join(str(a) for a in args)}"

    def _is_cache_valid(self, cached_at: datetime) -> bool:
        """Check if cache entry is still valid."""
        return datetime.utcnow() - cached_at < self._cache_ttl

    async def search_issues(self, jql: str, max_results: int = 100) -> Optional[Dict[str, Any]]:
        """Search issues with caching."""
        cache_key = self._get_cache_key("search", jql, max_results)
        
        if cache_key in self._cache:
            result, cached_at = self._cache[cache_key]
            if self._is_cache_valid(cached_at):
                return result
        
        result = await self._client.search_issues(jql, max_results)
        if result:
            self._cache[cache_key] = (result, datetime.utcnow())
        
        return result

    async def parse_jira_request(self, text: str) -> Optional[List[Dict[str, Any]]]:
        """Parse Jira request with caching."""
        cache_key = self._get_cache_key("parse", text)
        
        if cache_key in self._cache:
            result, cached_at = self._cache[cache_key]
            if self._is_cache_valid(cached_at):
                return result
        
        result = await self._client.parse_jira_request(text)
        if result:
            self._cache[cache_key] = (result, datetime.utcnow())
        
        return result

    async def update_story_points(self, issue_key: str, story_points: int) -> bool:
        """Update story points (no caching)."""
        # Invalidate cache for this issue
        for key in list(self._cache.keys()):
            if issue_key in key:
                del self._cache[key]
        
        return await self._client.update_story_points(issue_key, story_points)

    def get_issue_url(self, issue_key: str) -> str:
        """Get issue URL."""
        return self._client.get_issue_url(issue_key)

    async def _fetch_issue_by_key(self, issue_key: str) -> Optional[Dict[str, Any]]:
        """Fetch issue by key with caching."""
        cache_key = self._get_cache_key("issue", issue_key)
        
        if cache_key in self._cache:
            result, cached_at = self._cache[cache_key]
            if self._is_cache_valid(cached_at):
                return result
        
        result = await self._client._fetch_issue_by_key(issue_key)
        if result:
            self._cache[cache_key] = (result, datetime.utcnow())
        
        return result

    async def close(self) -> None:
        """Close client connections."""
        await self._client.close()
