"""Web UI API endpoints for Planning Poker voting."""

import asyncio
import hashlib
import json
import logging
import os
import uuid
from typing import Optional

import redis.asyncio as aioredis
from fastapi import APIRouter, HTTPException, Request, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from app.usecases.web_join import JoinWebSessionUseCase
from app.usecases.web_vote import WebVoteError, WebVoteUseCase
# NOTE: ``_ensure_current_task_description`` is imported lazily inside the
# endpoints below to avoid the circular import between ``_http_shared``
# (which already imports ``_build_web_session_state`` / ``_channel_name``
# from this module for pub/sub broadcasts) and ``web_api``.
from services.voting_service.participant_identity import (
    stable_user_id_from_email,
    validate_participant_email,
    validate_participant_role,
)
from services.voting_service.rate_limit import client_ip, enforce_rate_limit
from services.voting_service.ws_manager import redis_pubsub_listener

logger = logging.getLogger(__name__)

web_router = APIRouter()

WEB_TOKEN_TTL = 8 * 3600  # 8 hours in seconds
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")

# Public-facing rate limits. Defaults chosen so a real user with a slightly
# trigger-happy client never hits them, while bulk replay / abuse is shut
# off well before it can shape Redis or downstream pub/sub.
WEB_TOKEN_RATE_LIMIT_MAX = int(os.getenv("WEB_TOKEN_RATE_LIMIT_MAX", "10"))
WEB_TOKEN_RATE_LIMIT_WINDOW_SECONDS = int(os.getenv("WEB_TOKEN_RATE_LIMIT_WINDOW_SECONDS", "60"))
WEB_JOIN_RATE_LIMIT_MAX = int(os.getenv("WEB_JOIN_RATE_LIMIT_MAX", "30"))
WEB_JOIN_RATE_LIMIT_WINDOW_SECONDS = int(os.getenv("WEB_JOIN_RATE_LIMIT_WINDOW_SECONDS", "60"))
WEB_VOTE_RATE_LIMIT_MAX = int(os.getenv("WEB_VOTE_RATE_LIMIT_MAX", "30"))
WEB_VOTE_RATE_LIMIT_WINDOW_SECONDS = int(os.getenv("WEB_VOTE_RATE_LIMIT_WINDOW_SECONDS", "60"))


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class WebTokenResponse(BaseModel):
    token: str
    url: str


class WebTokenRequest(BaseModel):
    chat_id: int
    topic_id: Optional[int] = None


class WebJoinRequest(BaseModel):
    token: str
    name: str
    role: str = "backend"  # backend | frontend | qa | manager


class WebVoteRequest(BaseModel):
    token: str
    participant_id: str
    value: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _channel_name(chat_id: int, topic_id: Optional[int]) -> str:
    suffix = "none" if topic_id is None else str(topic_id)
    return f"session_events:{chat_id}:{suffix}"


def _stable_user_id(participant_id: str) -> int:
    """Map a UUID participant_id to a stable integer user_id (negative range to avoid collisions)."""
    digest = hashlib.sha256(participant_id.encode("utf-8")).digest()
    value = int.from_bytes(digest[:8], "big") & ((1 << 63) - 1)
    return -(value + 1)


async def _get_redis(request: Request) -> aioredis.Redis:
    return request.app.state.web_redis


def _get_cms_store(request: Request):
    return getattr(request.app.state, "cms_store", None)


async def _resolve_token(redis_client: aioredis.Redis, token: str) -> dict:
    data = await redis_client.get(f"web:{token}")
    if not data:
        raise HTTPException(status_code=404, detail="Session token not found or expired")
    return json.loads(data)


async def _get_web_session_state(
    token: str,
    chat_id: int,
    topic_id: Optional[int],
    repo,
    redis_client: aioredis.Redis,
) -> dict:
    """Build WebSessionState dict for the browser."""
    if hasattr(repo, "get_session_async"):
        session = await repo.get_session_async(chat_id, topic_id)
    else:
        session = repo.get_session(chat_id, topic_id)

    return _build_web_session_state(session)


