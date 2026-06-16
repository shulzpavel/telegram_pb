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
    force_refresh: bool = False
    milestone_status_targets: list[str] = Field(default_factory=list)
    enrich_changelog: bool = True


class IssueResponse(BaseModel):
    """Response model for Jira issue."""

    key: str
    summary: str
    url: str
    story_points: int


class ScopeIssueStatus(BaseModel):
    name: str = ""
    category: str = ""


class ScopeRoleContributor(BaseModel):
    name: str = ""
    source: str = ""


class ScopeIssueResponse(BaseModel):
    """Scope-dashboard issue with planning metadata."""

    key: str
    summary: str
    url: str
    story_points: Optional[float] = None
    story_points_source: Optional[str] = None
    story_points_plan: Optional[float] = None
    story_points_fact: Optional[float] = None
    story_points_dev: Optional[float] = None
    story_points_test: Optional[float] = None
    story_points_front: Optional[float] = None
    story_points_back: Optional[float] = None
    story_points_qa: Optional[float] = None
    story_point_estimate: Optional[float] = None
    status: ScopeIssueStatus = Field(default_factory=ScopeIssueStatus)
    issue_type: str = ""
    labels: list[str] = Field(default_factory=list)
    epic_labels: list[str] = Field(default_factory=list)
    created: Optional[str] = None
    updated: Optional[str] = None
    status_changed_at: Optional[str] = None
    status_entered_at: Optional[str] = None
    epic_linked_at: Optional[str] = None
    due_date: Optional[str] = None
    resolution: str = ""
    resolution_date: Optional[str] = None
    parent_key: Optional[str] = None
    epic_key: Optional[str] = None
    linked_epic_key: Optional[str] = None
    priority: str = ""
    assignee: str = ""
    developer: str = ""
    developer_source: str = ""
    role_contributors: dict[str, ScopeRoleContributor] = Field(default_factory=dict)
    role_contributors_list: list[dict[str, str]] = Field(default_factory=list)
    role_workload_items: list[dict[str, str]] = Field(default_factory=list)
    role_evidence: list[dict[str, str]] = Field(default_factory=list)
    reporter: str = ""
    components: list[str] = Field(default_factory=list)
    fix_versions: list[str] = Field(default_factory=list)
    versions: list[str] = Field(default_factory=list)
    sprints: list[str] = Field(default_factory=list)
    sprint: str = ""
    team: str = ""
    team_labels: list[str] = Field(default_factory=list)
    plan_status: str = ""
    plan_change_reason: str = ""
    plan_change_reasons: list[str] = Field(default_factory=list)
    final_priority: str = ""
    severity: str = ""
    domain: str = ""
    request_type: str = ""
    checklist_progress: Optional[float] = None
    last_comment: str = ""
    last_comment_author: str = ""
    last_comment_at: Optional[str] = None


class ScopeSearchResponse(BaseModel):
    issues: List[ScopeIssueResponse]


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


class UpdateDueDateRequest(BaseModel):
    """Request model for updating Jira due date."""

    issue_key: str
    due_date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")


class UpdateDueDateResponse(BaseModel):
    success: bool
    issue_key: str
    due_date: str


class AddCommentRequest(BaseModel):
    """Request model for adding a Jira comment."""

    text: str = Field(min_length=1, max_length=4000)


class AddCommentResponse(BaseModel):
    success: bool
    issue_key: str
    comment_id: Optional[str] = None


class AddAdfCommentRequest(BaseModel):
    """Request model for adding a Jira comment with ADF body."""

    body: Dict[str, Any]


class UpdateAdfCommentResponse(BaseModel):
    success: bool
    issue_key: str
    comment_id: Optional[str] = None


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
    return os.getenv("JIRA_DEMO_FALLBACK", "false").strip().lower() in {"1", "true", "yes", "on"}


