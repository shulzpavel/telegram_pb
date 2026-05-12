"""CMS admin API for superuser dashboards."""

from __future__ import annotations

import json
import os
import secrets
from dataclasses import dataclass
from typing import Optional

import aiohttp
import redis.asyncio as aioredis
from fastapi import APIRouter, Cookie, Depends, Header, HTTPException, Query, Request, Response
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
from services.voting_service.schemas import (
    JiraImportRequest,
    JiraPreviewRequest,
    TaskBulkCreateRequest,
    TaskCreateRequest,
    TaskInput,
    TaskMoveRequest,
    TaskReorderRequest,
    TaskUpdateRequest,
)
from services.voting_service.session_helpers import get_repo_session, mutate_repo_session
from services.voting_service.cms_store import DEFAULT_LIMIT, MAX_LIMIT
from services.voting_service.cms_rbac import (
    PERM_ACCESS_MANAGE,
    PERM_ACCESS_VIEW,
    PERM_EVENTS_VIEW,
    PERM_OVERVIEW_VIEW,
    PERM_SESSIONS_VIEW,
    PERM_TOKENS_VIEW,
    PERM_TASKS_MANAGE,
    PERM_USERS_VIEW,
    PERM_VOTES_VIEW,
    PERM_WEB_VIEW,
)
from services.voting_service.security import CMS_COOKIE_NAME, CMS_CSRF_COOKIE_NAME, env_flag, new_csrf_token

cms_router = APIRouter()

CMS_TOKEN_TTL = int(os.getenv("CMS_TOKEN_TTL_SECONDS", str(24 * 3600)))
CMS_LOGIN_MAX_ATTEMPTS = int(os.getenv("CMS_LOGIN_MAX_ATTEMPTS", "5"))
CMS_LOGIN_WINDOW_SECONDS = int(os.getenv("CMS_LOGIN_WINDOW_SECONDS", "900"))
CMS_COOKIE_SECURE = env_flag("CMS_COOKIE_SECURE", default=True)


class LoginRequest(BaseModel):
    username: str
    password: str


class RoleCreateRequest(BaseModel):
    key: str = Field(pattern=r"^[a-z][a-z0-9_]{2,63}$")
    name: str = Field(min_length=2, max_length=80)
    description: str = Field(default="", max_length=500)
    permission_keys: list[str] = Field(default_factory=list)


class RoleUpdateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    description: str = Field(default="", max_length=500)
    permission_keys: list[str] = Field(default_factory=list)


class AdminCreateRequest(BaseModel):
    username: str = Field(min_length=2, max_length=80, pattern=r"^[A-Za-z0-9_.@-]+$")
    password: str = Field(min_length=8, max_length=256)
    display_name: Optional[str] = Field(default=None, max_length=120)
    telegram_user_id: Optional[int] = None
    is_active: bool = True
    role_ids: list[int] = Field(default_factory=list)


class AdminUpdateRequest(BaseModel):
    display_name: Optional[str] = Field(default=None, max_length=120)
    telegram_user_id: Optional[int] = None
    is_active: bool = True
    role_ids: list[int] = Field(default_factory=list)
    password: Optional[str] = Field(default=None, min_length=8, max_length=256)


@dataclass(frozen=True)
class CmsPrincipal:
    id: int
    username: str
    display_name: Optional[str]
    is_superuser: bool
    permissions: frozenset[str]
    roles: tuple[dict, ...]
    pages: tuple[dict, ...]

    def can(self, permission: str) -> bool:
        return self.is_superuser or permission in self.permissions


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",", 1)[0].strip()
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()
    return request.client.host if request.client else "unknown"


def _get_cms_store(request: Request):
    store = getattr(request.app.state, "cms_store", None)
    if not store:
        raise HTTPException(status_code=503, detail="CMS storage is not configured")
    return store