def _build_web_session_state(session) -> dict:
    """Build WebSessionState dict from an already loaded session."""
    task = session.current_task
    task_info = None
    if task:
        task_info = {
            "task_id": task.task_id,
            "text": task.text,
            "jira_key": task.jira_key,
            "story_points": task.story_points,
            "ai_summary": task.ai_summary,
            # Captured at Jira import time. Voter UI prefers
            # ``description_adf`` (rich Jira formatting) and falls back
            # to ``description`` (plain text). Both are ``None`` for
            # manual tasks or when the import-time fetch failed.
            "description": task.description,
            "description_adf": task.description_adf,
            "description_html": task.description_html,
            "index": session.current_task_index + 1,
            "total": len(session.tasks_queue),
        }

    # Determine phase
    if session.batch_completed:
        phase = "complete"
    elif task and session.current_batch_started_at:
        voted_ids = set(task.votes.keys()) if task else set()
        voter_ids = {uid for uid, p in session.participants.items() if session.can_vote(uid)}
        if session.revealed_task_id == task.task_id:
            phase = "results"
        elif voter_ids and voted_ids >= voter_ids:
            phase = "results"
        else:
            phase = "voting"
    else:
        phase = "waiting"

    # Participants: name + voted bool + (NEW) live vote value.
    #
    # Previously voters only saw who had/hadn't voted — actual values were
    # hidden until the manager pressed Reveal. Product decision: kill the
    # Reveal stage entirely and show live values to everyone, manager and
    # voter alike. `value` is `None` for participants who haven't voted yet
    # and `phase` still flips to "results" once everyone has voted so the
    # FinalEstimate UI lights up, but the votes themselves are no longer
    # gated.
    participants = []
    if task:
        voted_ids = set(task.votes.keys())
        for uid, p in session.participants.items():
            if session.can_vote(uid):
                participants.append({
                    "name": p.name,
                    "voted": uid in voted_ids,
                    "value": task.votes.get(uid) if uid in voted_ids else None,
                })
    else:
        for uid, p in session.participants.items():
            if session.can_vote(uid):
                participants.append({"name": p.name, "voted": False, "value": None})

    # Results: always include the per-name vote breakdown when there's an
    # active task. Frontend used to only render this in `phase == results`,
    # but since votes are live now we expose them as soon as they arrive.
    # The `phase` field still drives FinalEstimate visibility.
    results = None
    if task:
        results = [
            {"name": session.participants[uid].name, "value": val}
            for uid, val in task.votes.items()
            if uid in session.participants
        ]

    return {
        "task": task_info,
        "phase": phase,
        "participants": participants,
        "results": results,
    }


# ---------------------------------------------------------------------------
# REST endpoints
# ---------------------------------------------------------------------------

@web_router.post("/web/token", response_model=WebTokenResponse)
async def create_web_token(body: WebTokenRequest, request: Request) -> WebTokenResponse:
    """Generate a short-lived web token for a session.

    Anyone with the chat_id of an existing session can mint an invite URL,
    so rate-limiting by source IP keeps a casual attacker from filling
    Redis with throwaway ``web:<token>`` keys.
    """
    redis_client = await _get_redis(request)
    await enforce_rate_limit(
        redis_client,
        key=f"rl:web_token:ip:{client_ip(request)}",
        limit=WEB_TOKEN_RATE_LIMIT_MAX,
        window_seconds=WEB_TOKEN_RATE_LIMIT_WINDOW_SECONDS,
        error_detail="Too many web token requests",
    )
    token = str(uuid.uuid4())
    payload = json.dumps({"chat_id": body.chat_id, "topic_id": body.topic_id})
    await redis_client.setex(f"web:{token}", WEB_TOKEN_TTL, payload)

    cms_store = _get_cms_store(request)
    if cms_store:
        await cms_store.record_web_token(token, body.chat_id, body.topic_id, WEB_TOKEN_TTL)

    return WebTokenResponse(token=token, url=f"/s/{token}")


