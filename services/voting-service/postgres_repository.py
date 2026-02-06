"""Postgres adapter for session repository."""

import json
from typing import Optional

import asyncpg

import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from app.domain.participant import Participant
from app.domain.session import Session
from app.domain.task import Task
from app.ports.session_repository import SessionRepository


class PostgresSessionRepository(SessionRepository):
    """Postgres implementation of session repository."""

    def __init__(self, pool: asyncpg.Pool):
        self.pool = pool

    @classmethod
    async def create(cls, dsn: str) -> "PostgresSessionRepository":
        """Create repository with connection pool."""
        pool = await asyncpg.create_pool(dsn)
        repo = cls(pool)
        await repo._ensure_schema()
        return repo

    async def _ensure_schema(self) -> None:
        """Ensure database schema exists."""
        async with self.pool.acquire() as conn:
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS sessions (
                    chat_id BIGINT NOT NULL,
                    topic_id BIGINT,
                    data JSONB NOT NULL,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    PRIMARY KEY (chat_id, topic_id)
                );
                CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON sessions(updated_at DESC);
            """)

    def _make_key(self, chat_id: int, topic_id: Optional[int]) -> tuple:
        """Make key for session."""
        return (chat_id, topic_id)

    def get_session(self, chat_id: int, topic_id: Optional[int]) -> Session:
        """Get or create session (sync for compatibility)."""
        raise NotImplementedError("Postgres repository requires async interface")

    async def get_session_async(self, chat_id: int, topic_id: Optional[int]) -> Session:
        """Get or create session (async)."""
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT data FROM sessions WHERE chat_id = $1 AND topic_id = $2",
                chat_id,
                topic_id,
            )
            
            if row:
                data = row["data"]
                return self._deserialize_session(data, chat_id, topic_id)
            
            # Create new session
            session = Session(chat_id=chat_id, topic_id=topic_id)
            await self.save_session_async(session)
            return session

    def save_session(self, session: Session) -> None:
        """Save session (sync for compatibility)."""
        raise NotImplementedError("Postgres repository requires async interface")

    async def save_session_async(self, session: Session) -> None:
        """Save session (async)."""
        data = self._serialize_session(session)
        async with self.pool.acquire() as conn:
            await conn.execute("""
                INSERT INTO sessions (chat_id, topic_id, data, updated_at)
                VALUES ($1, $2, $3, NOW())
                ON CONFLICT (chat_id, topic_id)
                DO UPDATE SET data = $3, updated_at = NOW()
            """, session.chat_id, session.topic_id, json.dumps(data))

    def delete_session(self, chat_id: int, topic_id: Optional[int]) -> None:
        """Delete session (sync for compatibility)."""
        raise NotImplementedError("Postgres repository requires async interface")

    async def delete_session_async(self, chat_id: int, topic_id: Optional[int]) -> None:
        """Delete session (async)."""
        async with self.pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM sessions WHERE chat_id = $1 AND topic_id = $2",
                chat_id,
                topic_id,
            )

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
        """Close connection pool."""
        await self.pool.close()