async def _session_ref(request: Request, session_id: int) -> tuple[int, Optional[int]]:
    detail = await _get_cms_store(request).get_session(session_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Session not found")
    return int(detail["chat_id"]), detail.get("topic_id")


def _task_payload(session: Session, task: Task) -> dict:
    index = next((idx for idx, item in enumerate(session.tasks_queue) if item.task_id == task.task_id), None)
    votes = task.votes or {}
    numeric_votes = [int(value) for value in votes.values() if str(value).lstrip("-").isdigit()]
    numeric_avg = sum(numeric_votes) / len(numeric_votes) if numeric_votes else None
    numeric_max = max(numeric_votes) if numeric_votes else None
    return {
        "id": -1,
        "task_uid": task.task_id,
        "session_id": None,
        "bucket": "tasks_queue",
        "bucket_index": index if index is not None else -1,
        "jira_key": task.jira_key,
        "summary": task.summary,
        "url": task.url,
        "story_points": task.story_points,
        "source": task.source,
        "votes_count": len(votes),
        "numeric_avg": numeric_avg,
        "numeric_max": numeric_max,
        "completed_at": task.completed_at,
        "jql": task.jql,
        "created_at_text": task.created_at,
        "domain_updated_at": task.updated_at,
        "updated_at": task.updated_at,
    }


def _mutation_payload(result: TaskMutationResult, session_id: int) -> dict:
    tasks = [_task_payload(result.session, task) | {"session_id": session_id} for task in result.tasks]
    task = _task_payload(result.session, result.task) | {"session_id": session_id} if result.task else None
    deleted_task_id = result.deleted_task.task_id if result.deleted_task else None
    return {
        "ok": True,
        "tasks_version": result.session.tasks_version,
        "current_task_id": result.session.current_task_id,
        "tasks_queue_count": len(result.session.tasks_queue),
        "task": task,
        "tasks": tasks,
        "deleted_task_id": deleted_task_id,
    }


def _raise_task_error(exc: TaskQueueError) -> None:
    raise HTTPException(status_code=exc.status_code, detail=str(exc))


def _existing_jira_keys(session: Session) -> set[str]:
    keys: set[str] = set()
    for collection in (session.tasks_queue, session.history, session.last_batch):
        for task in collection:
            if task.jira_key:
                keys.add(task.jira_key)
    return keys


async def _jira_preview(jql: str, max_results: int) -> list[dict]:
    base_url = os.getenv("JIRA_SERVICE_URL", "http://jira-service:8001").rstrip("/")
    timeout = aiohttp.ClientTimeout(total=int(os.getenv("JIRA_SERVICE_TIMEOUT_SECONDS", "30")))
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.post(
            f"{base_url}/api/v1/parse",
            json={"jql": jql, "max_results": max_results},
        ) as response:
            if response.status != 200:
                body = await response.text()
                raise HTTPException(status_code=502, detail=f"Jira preview failed: {body[:300]}")
            data = await response.json()
    issues = data.get("issues", [])
    return issues if isinstance(issues, list) else []


def _jira_preview_payload(issues: list[dict], existing_keys: set[str]) -> dict:
    items = []
    skipped = []
    seen: set[str] = set()
    for issue in issues:
        key = str(issue.get("key") or "").strip().upper()
        if not key:
            continue
        item = {
            "key": key,
            "summary": issue.get("summary") or key,
            "url": issue.get("url"),
            "story_points": issue.get("story_points"),
            "duplicate": key in existing_keys or key in seen,
        }
        if item["duplicate"]:
            skipped.append(key)
        items.append(item)
        seen.add(key)
    return {
        "items": items,
        "total": len(items),
        "importable": sum(1 for item in items if not item["duplicate"]),
        "skipped_keys": skipped,
    }


async def _get_redis(request: Request) -> aioredis.Redis:
    return request.app.state.web_redis


def _extract_bearer(authorization: Optional[str]) -> Optional[str]:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    return authorization.removeprefix("Bearer ").strip() or None


async def _audit(request: Request, action: str, actor: Optional[str], status: str, payload: Optional[dict] = None) -> None:
    store = getattr(request.app.state, "cms_store", None)
    if store:
        await store.record_audit_event(
            action=action,
            actor=actor,
            status=status,
            ip=_client_ip(request),
            payload=payload,
        )


def _principal_from_record(record: dict) -> CmsPrincipal:
    return CmsPrincipal(
        id=int(record["id"]),
        username=record["username"],
        display_name=record.get("display_name"),
        is_superuser=bool(record.get("is_superuser")),
        permissions=frozenset(record.get("permissions") or []),
        roles=tuple(record.get("roles") or []),
        pages=tuple(record.get("pages") or []),
    )


async def _require_auth(
    request: Request,
    authorization: Optional[str] = Header(default=None),
    cookie_token: Optional[str] = Cookie(default=None, alias=CMS_COOKIE_NAME),
) -> CmsPrincipal:
    token = cookie_token or _extract_bearer(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="Unauthorized")

    redis_client = await _get_redis(request)
    raw = await redis_client.get(f"cms_token:{token}")
    if not raw:
        raise HTTPException(status_code=401, detail="Token expired or invalid")

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        data = {}

    store = _get_cms_store(request)
    principal_record = await store.get_admin_principal(
        admin_id=data.get("admin_id"),
        username=data.get("username"),
    )
    if not principal_record:
        await redis_client.delete(f"cms_token:{token}")
        raise HTTPException(status_code=401, detail="Token expired or invalid")

    await redis_client.expire(f"cms_token:{token}", CMS_TOKEN_TTL)
    return _principal_from_record(principal_record)


AuthDep = Depends(_require_auth)


def require_permission(permission: str):
    async def checker(principal: CmsPrincipal = AuthDep) -> CmsPrincipal:
        if not principal.can(permission):
            raise HTTPException(status_code=403, detail="Forbidden")
        return principal

    return checker


async def _ensure_login_not_limited(redis_client: aioredis.Redis, username: str, ip: str) -> str:
    key = f"cms_login_fail:{username}:{ip}"
    attempts_raw = await redis_client.get(key)
    attempts = int(attempts_raw or 0)
    if attempts >= CMS_LOGIN_MAX_ATTEMPTS:
        raise HTTPException(status_code=429, detail="Too many login attempts")
    return key


async def _record_login_failure(redis_client: aioredis.Redis, key: str) -> None:
    attempts = await redis_client.incr(key)
    if attempts == 1:
        await redis_client.expire(key, CMS_LOGIN_WINDOW_SECONDS)


@cms_router.post("/cms/auth/login")
async def cms_login(body: LoginRequest, request: Request, response: Response) -> dict:
    redis_client = await _get_redis(request)
    ip = _client_ip(request)
    fail_key = await _ensure_login_not_limited(redis_client, body.username, ip)

    principal_record = await _get_cms_store(request).verify_admin_login(body.username, body.password)
    if not principal_record:
        await _record_login_failure(redis_client, fail_key)
        await _audit(request, "cms.login", body.username, "failed", {"reason": "invalid_credentials"})
        raise HTTPException(status_code=401, detail="Invalid credentials")

    await redis_client.delete(fail_key)
    token = secrets.token_urlsafe(32)
    await redis_client.setex(
        f"cms_token:{token}",
        CMS_TOKEN_TTL,
        json.dumps({"admin_id": principal_record["id"], "username": principal_record["username"], "ip": ip}),
    )
    response.set_cookie(
        CMS_COOKIE_NAME,
        token,
        max_age=CMS_TOKEN_TTL,
        httponly=True,
        secure=CMS_COOKIE_SECURE,
        samesite="strict",
        path="/",
    )
    response.set_cookie(
        CMS_CSRF_COOKIE_NAME,
        new_csrf_token(),
        max_age=CMS_TOKEN_TTL,
        httponly=False,
        secure=CMS_COOKIE_SECURE,
        samesite="strict",
        path="/",
    )
    await _audit(request, "cms.login", principal_record["username"], "ok")
    return {"ok": True, "expires_in": CMS_TOKEN_TTL}


@cms_router.post("/cms/auth/logout")
async def cms_logout(
    request: Request,
    response: Response,
    authorization: Optional[str] = Header(default=None),
    cookie_token: Optional[str] = Cookie(default=None, alias=CMS_COOKIE_NAME),
    actor: CmsPrincipal = AuthDep,
) -> dict:
    token = cookie_token or _extract_bearer(authorization)
    if token:
        redis_client = await _get_redis(request)
        await redis_client.delete(f"cms_token:{token}")
    response.delete_cookie(CMS_COOKIE_NAME, path="/")
    response.delete_cookie(CMS_CSRF_COOKIE_NAME, path="/")
    await _audit(request, "cms.logout", actor.username, "ok")
    return {"ok": True}


@cms_router.get("/cms/auth/me")
async def cms_me(actor: CmsPrincipal = AuthDep) -> dict:
    return {
        "id": actor.id,
        "username": actor.username,
        "display_name": actor.display_name,
        "is_superuser": actor.is_superuser,
        "permissions": sorted(actor.permissions),
        "roles": list(actor.roles),
        "pages": list(actor.pages),
    }


@cms_router.get("/cms/overview")
async def cms_overview(
    request: Request,
    _: CmsPrincipal = Depends(require_permission(PERM_OVERVIEW_VIEW)),
) -> dict:
    return await _get_cms_store(request).overview()


@cms_router.get("/cms/sessions")
async def cms_sessions(
    request: Request,
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    cursor: Optional[str] = None,
    q: Optional[str] = None,
    active: Optional[bool] = None,
    chat_id: Optional[int] = None,
    topic_id: Optional[int] = None,
    _: CmsPrincipal = Depends(require_permission(PERM_SESSIONS_VIEW)),
) -> dict:
    return await _get_cms_store(request).list_sessions(
        limit=limit,
        cursor=cursor,
        q=q,
        active=active,
        chat_id=chat_id,
        topic_id=topic_id,
    )


@cms_router.get("/cms/sessions/{session_id}")
async def cms_session_detail(
    session_id: int,
    request: Request,
    _: CmsPrincipal = Depends(require_permission(PERM_SESSIONS_VIEW)),
) -> dict:
    session = await _get_cms_store(request).get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@cms_router.get("/cms/sessions/{session_id}/participants")
async def cms_session_participants(
    session_id: int,
    request: Request,
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    cursor: Optional[str] = None,
    _: CmsPrincipal = Depends(require_permission(PERM_SESSIONS_VIEW)),
) -> dict:
    return await _get_cms_store(request).list_session_participants(session_id, limit, cursor)


@cms_router.get("/cms/sessions/{session_id}/tasks")
async def cms_session_tasks(
    session_id: int,
    request: Request,
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    cursor: Optional[str] = None,
    bucket: Optional[str] = Query(None, pattern="^(tasks_queue|history|last_batch)$"),
    q: Optional[str] = None,
    _: CmsPrincipal = Depends(require_permission(PERM_SESSIONS_VIEW)),
) -> dict:
    return await _get_cms_store(request).list_session_tasks(session_id, limit, cursor, bucket, q)


@cms_router.post("/cms/sessions/{session_id}/tasks")
async def cms_create_session_task(
    session_id: int,
    body: TaskCreateRequest,
    request: Request,
    actor: CmsPrincipal = Depends(require_permission(PERM_TASKS_MANAGE)),
) -> dict:
    chat_id, topic_id = await _session_ref(request, session_id)
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
        await _audit(request, "cms.task.create", actor.username, "failed", {"error": str(exc), "session_id": session_id})
        _raise_task_error(exc)
    await _audit(request, "cms.task.create", actor.username, "ok", {"session_id": session_id, "task_id": result.task.task_id if result.task else None})
    return _mutation_payload(result, session_id)


@cms_router.post("/cms/sessions/{session_id}/tasks/bulk")
async def cms_create_session_tasks_bulk(
    session_id: int,
    body: TaskBulkCreateRequest,
    request: Request,
    actor: CmsPrincipal = Depends(require_permission(PERM_TASKS_MANAGE)),
) -> dict:
    chat_id, topic_id = await _session_ref(request, session_id)
    use_case = AddManualTasksUseCase(request.app.state.repository)
    try:
        result = await use_case.execute(
            chat_id=chat_id,
            topic_id=topic_id,
            items=[item.model_dump() for item in body.tasks],
            expected_version=body.expected_version,
        )
    except TaskQueueError as exc:
        await _audit(request, "cms.task.bulk_create", actor.username, "failed", {"error": str(exc), "session_id": session_id})
        _raise_task_error(exc)
    await _audit(
        request,
        "cms.task.bulk_create",
        actor.username,
        "ok",
        {"session_id": session_id, "count": len(result.tasks)},
    )
    return _mutation_payload(result, session_id)


@cms_router.patch("/cms/sessions/{session_id}/tasks/{task_id}")
async def cms_update_session_task(
    session_id: int,
    task_id: str,
    body: TaskUpdateRequest,
    request: Request,
    actor: CmsPrincipal = Depends(require_permission(PERM_TASKS_MANAGE)),
) -> dict:
    chat_id, topic_id = await _session_ref(request, session_id)
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
        await _audit(request, "cms.task.update", actor.username, "failed", {"error": str(exc), "session_id": session_id, "task_id": task_id})
        _raise_task_error(exc)
    await _audit(request, "cms.task.update", actor.username, "ok", {"session_id": session_id, "task_id": task_id})
    return _mutation_payload(result, session_id)


@cms_router.delete("/cms/sessions/{session_id}/tasks/{task_id}")
async def cms_delete_session_task(
    session_id: int,
    task_id: str,
    request: Request,
    expected_version: Optional[int] = Query(default=None, ge=0),
    actor: CmsPrincipal = Depends(require_permission(PERM_TASKS_MANAGE)),
) -> dict:
    chat_id, topic_id = await _session_ref(request, session_id)
    use_case = DeleteTaskUseCase(request.app.state.repository)
    try:
        result = await use_case.execute(
            chat_id=chat_id,
            topic_id=topic_id,
            task_id=task_id,
            expected_version=expected_version,
        )
    except TaskQueueError as exc:
        await _audit(request, "cms.task.delete", actor.username, "failed", {"error": str(exc), "session_id": session_id, "task_id": task_id})
        _raise_task_error(exc)
    await _audit(request, "cms.task.delete", actor.username, "ok", {"session_id": session_id, "task_id": task_id})
    return _mutation_payload(result, session_id)


@cms_router.post("/cms/sessions/{session_id}/tasks/{task_id}/move")
async def cms_move_session_task(
    session_id: int,
    task_id: str,
    body: TaskMoveRequest,
    request: Request,
    actor: CmsPrincipal = Depends(require_permission(PERM_TASKS_MANAGE)),
) -> dict:
    chat_id, topic_id = await _session_ref(request, session_id)
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
        await _audit(request, "cms.task.move", actor.username, "failed", {"error": str(exc), "session_id": session_id, "task_id": task_id})
        _raise_task_error(exc)
    await _audit(
        request,
        "cms.task.move",
        actor.username,
        "ok",
        {"session_id": session_id, "task_id": task_id, "target_index": body.target_index},
    )
    return _mutation_payload(result, session_id)


@cms_router.post("/cms/sessions/{session_id}/tasks/reorder")
async def cms_reorder_session_tasks(
    session_id: int,
    body: TaskReorderRequest,
    request: Request,
    actor: CmsPrincipal = Depends(require_permission(PERM_TASKS_MANAGE)),
) -> dict:
    chat_id, topic_id = await _session_ref(request, session_id)
    use_case = ReorderTasksUseCase(request.app.state.repository)
    try:
        result = await use_case.execute(
            chat_id=chat_id,
            topic_id=topic_id,
            ordered_task_ids=body.ordered_task_ids,
            expected_version=body.expected_version,
        )
    except TaskQueueError as exc:
        await _audit(request, "cms.task.reorder", actor.username, "failed", {"error": str(exc), "session_id": session_id})
        _raise_task_error(exc)
    await _audit(request, "cms.task.reorder", actor.username, "ok", {"session_id": session_id, "count": len(body.ordered_task_ids)})
    return _mutation_payload(result, session_id)


@cms_router.post("/cms/sessions/{session_id}/tasks/jira-preview")
async def cms_preview_jira_tasks(
    session_id: int,
    body: JiraPreviewRequest,
    request: Request,
    _: CmsPrincipal = Depends(require_permission(PERM_TASKS_MANAGE)),
) -> dict:
    chat_id, topic_id = await _session_ref(request, session_id)
    session = await get_repo_session(request.app.state.repository, chat_id, topic_id)
    issues = await _jira_preview(body.jql, body.max_results)
    return _jira_preview_payload(issues, _existing_jira_keys(session))


@cms_router.post("/cms/sessions/{session_id}/tasks/jira-import")
async def cms_import_jira_tasks(
    session_id: int,
    body: JiraImportRequest,
    request: Request,
    actor: CmsPrincipal = Depends(require_permission(PERM_TASKS_MANAGE)),
) -> dict:
    chat_id, topic_id = await _session_ref(request, session_id)
    try:
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

        _, result = await mutate_repo_session(request.app.state.repository, chat_id, topic_id, mutate)
    except TaskQueueError as exc:
        await _audit(request, "cms.task.jira_import", actor.username, "failed", {"error": str(exc), "session_id": session_id})
        _raise_task_error(exc)

    await _audit(request, "cms.task.jira_import", actor.username, "ok", {"session_id": session_id, "count": len(result.tasks)})
    return _mutation_payload(result, session_id)


@cms_router.get("/cms/users")
async def cms_users(
    request: Request,
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    cursor: Optional[str] = None,
    q: Optional[str] = None,
    role: Optional[str] = None,
    _: CmsPrincipal = Depends(require_permission(PERM_USERS_VIEW)),
) -> dict:
    return await _get_cms_store(request).list_users(limit=limit, cursor=cursor, q=q, role=role)


@cms_router.get("/cms/votes")
async def cms_votes(
    request: Request,
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    cursor: Optional[str] = None,
    session_id: Optional[int] = None,
    task_id: Optional[int] = None,
    user_id: Optional[int] = None,
    _: CmsPrincipal = Depends(require_permission(PERM_VOTES_VIEW)),
) -> dict:
    return await _get_cms_store(request).list_votes(
        limit=limit,
        cursor=cursor,
        session_id=session_id,
        task_id=task_id,
        user_id=user_id,
    )


@cms_router.get("/cms/tokens")
async def cms_tokens(
    request: Request,
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    cursor: Optional[str] = None,
    active: Optional[bool] = None,
    _: CmsPrincipal = Depends(require_permission(PERM_TOKENS_VIEW)),
) -> dict:
    return await _get_cms_store(request).list_web_tokens(limit=limit, cursor=cursor, active=active)


@cms_router.get("/cms/web-participants")
async def cms_web_participants(
    request: Request,
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    cursor: Optional[str] = None,
    token_hash: Optional[str] = None,
    active: Optional[bool] = None,
    _: CmsPrincipal = Depends(require_permission(PERM_WEB_VIEW)),
) -> dict:
    return await _get_cms_store(request).list_web_participants(
        limit=limit,
        cursor=cursor,
        token_hash_filter=token_hash,
        active=active,
    )


@cms_router.get("/cms/events")
async def cms_events(
    request: Request,
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    cursor: Optional[str] = None,
    action: Optional[str] = None,
    status: Optional[str] = None,
    _: CmsPrincipal = Depends(require_permission(PERM_EVENTS_VIEW)),
) -> dict:
    return await _get_cms_store(request).list_audit_events(
        limit=limit,
        cursor=cursor,
        action=action,
        status=status,
    )


@cms_router.get("/cms/access/permissions")
async def cms_access_permissions(
    request: Request,
    _: CmsPrincipal = Depends(require_permission(PERM_ACCESS_VIEW)),
) -> dict:
    return {"items": await _get_cms_store(request).list_cms_permissions()}


@cms_router.get("/cms/access/pages")
async def cms_access_pages(
    request: Request,
    _: CmsPrincipal = Depends(require_permission(PERM_ACCESS_VIEW)),
) -> dict:
    return {"items": await _get_cms_store(request).list_cms_pages()}


@cms_router.get("/cms/access/roles")
async def cms_access_roles(
    request: Request,
    _: CmsPrincipal = Depends(require_permission(PERM_ACCESS_VIEW)),
) -> dict:
    return {"items": await _get_cms_store(request).list_cms_roles()}


@cms_router.post("/cms/access/roles")
async def cms_access_create_role(
    body: RoleCreateRequest,
    request: Request,
    actor: CmsPrincipal = Depends(require_permission(PERM_ACCESS_MANAGE)),
) -> dict:
    try:
        role = await _get_cms_store(request).create_cms_role(
            key=body.key,
            name=body.name,
            description=body.description,
            permission_keys=body.permission_keys,
        )
    except Exception as exc:
        await _audit(request, "cms.access.role.create", actor.username, "failed", {"error": str(exc)})
        raise HTTPException(status_code=400, detail="Role could not be created") from exc
    await _audit(request, "cms.access.role.create", actor.username, "ok", {"role_id": role["id"]})
    return role


@cms_router.patch("/cms/access/roles/{role_id}")
async def cms_access_update_role(
    role_id: int,
    body: RoleUpdateRequest,
    request: Request,
    actor: CmsPrincipal = Depends(require_permission(PERM_ACCESS_MANAGE)),
) -> dict:
    role = await _get_cms_store(request).update_cms_role(
        role_id=role_id,
        name=body.name,
        description=body.description,
        permission_keys=body.permission_keys,
    )
    if not role:
        raise HTTPException(status_code=404, detail="Role not found or system role is read-only")
    await _audit(request, "cms.access.role.update", actor.username, "ok", {"role_id": role_id})
    return role


@cms_router.get("/cms/access/admins")
async def cms_access_admins(
    request: Request,
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    cursor: Optional[str] = None,
    q: Optional[str] = None,
    active: Optional[bool] = None,
    role_id: Optional[int] = None,
    _: CmsPrincipal = Depends(require_permission(PERM_ACCESS_VIEW)),
) -> dict:
    return await _get_cms_store(request).list_cms_admins(
        limit=limit,
        cursor=cursor,
        q=q,
        active=active,
        role_id=role_id,
    )


@cms_router.post("/cms/access/admins")
async def cms_access_create_admin(
    body: AdminCreateRequest,
    request: Request,
    actor: CmsPrincipal = Depends(require_permission(PERM_ACCESS_MANAGE)),
) -> dict:
    try:
        admin = await _get_cms_store(request).create_cms_admin(
            username=body.username,
            password=body.password,
            display_name=body.display_name,
            telegram_user_id=body.telegram_user_id,
            is_active=body.is_active,
            role_ids=body.role_ids,
        )
    except Exception as exc:
        await _audit(request, "cms.access.admin.create", actor.username, "failed", {"error": str(exc)})
        raise HTTPException(status_code=400, detail="Admin could not be created") from exc
    await _audit(request, "cms.access.admin.create", actor.username, "ok", {"admin_id": admin["id"]})
    return admin


@cms_router.patch("/cms/access/admins/{admin_id}")
async def cms_access_update_admin(
    admin_id: int,
    body: AdminUpdateRequest,
    request: Request,
    actor: CmsPrincipal = Depends(require_permission(PERM_ACCESS_MANAGE)),
) -> dict:
    if admin_id == actor.id and not body.is_active:
        raise HTTPException(status_code=400, detail="You cannot deactivate your own admin account")
    admin = await _get_cms_store(request).update_cms_admin(
        admin_id=admin_id,
        display_name=body.display_name,
        telegram_user_id=body.telegram_user_id,
        is_active=body.is_active,
        role_ids=body.role_ids,
        password=body.password,
    )
    if not admin:
        raise HTTPException(status_code=404, detail="Admin not found")
    await _audit(request, "cms.access.admin.update", actor.username, "ok", {"admin_id": admin_id})
    return admin
