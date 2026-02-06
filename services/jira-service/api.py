"""Jira API endpoints."""

import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.jira_service.client import JiraServiceClient

router = APIRouter()


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


@router.post("/search", response_model=SearchResponse)
async def search_issues(request: SearchRequest) -> SearchResponse:
    """Search issues by JQL."""
    client = JiraServiceClient()
    try:
        issues = await client.parse_jira_request(request.jql)
        if not issues:
            return SearchResponse(issues=[])

        issue_responses = [
            IssueResponse(
                key=issue["key"],
                summary=issue.get("summary", issue["key"]),
                url=issue.get("url", ""),
                story_points=issue.get("story_points", 0),
            )
            for issue in issues
        ]
        return SearchResponse(issues=issue_responses)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Jira search failed: {str(e)}")


@router.get("/issue/{issue_key}", response_model=IssueResponse)
async def get_issue(issue_key: str) -> IssueResponse:
    """Get issue by key."""
    client = JiraServiceClient()
    try:
        issue = await client._fetch_issue_by_key(issue_key)
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
async def update_story_points(issue_key: str, request: UpdateSPRequest) -> UpdateSPResponse:
    """Update story points for issue."""
    client = JiraServiceClient()
    try:
        success = await client.update_story_points(issue_key, request.story_points)
        if not success:
            raise HTTPException(status_code=400, detail=f"Failed to update story points for {issue_key}")

        return UpdateSPResponse(
            success=True,
            issue_key=issue_key,
            story_points=request.story_points,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update story points: {str(e)}")


@router.post("/parse", response_model=SearchResponse)
async def parse_jira_request(request: SearchRequest) -> SearchResponse:
    """Parse JQL or issue keys and return issues."""
    client = JiraServiceClient()
    try:
        issues = await client.parse_jira_request(request.jql)
        if not issues:
            return SearchResponse(issues=[])

        issue_responses = [
            IssueResponse(
                key=issue["key"],
                summary=issue.get("summary", issue["key"]),
                url=issue.get("url", ""),
                story_points=issue.get("story_points", 0),
            )
            for issue in issues
        ]
        return SearchResponse(issues=issue_responses)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Jira parse failed: {str(e)}")
