"""Main web app API for facilitated Planning Poker sessions."""

from __future__ import annotations

import json
import os
import secrets
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from app.domain.session import Session
from app.domain.task import Task
from app.usecases.manage_tasks import (
    AddManualTaskUseCase,
    AddManualTasksUseCase,
    DeleteTaskUseCase,
    MoveTaskUseCase,
    ReorderTasksUseCase,
    TaskMutationResult,
    TaskQueueError,
    UpdateTaskUseCase,
)
from services.voting_service.cms_api import (
    CmsPrincipal,
    _audit,
    _existing_jira_keys,
    _jira_preview,
    _jira_preview_payload,
    _mutation_payload,
    _raise_task_error,
    require_permission,
)
from services.voting_service.cms_store import DEFAULT_LIMIT, MAX_LIMIT
from services.voting_service.cms_rbac import PERM_APP_SESSIONS_MANAGE
from services.voting_service.web_api import WEB_TOKEN_TTL, _build_web_session_state, _channel_name

app_router = APIRouter()

DEMO_CHAT_ID = -42_424_242
DEMO_TITLE = "Demo planning session"
DEMO_TASKS = [
    {
        "jira_key": "DEMO-101",
        "summary": "Add manager-led planning room with live participant lobby",
        "story_points": None,
    },
    {
        "jira_key": "DEMO-102",
        "summary": "Import Jira backlog and support manual task editing",
        "story_points": None,
    },
    {
        "jira_key": "DEMO-103",
        "summary": "Polish mobile voting flow for planning poker participants",
        "story_points": None,
    },
    {
        "jira_key": "DEMO-104",
        "summary": "Write final Story Points back to Jira after team discussion",
        "story_points": None,
    },
]


class AppSessionCreateRequest(BaseModel):
    title: str = Field(default="Planning Poker", min_length=1, max_length=120)


class TaskInput(BaseModel):
    summary: str = Field(min_length=1, max_length=500)
    jira_key: Optional[str] = Field(default=None, max_length=64)
    url: Optional[str] = Field(default=None, max_length=1000)
    story_points: Optional[int] = Field(default=None, ge=0, le=1000)


class TaskCreateRequest(TaskInput):
    expected_version: Optional[int] = Field(default=None, ge=0)


class TaskBulkCreateRequest(BaseModel):
    tasks: list[TaskInput] = Field(min_length=1, max_length=500)
    expected_version: Optional[int] = Field(default=None, ge=0)


class TaskUpdateRequest(TaskInput):
    expected_version: Optional[int] = Field(default=None, ge=0)


class TaskMoveRequest(BaseModel):
    target_index: int = Field(ge=0)
    expected_version: Optional[int] = Field(default=None, ge=0)


class TaskReorderRequest(BaseModel):
    ordered_task_ids: list[str] = Field(min_length=1, max_length=5000)
    expected_version: Optional[int] = Field(default=None, ge=0)


class JiraPreviewRequest(BaseModel):
    jql: str = Field(min_length=1, max_length=5000)
    max_results: int = Field(default=500, ge=1, le=1000)


class JiraImportRequest(JiraPreviewRequest):
    selected_keys: list[str] = Field(default_factory=list, max_length=1000)
    expected_version: Optional[int] = Field(default=None, ge=0)


class FinalEstimateRequest(BaseModel):
    value: int = Field(ge=0, le=1000)


def _manager_dep(actor: CmsPrincipal = Depends(require_permission(PERM_APP_SESSIONS_MANAGE))) -> CmsPrincipal:
    return actor


def _public_url(path: str) -> str:
    base = os.getenv("WEB_UI_URL", "").rstrip("/")
    return f"{base}{path}" if base else path


def _new_app_chat_id() -> int:
    return -int(secrets.randbelow(8_000_000_000_000) + 1_000_000_000_000)


def _demo_enabled() -> bool:
    return os.getenv("ENABLE_DEMO_SESSION", "true").lower() in {"1", "true", "yes", "on"}


