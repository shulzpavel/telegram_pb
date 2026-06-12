"""Jira API endpoints.

The ``JiraServiceClient`` is created once at application startup and held on
``app.state.jira_client`` for the lifetime of the process — see
``services/jira_service/main.py``. Endpoints receive it via the
``get_jira_client`` FastAPI dependency so the in-memory issue cache and the
underlying ``aiohttp.ClientSession`` connection pool actually persist between
requests, which they did not when the client was instantiated per-request.
"""

import os
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from services.jira_service.client import JiraServiceClient

router = APIRouter()


def get_jira_client(request: Request) -> JiraServiceClient:
    """Yield the singleton Jira client owned by the application lifespan."""
    return request.app.state.jira_client


class SearchRequest(BaseModel):
    """Request model for Jira search."""

    jql: str
    max_results: int = 100


class IssueResponse(BaseModel):
    """Response model for Jira issue."""

    key: str
    summary: str
    url: str
    story_points: int


class IssueContextResponse(BaseModel):
    """Rich issue context for LLM planning hints."""

    key: str
    summary: str
    url: str
    description: str = ""
    # Raw Atlassian Document Format payload (a JSON object whose
    # ``type`` is usually ``"doc"``). Optional — only present when
    # Jira returned ADF for the description field. The voter UI
    # renders this for original formatting; AI prompts stick to the
    # plain ``description`` string above.
    description_adf: Optional[dict] = None
    # Server-rendered HTML (``expand=renderedFields``). Best match for
    # how the issue looks inside Jira when ADF is missing or v2 leaked
    # a flat string.
    description_html: Optional[str] = None
    description_sources: list[dict] = Field(default_factory=list)
    issue_type: Optional[str] = None
    labels: list[str] = []
    components: list[str] = []
    story_points: Optional[float] = None


class SearchResponse(BaseModel):
    """Response model for Jira search."""

    issues: List[IssueResponse]


class UpdateSPRequest(BaseModel):
    """Request model for updating story points."""

    issue_key: str
    story_points: int


class UpdateSPResponse(BaseModel):
    """Response model for updating story points."""

    success: bool
    issue_key: str
    story_points: int


class UpdateSPFieldsRequest(BaseModel):
    """Request model for updating multiple SP fields."""

    issue_key: str
    fields: Dict[str, int] = Field(default_factory=dict)


class UpdateSPFieldsResponse(BaseModel):
    """Response model for updating multiple SP fields."""

    success: bool
    issue_key: str
    results: Dict[str, bool]


DEMO_ISSUES: list[dict] = [
    {
        "key": "DEMO-101",
        "summary": "Add manager-led planning room with live participant lobby",
        "url": "/demo/issues/DEMO-101",
        "story_points": 0,
    },
    {
        "key": "DEMO-102",
        "summary": "Import Jira backlog and support manual task editing",
        "url": "/demo/issues/DEMO-102",
        "story_points": 0,
    },
    {
        "key": "DEMO-103",
        "summary": "Polish mobile voting flow for planning poker participants",
        "url": "/demo/issues/DEMO-103",
        "story_points": 0,
    },
    {
        "key": "DEMO-104",
        "summary": "Write final Story Points back to Jira after team discussion",
        "url": "/demo/issues/DEMO-104",
        "story_points": 0,
    },
]


def _jira_configured() -> bool:
    return bool(
        os.getenv("JIRA_URL", "").strip()
        and os.getenv("JIRA_USERNAME", "").strip()
        and os.getenv("JIRA_API_TOKEN", "").strip()
    )


def _demo_fallback_enabled() -> bool:
    return os.getenv("JIRA_DEMO_FALLBACK", "true").strip().lower() in {"1", "true", "yes", "on"}


def _demo_issues_for(jql: str, max_results: int) -> list[dict]:
    """Local fallback so Jira import is testable even without Jira data.

    If a real Jira is configured and returns issues, callers never reach this
    helper. If Jira returns an empty page for the built-in DEMO JQL, the local
    product demo still works and the import flow remains testable.
    """
    text = (jql or "").upper()
    if not _demo_fallback_enabled() or "DEMO" not in text:
        return []
    return DEMO_ISSUES[: max(1, min(max_results, len(DEMO_ISSUES)))]


def _issue_responses(issues: list[dict]) -> list[IssueResponse]:
    return [
        IssueResponse(
            key=issue["key"],
            summary=issue.get("summary", issue["key"]),
            url=issue.get("url", ""),
            story_points=issue.get("story_points", 0) or 0,
        )
        for issue in issues
    ]


