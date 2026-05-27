"""Shared HTTP-layer building blocks for the voting service.

Brought into existence to:

* break the circular import between ``app_api`` and ``cms_api`` (CMS used to
  reach into the manager API for ``_publish_state``, the manager API reached
  into CMS for auth/audit/jira helpers);
* keep cross-cutting HTTP concerns (auth principal, audit logging,
  request helpers, common pydantic models, broadcast publishing) in a single
  module that both routers depend on, rather than scattered between two
  ~1.3k LoC files;
* preserve the public symbols every external caller already imports. The
  legacy import paths (``from services.voting_service.cms_api import
  CmsPrincipal, _audit, require_permission, ...`` and
  ``from services.voting_service.app_api import _publish_state``) keep
  working via re-exports in those modules.

No business logic lives here — only HTTP plumbing and serialization
shared by both routers.
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from typing import Optional

import aiohttp
import redis.asyncio as aioredis
from fastapi import Cookie, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field

from app.domain.session import Session
from app.domain.task import Task
from app.usecases.manage_tasks import TaskMutationResult, TaskQueueError
from services.voting_service.web_api import _build_web_session_state, _channel_name

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# CMS auth / cookie / theme constants
# ---------------------------------------------------------------------------

CMS_TOKEN_TTL = int(os.getenv("CMS_TOKEN_TTL_SECONDS", str(24 * 3600)))
CMS_LOGIN_MAX_ATTEMPTS = int(os.getenv("CMS_LOGIN_MAX_ATTEMPTS", "5"))
CMS_LOGIN_WINDOW_SECONDS = int(os.getenv("CMS_LOGIN_WINDOW_SECONDS", "900"))
# IP-wide login attempt cap (counts every attempt — success or failure).
# Defence against the per-username cap above being trivially bypassed by
# rotating usernames from the same source.
CMS_LOGIN_IP_MAX_ATTEMPTS = int(os.getenv("CMS_LOGIN_IP_MAX_ATTEMPTS", "20"))
CMS_LOGIN_IP_WINDOW_SECONDS = int(os.getenv("CMS_LOGIN_IP_WINDOW_SECONDS", "900"))
CMS_COOKIE_NAME = "cms_token"
CMS_COOKIE_SECURE = os.getenv("CMS_COOKIE_SECURE", "false").lower() == "true"

ThemePreference = str  # one of: "dark", "light", "system"
ALLOWED_THEME_PREFERENCES: frozenset[str] = frozenset({"dark", "light", "system"})
DEFAULT_THEME_PREFERENCE: ThemePreference = "system"


# ---------------------------------------------------------------------------
# Pydantic models used by BOTH /app/* and /cms/* routers
# ---------------------------------------------------------------------------


class TaskInput(BaseModel):
    summary: str = Field(min_length=1, max_length=500)
    jira_key: Optional[str] = Field(default=None, max_length=64)
    url: Optional[str] = Field(default=None, max_length=1000)
    story_points: Optional[int] = Field(default=None, ge=0, le=1000)


class TaskCreateRequest(TaskInput):
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


# ---------------------------------------------------------------------------
# Authenticated CMS principal
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class CmsPrincipal:
    id: int
    username: str
    display_name: Optional[str]
    is_superuser: bool
    permissions: frozenset[str]
    roles: tuple[dict, ...]
    pages: tuple[dict, ...]
    theme_preference: ThemePreference = DEFAULT_THEME_PREFERENCE

    def can(self, permission: str) -> bool:
        return self.is_superuser or permission in self.permissions


def _principal_from_record(record: dict) -> CmsPrincipal:
    theme = record.get("theme_preference") or DEFAULT_THEME_PREFERENCE
    if theme not in ALLOWED_THEME_PREFERENCES:
        theme = DEFAULT_THEME_PREFERENCE
    return CmsPrincipal(
        id=int(record["id"]),
        username=record["username"],
        display_name=record.get("display_name"),
        is_superuser=bool(record.get("is_superuser")),
        permissions=frozenset(record.get("permissions") or []),
        roles=tuple(record.get("roles") or []),
        pages=tuple(record.get("pages") or []),
        theme_preference=theme,
    )


# ---------------------------------------------------------------------------
# Request-scoped helpers
# ---------------------------------------------------------------------------


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",", 1)[0].strip()
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()
    return request.client.host if request.client else "unknown"


def _extract_bearer(authorization: Optional[str]) -> Optional[str]:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    return authorization.removeprefix("Bearer ").strip() or None


async def _get_redis(request: Request) -> aioredis.Redis:
    return request.app.state.web_redis


def _get_cms_store(request: Request):
    store = getattr(request.app.state, "cms_store", None)
    if not store:
        raise HTTPException(status_code=503, detail="CMS storage is not configured")
    return store


# ---------------------------------------------------------------------------
# Repository helpers (work with both sync and async repository adapters)
# ---------------------------------------------------------------------------


async def _get_repo_session(repo, chat_id: int, topic_id: Optional[int]) -> Session:
    if hasattr(repo, "get_session_async"):
        return await repo.get_session_async(chat_id, topic_id)
    return await repo.get_session(chat_id, topic_id)


async def _save_repo_session(repo, session: Session) -> None:
    if hasattr(repo, "save_session_async"):
        await repo.save_session_async(session)
        return
    await repo.save_session(session)


async def _mutate_repo_session(repo, chat_id: int, topic_id: Optional[int], mutator):
    """Run ``mutator(session)`` atomically when the repository supports it,
    falling back to read-modify-write on simpler adapters.

    Returns ``(session, mutator_result)`` so callers can both broadcast the
    new state and react to the mutator's return value (e.g. an error string).
    """
    if hasattr(repo, "mutate_session"):
        return await repo.mutate_session(chat_id, topic_id, mutator)
    session = await _get_repo_session(repo, chat_id, topic_id)
    result = mutator(session)
    await _save_repo_session(repo, session)
    return session, result


# ---------------------------------------------------------------------------
# Authentication / authorization
# ---------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------
# Audit
# ---------------------------------------------------------------------------


async def _audit(
    request: Request,
    action: str,
    actor: Optional[str],
    status: str,
    payload: Optional[dict] = None,
) -> None:
    """Record a structured audit event. Silent no-op when the CMS read model
    is unavailable so production HTTP flows are never blocked by audit
    storage being down."""
    store = getattr(request.app.state, "cms_store", None)
    if store:
        await store.record_audit_event(
            action=action,
            actor=actor,
            status=status,
            ip=_client_ip(request),
            payload=payload,
        )


# ---------------------------------------------------------------------------
# Jira preview helpers (manager + CMS both import these — Jira proxy lives in
# the jira-service container)
# ---------------------------------------------------------------------------


def _existing_jira_keys(session: Session) -> set[str]:
    keys: set[str] = set()
    for collection in (session.tasks_queue, session.history, session.last_batch):
        for task in collection:
            if task.jira_key:
                keys.add(task.jira_key)
    return keys


async def _jira_preview(
    http_session: aiohttp.ClientSession,
    jql: str,
    max_results: int,
) -> list[dict]:
    """Call ``jira-service/api/v1/parse`` to translate a JQL query into a
    list of issue dicts.

    The HTTP session is the long-lived one created in the voting-service
    lifespan and stored on ``app.state.http_session`` — re-using it across
    requests keeps the TCP/TLS pool warm and lets jira-service's in-memory
    cache actually do its job.
    """
    base_url = os.getenv("JIRA_SERVICE_URL", "http://jira-service:8001").rstrip("/")
    timeout = aiohttp.ClientTimeout(total=int(os.getenv("JIRA_SERVICE_TIMEOUT_SECONDS", "30")))
    async with http_session.post(
        f"{base_url}/api/v1/parse",
        json={"jql": jql, "max_results": max_results},
        timeout=timeout,
    ) as response:
        if response.status != 200:
            body = await response.text()
            raise HTTPException(status_code=502, detail=f"Jira preview failed: {body[:300]}")
        data = await response.json()
    issues = data.get("issues", [])
    return issues if isinstance(issues, list) else []


async def _ensure_current_task_description(
    request: Request,
    chat_id: int,
    topic_id: Optional[int] = None,
    *,
    session: Optional[Session] = None,
) -> bool:
    """Lazy-backfill ``Task.description`` for the session's current task.

    Reason this exists: ``description`` is captured at Jira import time,
    but every session imported *before* that field landed has ``None``
    for every task. Forcing a re-import is painful. Instead we top up
    the field on demand — the first time any state-returning endpoint
    (manager session, voting state, start/next/skip) is hit for a
    session whose current task is a Jira task with no stored
    description, we fetch it from jira-service and persist it.

    Behaviour:
      * Caller may pass an already-loaded ``session`` to skip the read.
        The helper mutates that same instance in place so the caller's
        reference is up-to-date on return — important for the post-
        mutate paths (``start``/``next``/``skip``) that don't want to
        do a second ``get_session`` round-trip.
      * No-op when there is no current task, no ``jira_key``, the task
        already has a description, or the app is missing
        ``http_session``/``repository`` on state (test rigs).
      * Best-effort fetch via ``_fetch_jira_description`` — failures
        leave the task untouched, callers don't see an exception.
      * Single ``repo.save_session`` write per backfill — no fan-out.
      * O(1) on the warm path: once populated the function returns
        without doing any I/O, so it's safe to call from every state
        read.

    Returns ``True`` iff the description was actually filled in (so
    callers can decide whether to re-broadcast).
    """
    repo = getattr(request.app.state, "repository", None)
    http_session = getattr(request.app.state, "http_session", None)
    if repo is None or http_session is None:
        return False
    if session is None:
        try:
            if hasattr(repo, "get_session_async"):
                session = await repo.get_session_async(chat_id, topic_id)
            else:
                session = repo.get_session(chat_id, topic_id)
        except Exception:  # noqa: BLE001 — read failure is non-fatal here.
            return False
    task = session.current_task
    if task is None or not task.jira_key or task.description:
        return False
    description = await _fetch_jira_description(http_session, task.jira_key)
    if not description:
        return False
    task.description = description
    task.touch()
    try:
        await repo.save_session(session)
    except Exception:  # noqa: BLE001 — write failure is non-fatal here too.
        return False
    return True


async def _fetch_jira_description(
    http_session: aiohttp.ClientSession,
    issue_key: str,
) -> Optional[str]:
    """Best-effort fetch of the Jira issue body for a single key.

    Used at import time to populate ``Task.description`` so the voter UI
    can show the original spec inline. Failures are deliberately
    swallowed and surfaced as ``None`` — a missing description is a
    cosmetic loss, not an import-blocking error. The jira-service
    in-memory cache de-duplicates these calls across rapid re-imports.
    """
    key = (issue_key or "").strip().upper()
    if not key:
        return None
    base_url = os.getenv("JIRA_SERVICE_URL", "http://jira-service:8001").rstrip("/")
    timeout = aiohttp.ClientTimeout(
        total=int(os.getenv("JIRA_DESCRIPTION_FETCH_TIMEOUT_SECONDS", "10"))
    )
    url = f"{base_url}/api/v1/issue/{key}/context"
    try:
        async with http_session.get(url, timeout=timeout) as response:
            if response.status != 200:
                return None
            data = await response.json()
    except Exception:  # noqa: BLE001 — see docstring: missing description is non-fatal.
        return None
    if not isinstance(data, dict):
        return None
    raw = data.get("description")
    if not isinstance(raw, str):
        return None
    cleaned = raw.strip()
    return cleaned or None


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


# ---------------------------------------------------------------------------
# Task / mutation serialization
# ---------------------------------------------------------------------------


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
        "description": task.description,
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


# ---------------------------------------------------------------------------
# WebSocket / pub-sub broadcasting
# ---------------------------------------------------------------------------


async def _publish_state(request: Request, session: Session) -> None:
    """Broadcast a fresh session-state snapshot. Best-effort: never fail the
    caller.

    Mutations are already committed when we get here. If pub/sub is briefly
    unavailable, browser clients will catch up via the WebSocket initial
    state on the next reconnect or the next state-changing event.
    """
    redis_client = request.app.state.web_redis
    try:
        await redis_client.publish(
            _channel_name(session.chat_id, session.topic_id),
            json.dumps({"type": "session_state", "state": _build_web_session_state(session)}),
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "publish_state failed chat_id=%s topic_id=%s err=%r",
            session.chat_id,
            session.topic_id,
            exc,
        )
