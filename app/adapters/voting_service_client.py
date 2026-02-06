"""HTTP client adapter for Voting Service microservice."""

import os
from typing import Optional

import aiohttp

from app.domain.session import Session
from app.ports.session_repository import SessionRepository


class VotingServiceHttpClient(SessionRepository):
    """HTTP client for Voting Service microservice."""

    def __init__(self, base_url: str = None, timeout: int = 30):
        self.base_url = base_url or os.getenv("VOTING_SERVICE_URL", "http://localhost:8002")
        self._session: Optional[aiohttp.ClientSession] = None
        self._timeout = aiohttp.ClientTimeout(total=timeout)

    async def _get_session(self) -> aiohttp.ClientSession:
        """Get or create aiohttp session."""
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(timeout=self._timeout)
        return self._session

    async def close(self) -> None:
        """Close aiohttp session."""
        if self._session and not self._session.closed:
            await self._session.close()

    async def get_session(self, chat_id: int, topic_id: Optional[int]) -> Session:
        """Get or create session via Voting Service."""
        session_client = await self._get_session()
        url = f"{self.base_url}/api/v1/session"
        
        params = {"chat_id": chat_id}
        if topic_id is not None:
            params["topic_id"] = topic_id
        
        try:
            async with session_client.get(url, params=params) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    return self._deserialize_session(data, chat_id, topic_id)
                elif resp.status == 404:
                    # Create new session
                    new_session = Session(chat_id=chat_id, topic_id=topic_id)
                    await self.save_session(new_session)
                    return new_session
                else:
                    raise RuntimeError(f"Voting Service returned status {resp.status}")
        except aiohttp.ClientError as e:
            raise RuntimeError(f"Voting Service unavailable: {e}") from e
        except Exception as e:
            raise RuntimeError(f"Failed to get session from Voting Service: {e}") from e

    async def save_session(self, session: Session) -> None:
        """Save session via Voting Service."""
        session_client = await self._get_session()
        url = f"{self.base_url}/api/v1/session"
        
        data = {
            "session": self._serialize_session(session),
        }
        
        try:
            async with session_client.post(url, json=data) as resp:
                if resp.status not in (200, 201):
                    raise RuntimeError(f"Voting Service returned status {resp.status}")
        except aiohttp.ClientError as e:
            raise RuntimeError(f"Voting Service unavailable: {e}") from e
        except Exception as e:
            raise RuntimeError(f"Failed to save session to Voting Service: {e}") from e

    async def delete_session(self, chat_id: int, topic_id: Optional[int]) -> None:
        """Delete session via Voting Service."""
        session_client = await self._get_session()
        url = f"{self.base_url}/api/v1/session"
        
        params = {"chat_id": chat_id}
        if topic_id is not None:
            params["topic_id"] = topic_id
        
        try:
            async with session_client.delete(url, params=params) as resp:
                if resp.status not in (200, 204):
                    raise RuntimeError(f"Voting Service returned status {resp.status}")
        except aiohttp.ClientError as e:
            raise RuntimeError(f"Voting Service unavailable: {e}") from e
        except Exception as e:
            raise RuntimeError(f"Failed to delete session from Voting Service: {e}") from e

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
        from app.domain.participant import Participant
        from app.domain.task import Task
        
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