def _demo_scope_issues_for(jql: str, max_results: int) -> list[dict]:
    """Rich local fixtures for scope dashboard preview when Jira returns no rows."""
    text = (jql or "").upper()
    if not _demo_fallback_enabled() or "DEMO" not in text:
        return []

    is_unplan = "UNPLAN" in text or "LABEL" in text
    if is_unplan:
        rows = [
            {
                "key": "DEMO-U1",
                "summary": "Hotfix: payment callback timeout",
                "url": "/demo/issues/DEMO-U1",
                "story_points": 15,
                "status": {"name": "In Progress", "category": "indeterminate"},
                "issue_type": {"name": "Bug"},
                "labels": ["unplan", "demo"],
                "created": "2026-06-02T10:00:00.000+0000",
                "updated": "2026-06-10T10:00:00.000+0000",
            },
            {
                "key": "DEMO-U2",
                "summary": "Support escalation: broken odds feed",
                "url": "/demo/issues/DEMO-U2",
                "story_points": 3,
                "status": {"name": "To Do", "category": "new"},
                "issue_type": {"name": "Bug"},
                "labels": ["unplan", "demo"],
                "created": "2026-06-04T10:00:00.000+0000",
                "updated": "2026-06-04T10:00:00.000+0000",
            },
        ]
    else:
        rows = [
            {
                "key": "DEMO-P1",
                "summary": "Monthly roadmap: live casino lobby",
                "url": "/demo/issues/DEMO-P1",
                "story_points": 20,
                "status": {"name": "To Do", "category": "new"},
                "issue_type": {"name": "Story"},
                "labels": ["demo", "plan"],
                "created": "2026-05-28T10:00:00.000+0000",
                "updated": "2026-06-01T10:00:00.000+0000",
            },
            {
                "key": "DEMO-P2",
                "summary": "KYC flow polish for iGaming RIP",
                "url": "/demo/issues/DEMO-P2",
                "story_points": 10,
                "status": {"name": "In Progress", "category": "indeterminate"},
                "issue_type": {"name": "Story"},
                "labels": ["demo", "plan"],
                "created": "2026-05-20T10:00:00.000+0000",
                "updated": "2026-06-08T10:00:00.000+0000",
            },
            {
                "key": "DEMO-P3",
                "summary": "Spike: provider integration (no estimate yet)",
                "url": "/demo/issues/DEMO-P3",
                "story_points": None,
                "status": {"name": "To Do", "category": "new"},
                "issue_type": {"name": "Spike"},
                "labels": ["demo", "plan"],
                "created": "2026-06-03T10:00:00.000+0000",
                "updated": "2026-06-03T10:00:00.000+0000",
            },
            {
                "key": "DEMO-P4",
                "summary": "Done carry-over from last month",
                "url": "/demo/issues/DEMO-P4",
                "story_points": 5,
                "status": {"name": "Done", "category": "done"},
                "issue_type": {"name": "Story"},
                "labels": ["demo", "plan"],
                "created": "2026-05-10T10:00:00.000+0000",
                "updated": "2026-06-05T10:00:00.000+0000",
            },
            {
                "key": "DEMO-P5",
                "summary": "Scope creep item added mid-month",
                "url": "/demo/issues/DEMO-P5",
                "story_points": 8,
                "status": {"name": "To Do", "category": "new"},
                "issue_type": {"name": "Story"},
                "labels": ["demo", "plan"],
                "created": "2026-06-12T10:00:00.000+0000",
                "updated": "2026-06-12T10:00:00.000+0000",
            },
        ]
    return rows[: max(1, min(max_results, len(rows)))]


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