@web_router.post("/web/join")
async def web_join(body: WebJoinRequest, request: Request) -> dict:
    """Join a web voting session with corporate email and team role."""
    try:
        display_name = validate_participant_email(body.name)
        team_role = validate_participant_role(body.role)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    redis_client = await _get_redis(request)
    await enforce_rate_limit(
        redis_client,
        key=f"rl:web_join:ip:{client_ip(request)}",
        limit=WEB_JOIN_RATE_LIMIT_MAX,
        window_seconds=WEB_JOIN_RATE_LIMIT_WINDOW_SECONDS,
        error_detail="Too many join attempts",
    )
    info = await _resolve_token(redis_client, body.token)
    chat_id: int = info["chat_id"]
    topic_id: Optional[int] = info["topic_id"]

    participant_id = str(uuid.uuid4())
    user_id = stable_user_id_from_email(display_name)

    # Persist web participant metadata in Redis
    p_key = f"web_participant:{body.token}:{participant_id}"
    await redis_client.setex(
        p_key,
        WEB_TOKEN_TTL,
        json.dumps({"name": display_name, "user_id": user_id, "role": team_role}),
    )

    cms_store = _get_cms_store(request)
    if cms_store:
        await cms_store.record_web_participant(
            body.token,
            participant_id,
            user_id,
            display_name,
            team_role,
            chat_id,
            topic_id,
            WEB_TOKEN_TTL,
        )

    use_case = JoinWebSessionUseCase(request.app.state.repository)
    result = await use_case.execute(chat_id, topic_id, user_id, display_name)

    # Backfill the current task's Jira description on first join so the
    # voter sees the spec immediately. Helper mutates ``result.session``
    # in place when it succeeds, so we don't need to re-read from repo
    # for the broadcast / return payload. Best-effort; warm path is a
    # no-op. Lazy import — see module-top NOTE about the import cycle.
    from services.voting_service._http_shared import _ensure_current_task_description
    await _ensure_current_task_description(
        request, chat_id, topic_id, session=result.session,
    )

    if result.added:
        channel = _channel_name(chat_id, topic_id)
        state = _build_web_session_state(result.session)
        await redis_client.publish(channel, json.dumps({"type": "session_state", "state": state}))

    state = _build_web_session_state(result.session)
    return {"participant_id": participant_id, "session": state}


@web_router.get("/web/state/{token}")
async def web_state(token: str, request: Request) -> dict:
    """Get current web session state."""
    redis_client = await _get_redis(request)
    info = await _resolve_token(redis_client, token)
    chat_id: int = info["chat_id"]
    topic_id: Optional[int] = info["topic_id"]

    # Backfill Jira description for the current task if it wasn't
    # captured at import time. See the helper docstring; no-op once
    # the field is populated, so safe to call on every read. Lazy
    # import — see module-top NOTE about the import cycle.
    from services.voting_service._http_shared import _ensure_current_task_description
    await _ensure_current_task_description(request, chat_id, topic_id)

    repo = request.app.state.repository
    state = await _get_web_session_state(token, chat_id, topic_id, repo, redis_client)
    return state


