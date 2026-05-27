"""CMS admin API for superuser dashboards.

Cross-cutting HTTP helpers (auth principal, audit logging, common pydantic
models, jira-preview proxy, broadcast publishing) used to live here and were
imported by ``app_api`` — which also caused a circular import in the other
direction. They now live in ``_http_shared`` and are re-exported below so
existing imports keep working.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import secrets
from datetime import datetime
from typing import Optional

import redis.asyncio as aioredis
from fastapi import APIRouter, Cookie, Depends, Header, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field

from app.domain.session import Session
from app.domain.task import Task
from app.usecases.close_session import CloseSessionUseCase
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
from services.voting_service.cms_store import DEFAULT_LIMIT, MAX_LIMIT, token_hash as compute_token_hash
from services.voting_service.rate_limit import enforce_rate_limit
from services.voting_service.cms_rbac import (
    PERM_ACCESS_MANAGE,
    PERM_ACCESS_VIEW,
    PERM_APP_SESSIONS_MANAGE,
    PERM_EVENTS_VIEW,
    PERM_OVERVIEW_VIEW,
    PERM_SESSIONS_VIEW,
    PERM_TOKENS_VIEW,
    PERM_TASKS_MANAGE,
    PERM_USERS_VIEW,
    PERM_VOTES_VIEW,
    PERM_WEB_PARTICIPANTS_DELETE,
    PERM_WEB_VIEW,
)
from services.voting_service._http_shared import (
    ALLOWED_THEME_PREFERENCES,
    AuthDep,
    CMS_COOKIE_NAME,
    CMS_COOKIE_SECURE,
    CMS_LOGIN_IP_MAX_ATTEMPTS,
    CMS_LOGIN_IP_WINDOW_SECONDS,
    CMS_LOGIN_MAX_ATTEMPTS,
    CMS_LOGIN_WINDOW_SECONDS,
    CMS_TOKEN_TTL,
    CmsPrincipal,
    DEFAULT_THEME_PREFERENCE,
    JiraImportRequest,
    JiraPreviewRequest,
    TaskCreateRequest,
    TaskInput,
    TaskMoveRequest,
    TaskReorderRequest,
    TaskUpdateRequest,
    ThemePreference,
    _audit,
    _client_ip,
    _existing_jira_keys,
    _extract_bearer,
    _fetch_jira_description,
    _get_cms_store,
    _get_redis,
    _get_repo_session,
    _jira_preview,
    _jira_preview_payload,
    _mutate_repo_session,
    _mutation_payload,
    _principal_from_record,
    _publish_state,
    _raise_task_error,
    _require_auth,
    _save_repo_session,
    _task_payload,
    require_permission,
)

logger = logging.getLogger(__name__)

cms_router = APIRouter()


# ---------------------------------------------------------------------------
# Re-exports for backward compatibility (do NOT delete — external callers and
# tests import these names from ``services.voting_service.cms_api``).
# ---------------------------------------------------------------------------

__all__ = [
    "CmsPrincipal",
    "_audit",
    "_existing_jira_keys",
    "_jira_preview",
    "_jira_preview_payload",
    "_mutation_payload",
    "_raise_task_error",
    "_publish_state",
    "require_permission",
    "cms_router",
]


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


class ParticipantHardDeleteRequest(BaseModel):
    user_id: Optional[str] = Field(default=None, min_length=1, max_length=32)
    confirm_name: str = Field(min_length=1, max_length=200)


class AdminCreateRequest(BaseModel):
    username: str = Field(min_length=2, max_length=80, pattern=r"^[A-Za-z0-9_.@-]+$")
    password: str = Field(min_length=8, max_length=256)
    display_name: Optional[str] = Field(default=None, max_length=120)
    is_active: bool = True
    role_ids: list[int] = Field(default_factory=list)


class AdminUpdateRequest(BaseModel):
    display_name: Optional[str] = Field(default=None, max_length=120)
    is_active: bool = True
    role_ids: list[int] = Field(default_factory=list)
    password: Optional[str] = Field(default=None, min_length=8, max_length=256)


class SessionRenameRequest(BaseModel):
    """Rename a CMS session. Empty string clears the custom title and
    callers fall back to the technical identifier."""

    title: Optional[str] = Field(default=None, max_length=200)


async def _session_ref(request: Request, session_id: int) -> tuple[int, Optional[int]]:
    detail = await _get_cms_store(request).get_session(session_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Session not found")
    return int(detail["chat_id"]), detail.get("topic_id")


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
    # Defence-in-depth: cap total login attempts from a single IP
    # regardless of username, so username enumeration from one source
    # cannot stay under the per-username quota indefinitely.
    await enforce_rate_limit(
        redis_client,
        key=f"rl:login:ip:{ip}",
        limit=CMS_LOGIN_IP_MAX_ATTEMPTS,
        window_seconds=CMS_LOGIN_IP_WINDOW_SECONDS,
        error_detail="Too many login attempts",
    )
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
        "theme_preference": actor.theme_preference,
    }


class PreferencesUpdateRequest(BaseModel):
    theme_preference: str = Field(pattern=r"^(dark|light|system)$")


@cms_router.patch("/cms/auth/me/preferences")
async def cms_update_preferences(
    body: PreferencesUpdateRequest,
    request: Request,
    actor: CmsPrincipal = AuthDep,
) -> dict:
    """Persist UI preferences (currently: theme) for the authenticated CMS user."""
    theme = body.theme_preference
    if theme not in ALLOWED_THEME_PREFERENCES:
        raise HTTPException(status_code=400, detail="Invalid theme_preference")
    store = _get_cms_store(request)
    try:
        ok = await store.update_admin_theme_preference(actor.id, theme)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not ok:
        # Account is missing or deactivated — treat as unauthorized rather than 404
        # to avoid leaking account state.
        raise HTTPException(status_code=401, detail="Account is no longer active")
    await _audit(
        request,
        "cms.preferences.update",
        actor.username,
        "ok",
        {"theme_preference": theme},
    )
    return {"ok": True, "theme_preference": theme}


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


@cms_router.patch("/cms/sessions/{session_id}")
async def cms_rename_session(
    session_id: int,
    body: SessionRenameRequest,
    request: Request,
    actor: CmsPrincipal = Depends(require_permission(PERM_APP_SESSIONS_MANAGE)),
) -> dict:
    """Rename a CMS session. Title is optional human-readable name shown in
    place of the technical ``chat_id:topic_id`` key. Sending ``null`` or an
    empty string clears the custom title."""
    store = _get_cms_store(request)
    result = await store.rename_session(session_id, body.title)
    if result is None:
        raise HTTPException(status_code=404, detail="Session not found or already deleted")
    _, _, new_title = result
    await _audit(
        request,
        "cms.session.rename",
        actor.username,
        "ok",
        {"session_id": session_id, "title": new_title},
    )
    return {
        "ok": True,
        "session_id": session_id,
        "title": new_title,
    }


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
    session = await _get_repo_session(request.app.state.repository, chat_id, topic_id)
    issues = await _jira_preview(request.app.state.http_session, body.jql, body.max_results)
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
        issues = await _jira_preview(request.app.state.http_session, body.jql, body.max_results)

        # Same best-effort description pre-fetch as the manager import path —
        # see app_api.app_import_jira_tasks for the rationale.
        keys_to_fetch = [
            str(issue.get("key") or "").strip().upper()
            for issue in issues
            if str(issue.get("key") or "").strip()
            and (not selected or str(issue.get("key") or "").strip().upper() in selected)
        ]
        descriptions = dict(
            zip(
                keys_to_fetch,
                await asyncio.gather(
                    *[
                        _fetch_jira_description(request.app.state.http_session, key)
                        for key in keys_to_fetch
                    ]
                ),
            )
        ) if keys_to_fetch else {}

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
                    description=descriptions.get(key),
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

        _, result = await _mutate_repo_session(request.app.state.repository, chat_id, topic_id, mutate)
    except TaskQueueError as exc:
        await _audit(request, "cms.task.jira_import", actor.username, "failed", {"error": str(exc), "session_id": session_id})
        _raise_task_error(exc)

    await _audit(request, "cms.task.jira_import", actor.username, "ok", {"session_id": session_id, "count": len(result.tasks)})
    return _mutation_payload(result, session_id)


# ---------------------------------------------------------------------------
# Session lifecycle: close (force-finish) and soft-delete
# ---------------------------------------------------------------------------


async def _broadcast_session_state(request: Request, session: Session) -> None:
    """Publish a fresh state snapshot so participants see CMS-driven changes.

    ``_publish_state`` is itself best-effort (swallows pub/sub failures) but we
    add a second guard here so a CMS-driven mutation surface never returns
    5xx because the broadcast attempt blew up in an unexpected way.
    """
    try:
        await _publish_state(request, session)
    except Exception as exc:  # noqa: BLE001
        logger.warning("CMS broadcast failed: %s", exc)


async def _purge_redis_tokens_for_session(request: Request, chat_id: int, topic_id: Optional[int]) -> None:
    """Best-effort: drop live ``web:<token>`` keys belonging to the session.

    Database expiry is updated by ``cms_store.revoke_web_token`` per token, but
    that only flips the read-model. The actual short-lived Redis entries
    (which authorize ``GET /web/state/...``) are wiped here so participants
    lose access immediately when an admin removes the session.
    """
    redis_client = getattr(request.app.state, "web_redis", None)
    if not redis_client:
        return
    try:
        async for key in redis_client.scan_iter(match="web:*", count=200):
            raw = await redis_client.get(key)
            if not raw:
                continue
            try:
                info = json.loads(raw)
            except json.JSONDecodeError:
                continue
            if int(info.get("chat_id", -1)) != chat_id:
                continue
            stored_topic = info.get("topic_id")
            if (stored_topic is None) != (topic_id is None):
                continue
            if stored_topic is not None and int(stored_topic) != int(topic_id or 0):
                continue
            await redis_client.delete(key)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Redis web-token purge failed: %s", exc)


@cms_router.post("/cms/sessions/{session_id}/close")
async def cms_close_session(
    session_id: int,
    request: Request,
    actor: CmsPrincipal = Depends(require_permission(PERM_APP_SESSIONS_MANAGE)),
) -> dict:
    """Force-finish a session from the CMS. Idempotent — safe to call twice.

    Behaves identically to the manager-driven ``POST /app/sessions/{chat_id}/finish``
    — both delegate to ``CloseSessionUseCase``.
    """
    chat_id, topic_id = await _session_ref(request, session_id)
    use_case = CloseSessionUseCase(request.app.state.repository)
    refreshed_session, completed = await use_case.execute(chat_id, topic_id)
    await _broadcast_session_state(request, refreshed_session)
    await _audit(
        request,
        "cms.session.close",
        actor.username,
        "ok",
        {"session_id": session_id, "completed_count": len(completed)},
    )
    return {
        "ok": True,
        "session_id": session_id,
        "chat_id": chat_id,
        "topic_id": topic_id,
        "completed_count": len(completed),
        "batch_completed": True,
    }


@cms_router.delete("/cms/sessions/{session_id}")
async def cms_delete_session(
    session_id: int,
    request: Request,
    actor: CmsPrincipal = Depends(require_permission(PERM_APP_SESSIONS_MANAGE)),
) -> dict:
    """Soft-delete a session.

    The CMS read-model row is flagged ``deleted_at`` so it disappears from all
    listings together with its tasks/votes/participants/tokens. The live
    Redis state and any pending invite tokens are also dropped so the deleted
    session cannot be reopened by a stale browser tab.
    """
    chat_id, topic_id = await _session_ref(request, session_id)
    store = _get_cms_store(request)
    deleted_ref = await store.soft_delete_session(session_id)
    if deleted_ref is None:
        raise HTTPException(status_code=404, detail="Session not found or already deleted")

    repo = request.app.state.repository
    try:
        if hasattr(repo, "delete_session_async"):
            await repo.delete_session_async(chat_id, topic_id)
        elif hasattr(repo, "delete_session"):
            await repo.delete_session(chat_id, topic_id)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Live session delete failed (id=%s): %s", session_id, exc)

    await _purge_redis_tokens_for_session(request, chat_id, topic_id)

    await _audit(
        request,
        "cms.session.delete",
        actor.username,
        "ok",
        {"session_id": session_id, "chat_id": chat_id, "topic_id": topic_id},
    )
    return {
        "ok": True,
        "session_id": session_id,
        "deleted": True,
    }


@cms_router.delete("/cms/tokens/{token_id}")
async def cms_revoke_token(
    token_id: int,
    request: Request,
    actor: CmsPrincipal = Depends(require_permission(PERM_APP_SESSIONS_MANAGE)),
) -> dict:
    """Revoke a single invite token immediately.

    Only the read-model token_hash is recorded in Postgres, so we can't
    construct the original ``web:<token>`` Redis key from the hash. Instead we
    scan Redis once and drop the matching ``web:`` key by comparing hashes.
    """
    store = _get_cms_store(request)
    revoked_hash = await store.revoke_web_token(token_id)
    if not revoked_hash:
        raise HTTPException(status_code=404, detail="Token not found or already expired")

    redis_client = getattr(request.app.state, "web_redis", None)
    if redis_client:
        try:
            async for key in redis_client.scan_iter(match="web:*", count=200):
                token = key.removeprefix("web:")
                if compute_token_hash(token) == revoked_hash:
                    await redis_client.delete(key)
                    break
        except Exception as exc:  # noqa: BLE001
            logger.warning("Redis revoke for token id=%s failed: %s", token_id, exc)

    await _audit(
        request,
        "cms.token.revoke",
        actor.username,
        "ok",
        {"token_id": token_id},
    )
    return {"ok": True, "token_id": token_id, "revoked": True}


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


@cms_router.delete("/cms/users")
@cms_router.delete("/cms/users/{path_user_id}")
async def cms_hard_delete_user(
    body: ParticipantHardDeleteRequest,
    request: Request,
    path_user_id: Optional[str] = None,
    actor: CmsPrincipal = Depends(require_permission(PERM_WEB_PARTICIPANTS_DELETE)),
) -> dict:
    store = _get_cms_store(request)
    raw_user_id = body.user_id or path_user_id
    if raw_user_id is None:
        raise HTTPException(status_code=400, detail="Invalid participant id")
    try:
        user_id = int(raw_user_id.strip())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid participant id") from exc
    try:
        deleted = await store.hard_delete_user(user_id, body.confirm_name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Type the participant name exactly to confirm deletion") from exc
    if deleted is None:
        raise HTTPException(status_code=404, detail="Participant not found")
    return {
        "ok": True,
        "user_id": deleted["user_id"],
        "deleted": True,
        "votes_deleted": deleted["votes_deleted"],
        "session_participants_deleted": deleted["session_participants_deleted"],
        "web_participants_deleted": deleted["web_participants_deleted"],
        "actor": actor.username,
    }


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
    actor: Optional[str] = Query(default=None, max_length=120),
    ts_from: Optional[datetime] = None,
    ts_to: Optional[datetime] = None,
    _: CmsPrincipal = Depends(require_permission(PERM_EVENTS_VIEW)),
) -> dict:
    """Paged audit-events feed.

    ``actor`` filters by exact username (case sensitive). ``ts_from`` and
    ``ts_to`` are inclusive bounds and are applied before cursor pagination.
    """
    return await _get_cms_store(request).list_audit_events(
        limit=limit,
        cursor=cursor,
        action=action,
        status=status,
        actor=actor,
        ts_from=ts_from,
        ts_to=ts_to,
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
        is_active=body.is_active,
        role_ids=body.role_ids,
        password=body.password,
    )
    if not admin:
        raise HTTPException(status_code=404, detail="Admin not found")
    await _audit(request, "cms.access.admin.update", actor.username, "ok", {"admin_id": admin_id})
    return admin
