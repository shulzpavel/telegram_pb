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

from services.voting_service.ws_manager import redis_pubsub_listener

logger = logging.getLogger(__name__)

web_router = APIRouter()

WEB_TOKEN_TTL = 8 * 3600  # 8 hours in seconds
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")


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

    # Participants: show name + voted status
    participants = []
    if task:
        voted_ids = set(task.votes.keys())
        for uid, p in session.participants.items():
            if session.can_vote(uid):
                participants.append({"name": p.name, "voted": uid in voted_ids})
    else:
        for uid, p in session.participants.items():
            if session.can_vote(uid):
                participants.append({"name": p.name, "voted": False})

    # Results only when phase == results
    results = None
    if phase == "results" and task:
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


async def _mutate_session(repo, chat_id: int, topic_id: Optional[int], mutator):
    if hasattr(repo, "mutate_session"):
        return await repo.mutate_session(chat_id, topic_id, mutator)
    if hasattr(repo, "get_session_async"):
        session = await repo.get_session_async(chat_id, topic_id)
    else:
        session = repo.get_session(chat_id, topic_id)
    result = mutator(session)
    if hasattr(repo, "save_session_async"):
        await repo.save_session_async(session)
    else:
        repo.save_session(session)
    return session, result


# ---------------------------------------------------------------------------
# REST endpoints
# ---------------------------------------------------------------------------

@web_router.post("/web/token", response_model=WebTokenResponse)
async def create_web_token(body: WebTokenRequest, request: Request) -> WebTokenResponse:
    """Generate a short-lived web token for a session."""
    redis_client = await _get_redis(request)
    token = str(uuid.uuid4())
    payload = json.dumps({"chat_id": body.chat_id, "topic_id": body.topic_id})
    await redis_client.setex(f"web:{token}", WEB_TOKEN_TTL, payload)

    cms_store = _get_cms_store(request)
    if cms_store:
        await cms_store.record_web_token(token, body.chat_id, body.topic_id, WEB_TOKEN_TTL)

    return WebTokenResponse(token=token, url=f"/s/{token}")


@web_router.post("/web/join")
async def web_join(body: WebJoinRequest, request: Request) -> dict:
    """Join a web voting session by name."""
    redis_client = await _get_redis(request)
    info = await _resolve_token(redis_client, body.token)
    chat_id: int = info["chat_id"]
    topic_id: Optional[int] = info["topic_id"]

    participant_id = str(uuid.uuid4())
    user_id = _stable_user_id(participant_id)

    # Persist web participant metadata in Redis
    p_key = f"web_participant:{body.token}:{participant_id}"
    await redis_client.setex(
        p_key,
        WEB_TOKEN_TTL,
        json.dumps({"name": body.name, "user_id": user_id, "role": body.role}),
    )

    cms_store = _get_cms_store(request)
    if cms_store:
        await cms_store.record_web_participant(
            body.token,
            participant_id,
            user_id,
            body.name,
            body.role,
            chat_id,
            topic_id,
            WEB_TOKEN_TTL,
        )

    repo = request.app.state.repository
    added = False

    def mutate(session):
        nonlocal added
        from app.domain.participant import Participant
        from config import UserRole

        if user_id not in session.participants:
            session.participants[user_id] = Participant(
                user_id=user_id,
                name=body.name,
                role=UserRole.PARTICIPANT,
            )
            added = True
        return None

    session, _ = await _mutate_session(repo, chat_id, topic_id, mutate)

    if added:
        channel = _channel_name(chat_id, topic_id)
        state = _build_web_session_state(session)
        await redis_client.publish(channel, json.dumps({"type": "session_state", "state": state}))

    state = _build_web_session_state(session)
    return {"participant_id": participant_id, "session": state}


@web_router.get("/web/state/{token}")
async def web_state(token: str, request: Request) -> dict:
    """Get current web session state."""
    redis_client = await _get_redis(request)
    info = await _resolve_token(redis_client, token)
    chat_id: int = info["chat_id"]
    topic_id: Optional[int] = info["topic_id"]

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
    info = await _resolve_token(redis_client, body.token)
    chat_id: int = info["chat_id"]
    topic_id: Optional[int] = info["topic_id"]

    # Verify participant exists
    p_key = f"web_participant:{body.token}:{body.participant_id}"
    p_data = await redis_client.get(p_key)
    if not p_data:
        raise HTTPException(status_code=403, detail="Participant not found or session expired")

    user_id = json.loads(p_data)["user_id"]

    repo = request.app.state.repository

    def mutate(session):
        if not session.current_task:
            raise HTTPException(status_code=400, detail="No active task")
        if not session.can_vote(user_id):
            raise HTTPException(status_code=403, detail="Not authorized to vote")
        session.current_task.votes[user_id] = body.value
        return None

    session, _ = await _mutate_session(repo, chat_id, topic_id, mutate)

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
                "index": session.current_task_index + 1,
                "total": len(session.tasks_queue),
            },
        })
    else:
        payload = json.dumps({
            "type": "vote_cast",
            "voter_name": voter_name,
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
        redis_pubsub_listener(REDIS_URL, token, channel, websocket)
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