async def _get_repo_session(repo, chat_id: int, topic_id: Optional[int]) -> Session:
    if hasattr(repo, "get_session_async"):
        return await repo.get_session_async(chat_id, topic_id)
    return await repo.get_session(chat_id, topic_id)


async def _mutate_repo_session(repo, chat_id: int, topic_id: Optional[int], mutator):
    if hasattr(repo, "mutate_session"):
        session, result = await repo.mutate_session(chat_id, topic_id, mutator)
        return session, result
    session = await _get_repo_session(repo, chat_id, topic_id)
    result = mutator(session)
    if hasattr(repo, "save_session_async"):
        await repo.save_session_async(session)
    else:
        await repo.save_session(session)
    return session, result


async def _create_invite_token(
    request: Request,
    chat_id: int,
    topic_id: Optional[int],
    title: str,
) -> tuple[str, str]:
    token = secrets.token_urlsafe(18)
    payload = json.dumps({"chat_id": chat_id, "topic_id": topic_id, "title": title})
    redis_client = request.app.state.web_redis
    await redis_client.setex(f"web:{token}", WEB_TOKEN_TTL, payload)

    cms_store = getattr(request.app.state, "cms_store", None)
    if cms_store:
        await cms_store.record_web_token(token, chat_id, topic_id, WEB_TOKEN_TTL)

    path = f"/s/{token}"
    return token, _public_url(path)


async def _publish_state(request: Request, session: Session) -> None:
    redis_client = request.app.state.web_redis
    await redis_client.publish(
        _channel_name(session.chat_id, session.topic_id),
        json.dumps({"type": "session_state", "state": _build_web_session_state(session)}),
    )


def _manager_session_payload(
    session: Session,
    *,
    title: str = "Planning Poker",
    invite_url: Optional[str] = None,
    token: Optional[str] = None,
) -> dict:
    return {
        "chat_id": session.chat_id,
        "topic_id": session.topic_id,
        "title": title,
        "token": token,
        "invite_url": invite_url,
        "tasks_version": session.tasks_version,
        "tasks_queue_count": len(session.tasks_queue),
        "current_task_id": session.current_task_id,
        "state": _build_web_session_state(session),
    }


def _task_page(session: Session, limit: int, cursor: Optional[str], q: Optional[str]) -> dict:
    offset = 0
    if cursor:
        try:
            offset = max(0, int(cursor))
        except ValueError:
            offset = 0

    query = (q or "").strip().lower()
    tasks = session.tasks_queue
    if query:
        tasks = [
            task for task in tasks
            if query in task.summary.lower() or (task.jira_key and query in task.jira_key.lower())
        ]
    slice_ = tasks[offset: offset + limit]
    next_offset = offset + len(slice_)
    return {
        "items": [
            {
                "id": -1,
                "session_id": -1,
                "task_uid": task.task_id,
                "bucket": "tasks_queue",
                "bucket_index": session.tasks_queue.index(task),
                "jira_key": task.jira_key,
                "summary": task.summary,
                "url": task.url,
                "story_points": task.story_points,
                "source": task.source,
                "votes_count": len(task.votes or {}),
                "numeric_avg": None,
                "numeric_max": None,
                "completed_at": task.completed_at,
                "jql": task.jql,
                "created_at_text": task.created_at,
                "domain_updated_at": task.updated_at,
                "updated_at": task.updated_at,
            }
            for task in slice_
        ],
        "next_cursor": str(next_offset) if next_offset < len(tasks) else None,
        "limit": limit,
    }


@app_router.post("/app/sessions")
async def create_app_session(
    body: AppSessionCreateRequest,
    request: Request,
    actor: CmsPrincipal = Depends(_manager_dep),
) -> dict:
    repo = request.app.state.repository
    chat_id = _new_app_chat_id()
    topic_id = None
    session = await _get_repo_session(repo, chat_id, topic_id)
    token, invite_url = await _create_invite_token(request, chat_id, topic_id, body.title)
    await _audit(request, "app.session.create", actor.username, "ok", {"chat_id": chat_id, "title": body.title})
    return _manager_session_payload(session, title=body.title, invite_url=invite_url, token=token)