@web_router.post("/web/vote")
async def web_vote(body: WebVoteRequest, request: Request) -> dict:
    """Cast a vote from the web UI."""
    from app.constants import VALID_VOTE_VALUES

    if body.value not in VALID_VOTE_VALUES:
        raise HTTPException(status_code=400, detail="Invalid vote value")

    redis_client = await _get_redis(request)
    await enforce_rate_limit(
        redis_client,
        key=f"rl:web_vote:participant:{body.participant_id}",
        limit=WEB_VOTE_RATE_LIMIT_MAX,
        window_seconds=WEB_VOTE_RATE_LIMIT_WINDOW_SECONDS,
        error_detail="Too many vote attempts",
    )
    info = await _resolve_token(redis_client, body.token)
    chat_id: int = info["chat_id"]
    topic_id: Optional[int] = info["topic_id"]

    # Verify participant exists
    p_key = f"web_participant:{body.token}:{body.participant_id}"
    p_data = await redis_client.get(p_key)
    if not p_data:
        raise HTTPException(status_code=403, detail="Participant not found or session expired")

    user_id = json.loads(p_data)["user_id"]

    use_case = WebVoteUseCase(request.app.state.repository)
    try:
        session = await use_case.execute(chat_id, topic_id, user_id, body.value)
    except WebVoteError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    # Build and publish state update
    task = session.current_task
    voted_ids = set(task.votes.keys())
    voter_ids = {uid for uid in session.participants if session.can_vote(uid)}
    voted_count = len(voted_ids & voter_ids)
    total_voters = len(voter_ids)

    channel = _channel_name(chat_id, topic_id)

    voter_name = session.participants[user_id].name if user_id in session.participants else "Unknown"

    if voted_count >= total_voters and total_voters > 0:
        # All voted — publish full results
        results = [
            {"name": session.participants[uid].name, "value": val}
            for uid, val in task.votes.items()
            if uid in session.participants
        ]
        payload = json.dumps({
            "type": "results",
            "votes": results,
            "task": {
                "task_id": task.task_id,
                "text": task.text,
                "jira_key": task.jira_key,
                "story_points": task.story_points,
                "ai_summary": task.ai_summary,
                "description": task.description,
                "description_adf": task.description_adf,
                "description_html": task.description_html,
                "index": session.current_task_index + 1,
                "total": len(session.tasks_queue),
            },
        })
    else:
        # Live-votes mode: broadcast the actual value too, not just "x voted".
        # Was previously gated behind manager Reveal — see the Reveal removal
        # cleanup in this commit.
        payload = json.dumps({
            "type": "vote_cast",
            "voter_name": voter_name,
            "voter_value": body.value,
            "voted_count": voted_count,
            "total_voters": total_voters,
        })

    # Best-effort: vote was already persisted; do not surface pub/sub errors.
    try:
        await redis_client.publish(channel, payload)
    except Exception as exc:  # noqa: BLE001
        logger.warning("web_vote publish failed chat=%s topic=%s err=%r", chat_id, topic_id, exc)

    return {"success": True}


# ---------------------------------------------------------------------------
# WebSocket endpoint
# ---------------------------------------------------------------------------

@web_router.websocket("/ws/{token}")
async def websocket_endpoint(websocket: WebSocket, token: str) -> None:
    """WebSocket endpoint for real-time session updates."""
    app_state = websocket.scope["app"].state
    redis_client = app_state.web_redis

    token_data = await redis_client.get(f"web:{token}")
    if not token_data:
        await websocket.close(code=4004)
        return

    info = json.loads(token_data)
    chat_id: int = info["chat_id"]
    topic_id: Optional[int] = info["topic_id"]

    await websocket.accept()

    # Send initial state
    try:
        repo = app_state.repository
        state = await _get_web_session_state(token, chat_id, topic_id, repo, redis_client)
        await websocket.send_text(json.dumps({"type": "session_state", "state": state}))
    except Exception as exc:
        logger.warning("Failed to send initial state: %s", exc)
        await websocket.close()
        return

    channel = _channel_name(chat_id, topic_id)

    # Run pub/sub listener and a receive task concurrently; exit when either finishes
    listen_task = asyncio.create_task(
        redis_pubsub_listener(redis_client, token, channel, websocket)
    )

    try:
        # Keep alive: consume any client messages (ping / close frames)
        while True:
            try:
                await asyncio.wait_for(websocket.receive(), timeout=30)
            except asyncio.TimeoutError:
                # Send ping to keep connection alive
                try:
                    await websocket.send_text(json.dumps({"type": "ping"}))
                except Exception:
                    break
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.debug("WS receive error: %s", exc)
    finally:
        listen_task.cancel()
        try:
            await listen_task
        except (asyncio.CancelledError, Exception):
            pass