def _scope_issue_responses(issues: list[dict]) -> list[ScopeIssueResponse]:
    rows: list[ScopeIssueResponse] = []
    for issue in issues:
        status = issue.get("status") if isinstance(issue.get("status"), dict) else {}
        rows.append(
            ScopeIssueResponse(
                key=issue["key"],
                summary=issue.get("summary", issue["key"]),
                url=issue.get("url", ""),
                story_points=issue.get("story_points"),
                story_points_source=issue.get("story_points_source"),
                story_points_plan=issue.get("story_points_plan"),
                story_points_fact=issue.get("story_points_fact"),
                story_points_dev=issue.get("story_points_dev"),
                story_points_test=issue.get("story_points_test"),
                story_points_front=issue.get("story_points_front"),
                story_points_back=issue.get("story_points_back"),
                story_points_qa=issue.get("story_points_qa"),
                story_point_estimate=issue.get("story_point_estimate"),
                status=ScopeIssueStatus(
                    name=str(status.get("name") or ""),
                    category=str(status.get("category") or ""),
                ),
                issue_type=str((issue.get("issue_type") or {}).get("name") or issue.get("issue_type") or ""),
                labels=[str(label) for label in (issue.get("labels") or []) if label],
                epic_labels=[str(label) for label in (issue.get("epic_labels") or []) if label],
                created=issue.get("created"),
                updated=issue.get("updated"),
                status_changed_at=issue.get("status_changed_at"),
                status_entered_at=issue.get("status_entered_at"),
                epic_linked_at=issue.get("epic_linked_at"),
                due_date=issue.get("due_date"),
                resolution=str(issue.get("resolution") or ""),
                resolution_date=issue.get("resolution_date"),
                parent_key=issue.get("parent_key"),
                epic_key=issue.get("epic_key"),
                linked_epic_key=issue.get("linked_epic_key"),
                priority=str(issue.get("priority") or ""),
                assignee=str(issue.get("assignee") or ""),
                developer=str(issue.get("developer") or ""),
                developer_source=str(issue.get("developer_source") or ""),
                role_contributors={
                    role: ScopeRoleContributor(
                        name=str((payload or {}).get("name") or ""),
                        source=str((payload or {}).get("source") or ""),
                    )
                    for role, payload in (issue.get("role_contributors") or {}).items()
                    if isinstance(payload, dict)
                },
                role_contributors_list=[
                    {
                        "role": str(item.get("role") or ""),
                        "name": str(item.get("name") or ""),
                        "source": str(item.get("source") or ""),
                    }
                    for item in (issue.get("role_contributors_list") or [])
                    if isinstance(item, dict)
                ],
                role_workload_items=[
                    {
                        "role": str(item.get("role") or ""),
                        "name": str(item.get("name") or ""),
                        "source": str(item.get("source") or ""),
                        "subtask_key": str(item.get("subtask_key") or ""),
                        "subtask_summary": str(item.get("subtask_summary") or ""),
                        "source_url": str(item.get("source_url") or ""),
                        "project_path": str(item.get("project_path") or ""),
                        "confidence": str(item.get("confidence") or ""),
                        "kind": str(item.get("kind") or ""),
                    }
                    for item in (issue.get("role_workload_items") or [])
                    if isinstance(item, dict)
                ],
                role_evidence=[
                    {
                        "role": str(item.get("role") or ""),
                        "name": str(item.get("name") or ""),
                        "source": str(item.get("source") or ""),
                        "jira_key": str(item.get("jira_key") or ""),
                        "source_url": str(item.get("source_url") or ""),
                        "project_path": str(item.get("project_path") or ""),
                        "confidence": str(item.get("confidence") or ""),
                        "unresolved_reason": str(item.get("unresolved_reason") or ""),
                        "subtask_key": str(item.get("subtask_key") or ""),
                    }
                    for item in (issue.get("role_evidence") or [])
                    if isinstance(item, dict)
                ],
                reporter=str(issue.get("reporter") or ""),
                components=[str(item) for item in (issue.get("components") or []) if item],
                fix_versions=[str(item) for item in (issue.get("fix_versions") or []) if item],
                versions=[str(item) for item in (issue.get("versions") or []) if item],
                sprints=[str(item) for item in (issue.get("sprints") or []) if item],
                sprint=str(issue.get("sprint") or ""),
                team=str(issue.get("team") or ""),
                team_labels=[str(item) for item in (issue.get("team_labels") or []) if item],
                plan_status=str(issue.get("plan_status") or ""),
                plan_change_reason=str(issue.get("plan_change_reason") or ""),
                plan_change_reasons=[str(item) for item in (issue.get("plan_change_reasons") or []) if item],
                final_priority=str(issue.get("final_priority") or ""),
                severity=str(issue.get("severity") or ""),
                domain=str(issue.get("domain") or ""),
                request_type=str(issue.get("request_type") or ""),
                checklist_progress=issue.get("checklist_progress"),
                last_comment=str(issue.get("last_comment") or ""),
                last_comment_author=str(issue.get("last_comment_author") or ""),
                last_comment_at=issue.get("last_comment_at"),
            )
        )
    return rows


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


