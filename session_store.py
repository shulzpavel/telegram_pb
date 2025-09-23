"""Session storage and persistence utilities for Planning Poker bot."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

from config import UserRole


def _serialize_votes(votes: Dict[int, str]) -> Dict[str, str]:
    return {str(user_id): value for user_id, value in votes.items()}


def _deserialize_votes(data: Dict[str, str]) -> Dict[int, str]:
    return {int(user_id): value for user_id, value in data.items()}


def _serialize_task(task: Dict[str, Any]) -> Dict[str, Any]:
    serialized = dict(task)
    serialized["votes"] = _serialize_votes(task.get("votes", {}))
    return serialized


def _deserialize_task(payload: Dict[str, Any]) -> Dict[str, Any]:
    task = dict(payload)
    task["votes"] = _deserialize_votes(payload.get("votes", {}))
    return task


@dataclass
class SessionState:
    """State for a single chat/topic planning session."""

    chat_id: int
    topic_id: Optional[int]
    participants: Dict[int, Dict[str, Any]] = field(default_factory=dict)
    votes: Dict[int, str] = field(default_factory=dict)
    tasks_queue: List[Dict[str, Any]] = field(default_factory=list)
    pending_tasks: List[Dict[str, Any]] = field(default_factory=list)
    current_task_index: int = 0
    history: List[Dict[str, Any]] = field(default_factory=list)
    last_batch: List[Dict[str, Any]] = field(default_factory=list)
    batch_completed: bool = False
    active_vote_message_id: Optional[int] = None
    current_batch_id: Optional[str] = None
    current_batch_started_at: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "chat_id": self.chat_id,
            "topic_id": self.topic_id,
            "participants": {
                str(user_id): {
                    "name": data["name"],
                    "role": data["role"].value,
                }
                for user_id, data in self.participants.items()
            },
            "votes": _serialize_votes(self.votes),
            "tasks_queue": [_serialize_task(task) for task in self.tasks_queue],
            "pending_tasks": [dict(task) for task in self.pending_tasks],
            "current_task_index": self.current_task_index,
            "history": [_serialize_task(task) for task in self.history],
            "last_batch": [_serialize_task(task) for task in self.last_batch],
            "batch_completed": self.batch_completed,
            "active_vote_message_id": self.active_vote_message_id,
            "current_batch_id": self.current_batch_id,
            "current_batch_started_at": self.current_batch_started_at,
        }

    @classmethod
    def from_dict(cls, payload: Dict[str, Any]) -> "SessionState":
        chat_id = int(payload.get("chat_id"))
        topic_id_raw = payload.get("topic_id")
        topic_id = int(topic_id_raw) if topic_id_raw is not None else None

        participants: Dict[int, Dict[str, Any]] = {}
        for user_id_str, data in payload.get("participants", {}).items():
            try:
                user_id = int(user_id_str)
                participants[user_id] = {
                    "name": data.get("name", "Unknown"),
                    "role": UserRole(data.get("role", UserRole.PARTICIPANT.value)),
                }
            except (ValueError, KeyError):
                continue

        votes = _deserialize_votes(payload.get("votes", {}))

        tasks_queue = [_deserialize_task(task) for task in payload.get("tasks_queue", [])]
        pending_tasks = [dict(task) for task in payload.get("pending_tasks", [])]
        history = [_deserialize_task(task) for task in payload.get("history", [])]
        last_batch = [_deserialize_task(task) for task in payload.get("last_batch", [])]

        return cls(
            chat_id=chat_id,
            topic_id=topic_id,
            participants=participants,
            votes=votes,
            tasks_queue=tasks_queue,
            pending_tasks=pending_tasks,
            current_task_index=int(payload.get("current_task_index", 0)),
            history=history,
            last_batch=last_batch,
            batch_completed=bool(payload.get("batch_completed", False)),
            active_vote_message_id=payload.get("active_vote_message_id"),
            current_batch_id=payload.get("current_batch_id"),
            current_batch_started_at=payload.get("current_batch_started_at"),
        )

    def ensure_task_votes_initialized(self) -> None:
        """Guarantee that every task has a votes map."""
        for task in self.tasks_queue:
            task.setdefault("votes", {})
        for task in self.last_batch:
            task.setdefault("votes", {})
        for task in self.history:
            task.setdefault("votes", {})


class SessionStore:
    """Manages session state persistence across bot restarts."""

    def __init__(self, state_path: Path):
        self.state_path = state_path
        self._sessions: Dict[str, SessionState] = {}
        self._load()

    @staticmethod
    def _make_key(chat_id: int, topic_id: Optional[int]) -> str:
        topic_part = "none" if topic_id is None else str(topic_id)
        return f"{chat_id}:{topic_part}"

    def _load(self) -> None:
        if not self.state_path.exists():
            return

        try:
            with self.state_path.open("r", encoding="utf-8") as fh:
                payload = json.load(fh)
        except (OSError, json.JSONDecodeError):
            return

        if not isinstance(payload, list):
            return

        for item in payload:
            try:
                session = SessionState.from_dict(item)
            except Exception:
                continue
            session.ensure_task_votes_initialized()
            self._sessions[self._make_key(session.chat_id, session.topic_id)] = session

    def save(self) -> None:
        self.state_path.parent.mkdir(parents=True, exist_ok=True)
        data = [session.to_dict() for session in self._sessions.values()]
        with self.state_path.open("w", encoding="utf-8") as fh:
            json.dump(data, fh, ensure_ascii=False, indent=2)

    def get_session(self, chat_id: int, topic_id: Optional[int]) -> SessionState:
        key = self._make_key(chat_id, topic_id)
        session = self._sessions.get(key)
        if session is None:
            session = SessionState(chat_id=chat_id, topic_id=topic_id)
            self._sessions[key] = session
            self.save()
        session.ensure_task_votes_initialized()
        return session

    def save_session(self, session: SessionState) -> None:
        """Persist updated session state."""
        key = self._make_key(session.chat_id, session.topic_id)
        self._sessions[key] = session
        self.save()

    def delete_session(self, chat_id: int, topic_id: Optional[int]) -> None:
        key = self._make_key(chat_id, topic_id)
        if key in self._sessions:
            del self._sessions[key]
            self.save()