@app_router.post("/app/demo-session")
async def create_demo_session(request: Request, reset: bool = Query(default=False)) -> dict:
    """Create or reuse a real demo session for local/product testing."""
    if not _demo_enabled():
        raise HTTPException(status_code=404, detail="Demo session is disabled")

    chat_id = DEMO_CHAT_ID
    topic_id = None
    repo = request.app.state.repository

    def mutate(session: Session) -> None:
        if reset:
            session.participants.clear()
            session.tasks_queue.clear()
            session.history.clear()
            session.last_batch.clear()

        existing = _existing_jira_keys(session)
        if not session.tasks_queue:
            for item in DEMO_TASKS:
                key = item["jira_key"]
                if key in existing:
                    continue
                session.tasks_queue.append(
                    Task(
                        jira_key=key,
                        summary=item["summary"],
                        story_points=item["story_points"],
                        source="jira",
                        jql="project = DEMO ORDER BY priority DESC",
                    )
                )
                existing.add(key)

        if session.tasks_queue and (reset or session.batch_completed or not session.current_batch_started_at or not session.current_task):
            session.current_task_index = 0
            session.batch_completed = False
            session.current_batch_started_at = datetime.utcnow().isoformat()
            session.revealed_task_id = None
            if session.current_task:
                session.current_task.votes.clear()

        session.bump_tasks_version()

    session, _ = await _mutate_repo_session(repo, chat_id, topic_id, mutate)
    token, invite_url = await _create_invite_token(request, chat_id, topic_id, DEMO_TITLE)
    await _publish_state(request, session)
    await _audit(request, "app.demo_session", None, "ok", {"chat_id": chat_id, "reset": reset})
    return _manager_session_payload(session, title=DEMO_TITLE, invite_url=invite_url, token=token)


@app_router.get("/app/sessions/{chat_id}/state")
async def app_session_state(
    chat_id: int,
    request: Request,
    topic_id: Optional[int] = None,
    title: str = "Planning Poker",
    _: CmsPrincipal = Depends(_manager_dep),
) -> dict:
    session = await _get_repo_session(request.app.state.repository, chat_id, topic_id)
    return _manager_session_payload(session, title=title)


@app_router.get("/app/sessions/{chat_id}/tasks")
async def app_session_tasks(
    chat_id: int,
    request: Request,
    topic_id: Optional[int] = None,
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    cursor: Optional[str] = None,
    q: Optional[str] = None,
    _: CmsPrincipal = Depends(_manager_dep),
) -> dict:
    session = await _get_repo_session(request.app.state.repository, chat_id, topic_id)
    return _task_page(session, limit, cursor, q)


@app_router.post("/app/sessions/{chat_id}/tasks")
async def app_create_task(
    chat_id: int,
    body: TaskCreateRequest,
    request: Request,
    topic_id: Optional[int] = None,
    actor: CmsPrincipal = Depends(_manager_dep),
) -> dict:
    use_case = AddManualTaskUseCase(request.app.state.repository)
    try:
        result = await use_case.execute(
            chat_id=chat_id,
            topic_id=topic_id,
            summary=body.summary,
            jira_key=body.jira_key,
            url=body.url,
            story_points=body.story_points,
            expected_version=body.expected_version,
        )
    except TaskQueueError as exc:
        await _audit(request, "app.task.create", actor.username, "failed", {"error": str(exc), "chat_id": chat_id})
        _raise_task_error(exc)
    await _publish_state(request, result.session)
    await _audit(request, "app.task.create", actor.username, "ok", {"chat_id": chat_id, "task_id": result.task.task_id if result.task else None})
    return _mutation_payload(result, -1)