@router.post("/search/scope", response_model=ScopeSearchResponse)
async def search_scope_issues(
    body: SearchRequest,
    client: JiraServiceClient = Depends(get_jira_client),
) -> ScopeSearchResponse:
    """Search issues with status/type/created fields for scope dashboards."""
    try:
        issues = await client.parse_jira_scope_issues(
            body.jql,
            max_results=body.max_results,
            force_refresh=body.force_refresh,
            milestone_status_targets=body.milestone_status_targets,
            enrich_changelog=body.enrich_changelog,
        )
        if not issues:
            issues = _demo_scope_issues_for(body.jql, body.max_results)
            if not issues:
                issues = _demo_issues_for(body.jql, body.max_results)
                if issues:
                    demo_rows = []
                    for issue in issues:
                        demo_rows.append(
                            {
                                **issue,
                                "status": {"name": "To Do", "category": "new"},
                                "issue_type": {"name": "Story"},
                                "labels": ["demo"],
                                "created": "2026-06-01T10:00:00.000+0000",
                                "updated": "2026-06-01T10:00:00.000+0000",
                            }
                        )
                    issues = demo_rows
        if not issues:
            return ScopeSearchResponse(issues=[])
        return ScopeSearchResponse(issues=_scope_issue_responses(issues))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Jira scope search failed: {str(e)}")


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


@router.put("/issue/{issue_key}/due-date", response_model=UpdateDueDateResponse)
async def update_due_date(
    issue_key: str,
    body: UpdateDueDateRequest,
    client: JiraServiceClient = Depends(get_jira_client),
) -> UpdateDueDateResponse:
    """Update Jira due date for an issue."""
    try:
        success = await client.update_due_date(issue_key, body.due_date)
        return UpdateDueDateResponse(success=success, issue_key=issue_key, due_date=body.due_date)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update due date: {str(e)}")


@router.post("/issue/{issue_key}/comment", response_model=AddCommentResponse)
async def add_issue_comment(
    issue_key: str,
    body: AddCommentRequest,
    client: JiraServiceClient = Depends(get_jira_client),
) -> AddCommentResponse:
    """Append a comment to a Jira issue."""
    try:
        comment = await client.add_issue_comment(issue_key, body.text)
        if not comment:
            raise HTTPException(status_code=400, detail=f"Failed to add comment for {issue_key}")
        return AddCommentResponse(
            success=True,
            issue_key=issue_key,
            comment_id=str(comment.get("id") or "") or None,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to add Jira comment: {str(e)}")


@router.post("/issue/{issue_key}/comment/adf", response_model=AddCommentResponse)
async def add_issue_comment_adf(
    issue_key: str,
    body: AddAdfCommentRequest,
    client: JiraServiceClient = Depends(get_jira_client),
) -> AddCommentResponse:
    """Append an ADF comment to a Jira issue."""
    if not isinstance(body.body, dict) or body.body.get("type") != "doc":
        raise HTTPException(status_code=400, detail="Comment body must be an ADF doc")
    try:
        comment = await client.add_issue_comment_adf(issue_key, body.body)
        if not comment:
            raise HTTPException(status_code=400, detail=f"Failed to add ADF comment for {issue_key}")
        return AddCommentResponse(
            success=True,
            issue_key=issue_key,
            comment_id=str(comment.get("id") or "") or None,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to add Jira ADF comment: {str(e)}")


@router.put("/issue/{issue_key}/comment/{comment_id}/adf", response_model=UpdateAdfCommentResponse)
async def update_issue_comment_adf(
    issue_key: str,
    comment_id: str,
    body: AddAdfCommentRequest,
    client: JiraServiceClient = Depends(get_jira_client),
) -> UpdateAdfCommentResponse:
    """Replace an existing Jira comment with ADF."""
    if not isinstance(body.body, dict) or body.body.get("type") != "doc":
        raise HTTPException(status_code=400, detail="Comment body must be an ADF doc")
    try:
        comment = await client.update_issue_comment_adf(issue_key, comment_id, body.body)
        if not comment:
            raise HTTPException(status_code=400, detail=f"Failed to update ADF comment for {issue_key}")
        return UpdateAdfCommentResponse(
            success=True,
            issue_key=issue_key,
            comment_id=str(comment.get("id") or comment_id) or None,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update Jira ADF comment: {str(e)}")


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
