"""Redis adapter for session repository."""

import json
from pathlib import Path
from typing import Optional

import redis.asyncio as redis

import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from app.domain.participant import Participant
from app.domain.session import Session
from app.domain.task import Task
from app.ports.session_repository import SessionRepository


class RedisSessionRepository(SessionRepository):
    """Redis implementation of session repository."""

    def __init__(self, redis_url: str):
        self.redis_url = redis_url
        self._client: Optional[redis.Redis] = None

    async def _get_client(self) -> redis.Redis:
        """Get or create Redis client."""
        if self._client is None:
            self._client = await redis.from_url(self.redis_url, decode_responses=True)
        return self._client

    def _make_key(self, chat_id: int, topic_id: Optional[int]) -> str:
        """Make Redis key for session."""
        topic_part = "none" if topic_id is None else str(topic_id)
        return f"session:{chat_id}:{topic_part}"

    def get_session(self, chat_id: int, topic_id: Optional[int]) -> Session:
        """Get or create session (sync for compatibility)."""
        # Note: Redis operations are async, but interface is sync
        # This is a limitation - in real implementation, repository should be async
        # For now, we'll use sync Redis client or make this async
        raise NotImplementedError("Redis repository requires async interface")

    async def get_session_async(self, chat_id: int, topic_id: Optional[int]) -> Session:
        """Get or create session (async)."""
        client = await self._get_client()
        key = self._make_key(chat_id, topic_id)
        
        data = await client.get(key)
        if data:
            return self._deserialize_session(json.loads(data), chat_id, topic_id)
        
        # Create new session
        session = Session(chat_id=chat_id, topic_id=topic_id)
        await self.save_session_async(session)
        return session

    def save_session(self, session: Session) -> None:
        """Save session (sync for compatibility)."""
        raise NotImplementedError("Redis repository requires async interface")

    async def save_session_async(self, session: Session) -> None:
        """Save session (async)."""
        client = await self._get_client()
        key = self._make_key(session.chat_id, session.topic_id)
        data = self._serialize_session(session)
        await client.set(key, json.dumps(data))

    def delete_session(self, chat_id: int, topic_id: Optional[int]) -> None:
        """Delete session (sync for compatibility)."""
        raise NotImplementedError("Redis repository requires async interface")

    async def delete_session_async(self, chat_id: int, topic_id: Optional[int]) -> None:
        """Delete session (async)."""
        client = await self._get_client()
        key = self._make_key(chat_id, topic_id)
        await client.delete(key)

    def _serialize_session(self, session: Session) -> dict:
        """Serialize session to dict."""
        return {
            "chat_id": session.chat_id,
            "topic_id": session.topic_id,
            "participants": {
                str(uid): p.to_dict() for uid, p in session.participants.items()
            },
            "tasks_queue": [task.to_dict() for task in session.tasks_queue],
            "current_task_index": session.current_task_index,
            "history": [task.to_dict() for task in session.history],
            "last_batch": [task.to_dict() for task in session.last_batch],
            "batch_completed": session.batch_completed,
            "active_vote_message_id": session.active_vote_message_id,
            "current_batch_id": session.current_batch_id,
            "current_batch_started_at": session.current_batch_started_at,
        }

    def _deserialize_session(self, data: dict, chat_id: int, topic_id: Optional[int]) -> Session:
        """Deserialize session from dict."""
        participants = {
            int(uid): Participant.from_dict(int(uid), p_data)
            for uid, p_data in data.get("participants", {}).items()
        }
        
        tasks_queue = [Task.from_dict(task_data) for task_data in data.get("tasks_queue", [])]
        history = [Task.from_dict(task_data) for task_data in data.get("history", [])]
        last_batch = [Task.from_dict(task_data) for task_data in data.get("last_batch", [])]
        
        return Session(
            chat_id=chat_id,
            topic_id=topic_id,
            participants=participants,
            tasks_queue=tasks_queue,
            current_task_index=data.get("current_task_index", 0),
            history=history,
            last_batch=last_batch,
            batch_completed=data.get("batch_completed", False),
            active_vote_message_id=data.get("active_vote_message_id"),
            current_batch_id=data.get("current_batch_id"),
            current_batch_started_at=data.get("current_batch_started_at"),
        )

    async def close(self) -> None:
        """Close Redis connection."""
        if self._client:
            await self._client.close()