@router.post("/search", response_model=SearchResponse)
async def search_issues(
    body: SearchRequest,
    client: JiraServiceClient = Depends(get_jira_client),
) -> SearchResponse:
    """Search issues by JQL."""
    try:
        issues = await client.parse_jira_request(body.jql, max_results=body.max_results)
        if not issues:
            issues = _demo_issues_for(body.jql, body.max_results)
        if not issues:
            return SearchResponse(issues=[])

        return SearchResponse(issues=_issue_responses(issues))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Jira search failed: {str(e)}")


@router.get("/issue/{issue_key}/context", response_model=IssueContextResponse)
async def get_issue_context(
    issue_key: str,
    client: JiraServiceClient = Depends(get_jira_client),
) -> IssueContextResponse:
    """Return Jira issue fields used for AI summary generation."""
    try:
        context = await client.fetch_issue_context(issue_key)
        if not context and _demo_fallback_enabled() and not _jira_configured():
            demo = next((item for item in DEMO_ISSUES if item["key"] == issue_key.upper()), None)
            if demo:
                context = {
                    "key": demo["key"],
                    "summary": demo["summary"],
                    "url": demo["url"],
                    "description": demo["summary"],
                    "issue_type": "Story",
                    "labels": ["demo"],
                    "components": [],
                    "story_points": demo.get("story_points"),
                }
        if not context:
            raise HTTPException(status_code=404, detail=f"Issue {issue_key} not found")

        return IssueContextResponse(
            key=context["key"],
            summary=context.get("summary", issue_key),
            url=context.get("url", ""),
            description=context.get("description") or "",
            description_adf=context.get("description_adf"),
            description_html=context.get("description_html"),
            description_sources=context.get("description_sources") or [],
            issue_type=context.get("issue_type"),
            labels=context.get("labels") or [],
            components=context.get("components") or [],
            story_points=context.get("story_points"),
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch issue context: {str(e)}")


@router.get("/issue/{issue_key}", response_model=IssueResponse)
async def get_issue(
    issue_key: str,
    client: JiraServiceClient = Depends(get_jira_client),
) -> IssueResponse:
    """Get issue by key."""
    try:
        issue = await client._fetch_issue_by_key(issue_key)
        if not issue and _demo_fallback_enabled() and not _jira_configured():
            issue = next((item for item in DEMO_ISSUES if item["key"] == issue_key.upper()), None)
        if not issue:
            raise HTTPException(status_code=404, detail=f"Issue {issue_key} not found")

        return IssueResponse(
            key=issue["key"],
            summary=issue.get("summary", issue_key),
            url=issue.get("url", ""),
            story_points=issue.get("story_points", 0),
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch issue: {str(e)}")


@router.put("/issue/{issue_key}/story-points", response_model=UpdateSPResponse)
async def update_story_points(
    issue_key: str,
    body: UpdateSPRequest,
    client: JiraServiceClient = Depends(get_jira_client),
) -> UpdateSPResponse:
    """Update story points for issue."""
    try:
        success = await client.update_story_points(issue_key, body.story_points)
        if not success:
            raise HTTPException(status_code=400, detail=f"Failed to update story points for {issue_key}")

        return UpdateSPResponse(
            success=True,
            issue_key=issue_key,
            story_points=body.story_points,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update story points: {str(e)}")


@router.put("/issue/{issue_key}/story-points/fields", response_model=UpdateSPFieldsResponse)
async def update_story_points_fields(
    issue_key: str,
    body: UpdateSPFieldsRequest,
    client: JiraServiceClient = Depends(get_jira_client),
) -> UpdateSPFieldsResponse:
    """Update concrete Jira SP custom fields with partial success."""
    try:
        results = await client.update_story_points_fields(issue_key, body.fields)
        return UpdateSPFieldsResponse(
            success=bool(results) and all(results.values()),
            issue_key=issue_key,
            results=results,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update story point fields: {str(e)}")


@router.post("/parse", response_model=SearchResponse)
async def parse_jira_request(
    body: SearchRequest,
    client: JiraServiceClient = Depends(get_jira_client),
) -> SearchResponse:
    """Parse JQL or issue keys and return issues."""
    try:
        issues = await client.parse_jira_request(body.jql, max_results=body.max_results)
        if not issues:
            issues = _demo_issues_for(body.jql, body.max_results)
        if not issues:
            return SearchResponse(issues=[])

        return SearchResponse(issues=_issue_responses(issues))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Jira parse failed: {str(e)}")