@app_router.post("/app/sessions/{chat_id}/tasks/bulk")
async def app_create_tasks_bulk(
    chat_id: int,
    body: TaskBulkCreateRequest,
    request: Request,
    topic_id: Optional[int] = None,
    actor: CmsPrincipal = Depends(_manager_dep),
) -> dict:
    use_case = AddManualTasksUseCase(request.app.state.repository)
    try:
        result = await use_case.execute(
            chat_id=chat_id,
            topic_id=topic_id,
            items=[item.model_dump() for item in body.tasks],
            expected_version=body.expected_version,
        )
    except TaskQueueError as exc:
        await _audit(request, "app.task.bulk_create", actor.username, "failed", {"error": str(exc), "chat_id": chat_id})
        _raise_task_error(exc)
    await _publish_state(request, result.session)
    await _audit(request, "app.task.bulk_create", actor.username, "ok", {"chat_id": chat_id, "count": len(result.tasks)})
    return _mutation_payload(result, -1)


@app_router.patch("/app/sessions/{chat_id}/tasks/{task_id}")
async def app_update_task(
    chat_id: int,
    task_id: str,
    body: TaskUpdateRequest,
    request: Request,
    topic_id: Optional[int] = None,
    actor: CmsPrincipal = Depends(_manager_dep),
) -> dict:
    use_case = UpdateTaskUseCase(request.app.state.repository)
    try:
        result = await use_case.execute(
            chat_id=chat_id,
            topic_id=topic_id,
            task_id=task_id,
            summary=body.summary,
            jira_key=body.jira_key,
            url=body.url,
            story_points=body.story_points,
            expected_version=body.expected_version,
        )
    except TaskQueueError as exc:
        await _audit(request, "app.task.update", actor.username, "failed", {"error": str(exc), "chat_id": chat_id, "task_id": task_id})
        _raise_task_error(exc)
    await _publish_state(request, result.session)
    await _audit(request, "app.task.update", actor.username, "ok", {"chat_id": chat_id, "task_id": task_id})
    return _mutation_payload(result, -1)


@app_router.delete("/app/sessions/{chat_id}/tasks/{task_id}")
async def app_delete_task(
    chat_id: int,
    task_id: str,
    request: Request,
    topic_id: Optional[int] = None,
    expected_version: Optional[int] = Query(default=None, ge=0),
    actor: CmsPrincipal = Depends(_manager_dep),
) -> dict:
    use_case = DeleteTaskUseCase(request.app.state.repository)
    try:
        result = await use_case.execute(chat_id=chat_id, topic_id=topic_id, task_id=task_id, expected_version=expected_version)
    except TaskQueueError as exc:
        await _audit(request, "app.task.delete", actor.username, "failed", {"error": str(exc), "chat_id": chat_id, "task_id": task_id})
        _raise_task_error(exc)
    await _publish_state(request, result.session)
    await _audit(request, "app.task.delete", actor.username, "ok", {"chat_id": chat_id, "task_id": task_id})
    return _mutation_payload(result, -1)


@app_router.post("/app/sessions/{chat_id}/tasks/{task_id}/move")
async def app_move_task(
    chat_id: int,
    task_id: str,
    body: TaskMoveRequest,
    request: Request,
    topic_id: Optional[int] = None,
    actor: CmsPrincipal = Depends(_manager_dep),
) -> dict:
    use_case = MoveTaskUseCase(request.app.state.repository)
    try:
        result = await use_case.execute(
            chat_id=chat_id,
            topic_id=topic_id,
            task_id=task_id,
            target_index=body.target_index,
            expected_version=body.expected_version,
        )
    except TaskQueueError as exc:
        await _audit(request, "app.task.move", actor.username, "failed", {"error": str(exc), "chat_id": chat_id, "task_id": task_id})
        _raise_task_error(exc)
    await _publish_state(request, result.session)
    return _mutation_payload(result, -1)


@app_router.post("/app/sessions/{chat_id}/tasks/reorder")
async def app_reorder_tasks(
    chat_id: int,
    body: TaskReorderRequest,
    request: Request,
    topic_id: Optional[int] = None,
    actor: CmsPrincipal = Depends(_manager_dep),
) -> dict:
    use_case = ReorderTasksUseCase(request.app.state.repository)
    try:
        result = await use_case.execute(
            chat_id=chat_id,
            topic_id=topic_id,
            ordered_task_ids=body.ordered_task_ids,
            expected_version=body.expected_version,
        )
    except TaskQueueError as exc:
        await _audit(request, "app.task.reorder", actor.username, "failed", {"error": str(exc), "chat_id": chat_id})
        _raise_task_error(exc)
    await _publish_state(request, result.session)
    return _mutation_payload(result, -1)


@app_router.post("/app/sessions/{chat_id}/tasks/jira-preview")
async def app_preview_jira_tasks(
    chat_id: int,
    body: JiraPreviewRequest,
    request: Request,
    topic_id: Optional[int] = None,
    _: CmsPrincipal = Depends(_manager_dep),
) -> dict:
    session = await _get_repo_session(request.app.state.repository, chat_id, topic_id)
    issues = await _jira_preview(body.jql, body.max_results)
    return _jira_preview_payload(issues, _existing_jira_keys(session))


@app_router.post("/app/sessions/{chat_id}/tasks/jira-import")
async def app_import_jira_tasks(
    chat_id: int,
    body: JiraImportRequest,
    request: Request,
    topic_id: Optional[int] = None,
    actor: CmsPrincipal = Depends(_manager_dep),
) -> dict:
    selected = {key.strip().upper() for key in body.selected_keys if key.strip()}
    issues = await _jira_preview(body.jql, body.max_results)

    def mutate(session: Session) -> TaskMutationResult:
        if body.expected_version is not None and body.expected_version != session.tasks_version:
            raise TaskQueueError("Task queue was changed. Refresh and try again.", status_code=409)
        existing_keys = _existing_jira_keys(session)
        added: list[Task] = []
        seen: set[str] = set()
        for issue in issues:
            key = str(issue.get("key") or "").strip().upper()
            if not key or key in existing_keys or key in seen:
                continue
            if selected and key not in selected:
                continue
            task = Task(
                jira_key=key,
                summary=issue.get("summary") or key,
                url=issue.get("url"),
                story_points=issue.get("story_points"),
                jql=body.jql,
                source="jira",
            )
            session.tasks_queue.append(task)
            added.append(task)
            seen.add(key)
            existing_keys.add(key)
        if not added:
            raise TaskQueueError("No Jira tasks to import")
        session.batch_completed = False
        session.bump_tasks_version()
        return TaskMutationResult(session=session, task=added[-1], tasks=tuple(added))

    try:
        session, result = await _mutate_repo_session(request.app.state.repository, chat_id, topic_id, mutate)
    except TaskQueueError as exc:
        await _audit(request, "app.task.jira_import", actor.username, "failed", {"error": str(exc), "chat_id": chat_id})
        _raise_task_error(exc)
    await _publish_state(request, session)
    await _audit(request, "app.task.jira_import", actor.username, "ok", {"chat_id": chat_id, "count": len(result.tasks)})
    return _mutation_payload(result, -1)


@app_router.post("/app/sessions/{chat_id}/start")
async def app_start_session(
    chat_id: int,
    request: Request,
    topic_id: Optional[int] = None,
    actor: CmsPrincipal = Depends(_manager_dep),
) -> dict:
    def mutate(session: Session) -> Optional[str]:
        if not session.tasks_queue:
            return "Add at least one task before starting."
        session.normalize_current_task_index()
        session.batch_completed = False
        session.current_batch_started_at = datetime.utcnow().isoformat()
        session.revealed_task_id = None
        if session.current_task:
            session.current_task.votes.clear()
        session.bump_tasks_version()
        return None

    session, error = await _mutate_repo_session(request.app.state.repository, chat_id, topic_id, mutate)
    if error:
        raise HTTPException(status_code=400, detail=error)
    await _publish_state(request, session)
    await _audit(request, "app.session.start", actor.username, "ok", {"chat_id": chat_id})
    return _manager_session_payload(session)


@app_router.post("/app/sessions/{chat_id}/reveal")
async def app_reveal_session(
    chat_id: int,
    request: Request,
    topic_id: Optional[int] = None,
    actor: CmsPrincipal = Depends(_manager_dep),
) -> dict:
    def mutate(session: Session) -> Optional[str]:
        if not session.current_task or not session.current_batch_started_at:
            return "No active task to reveal."
        session.revealed_task_id = session.current_task.task_id
        session.bump_tasks_version()
        return None

    session, error = await _mutate_repo_session(request.app.state.repository, chat_id, topic_id, mutate)
    if error:
        raise HTTPException(status_code=400, detail=error)
    await _publish_state(request, session)
    await _audit(request, "app.session.reveal", actor.username, "ok", {"chat_id": chat_id})
    return _manager_session_payload(session)


@app_router.post("/app/sessions/{chat_id}/next")
async def app_next_task(
    chat_id: int,
    request: Request,
    topic_id: Optional[int] = None,
    actor: CmsPrincipal = Depends(_manager_dep),
) -> dict:
    def mutate(session: Session) -> None:
        if session.current_task:
            session.current_task_index += 1
        session.revealed_task_id = None
        if session.current_task:
            session.current_task.votes.clear()
            session.current_batch_started_at = datetime.utcnow().isoformat()
            session.batch_completed = False
        else:
            session.current_batch_started_at = None
            session.batch_completed = True
        session.bump_tasks_version()

    session, _ = await _mutate_repo_session(request.app.state.repository, chat_id, topic_id, mutate)
    await _publish_state(request, session)
    await _audit(request, "app.session.next", actor.username, "ok", {"chat_id": chat_id})
    return _manager_session_payload(session)


@app_router.post("/app/sessions/{chat_id}/skip")
async def app_skip_task(
    chat_id: int,
    request: Request,
    topic_id: Optional[int] = None,
    actor: CmsPrincipal = Depends(_manager_dep),
) -> dict:
    await _audit(request, "app.session.skip", actor.username, "ok", {"chat_id": chat_id})
    return await app_next_task(chat_id, request, topic_id=topic_id, actor=actor)


@app_router.post("/app/sessions/{chat_id}/final-estimate")
async def app_set_final_estimate(
    chat_id: int,
    body: FinalEstimateRequest,
    request: Request,
    topic_id: Optional[int] = None,
    actor: CmsPrincipal = Depends(_manager_dep),
) -> dict:
    def mutate(session: Session) -> Optional[str]:
        if not session.current_task:
            return "No active task."
        session.current_task.story_points = body.value
        session.current_task.touch()
        session.bump_tasks_version()
        return None

    session, error = await _mutate_repo_session(request.app.state.repository, chat_id, topic_id, mutate)
    if error:
        raise HTTPException(status_code=400, detail=error)
    await _publish_state(request, session)
    await _audit(request, "app.session.final_estimate", actor.username, "ok", {"chat_id": chat_id, "value": body.value})
    return _manager_session_payload(session)


@app_router.post("/app/sessions/{chat_id}/finish")
async def app_finish_session(
    chat_id: int,
    request: Request,
    topic_id: Optional[int] = None,
    actor: CmsPrincipal = Depends(_manager_dep),
) -> dict:
    def mutate(session: Session) -> list[Task]:
        if session.batch_completed:
            return []
        finished_at = datetime.utcnow().isoformat()
        completed_tasks: list[Task] = []
        for task in session.tasks_queue:
            task.completed_at = finished_at
            completed_tasks.append(task)
        session.last_batch.clear()
        session.last_batch = completed_tasks.copy()
        session.history.extend(completed_tasks)
        session.tasks_queue.clear()
        session.current_task_index = 0
        session.batch_completed = True
        session.active_vote_message_id = None
        session.current_batch_started_at = None
        session.revealed_task_id = None
        session.bump_tasks_version()
        return completed_tasks

    session, completed = await _mutate_repo_session(request.app.state.repository, chat_id, topic_id, mutate)
    await _publish_state(request, session)
    await _audit(request, "app.session.finish", actor.username, "ok", {"chat_id": chat_id, "count": len(completed)})
    return _manager_session_payload(session)
