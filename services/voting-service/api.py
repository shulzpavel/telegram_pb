"""Voting API endpoints."""

import sys
from pathlib import Path
from typing import List, Optional

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from app.domain.session import Session
from app.domain.task import Task
from app.ports.session_repository import SessionRepository
from services.voting_service.repository import get_repository

router = APIRouter()


class SessionResponse(BaseModel):
    """Session response model."""

    chat_id: int
    topic_id: Optional[int]
    participants: dict
    tasks_queue: List[dict]
    current_task_index: int
    history: List[dict]
    last_batch: List[dict]
    batch_completed: bool
    active_vote_message_id: Optional[int] = None
    current_batch_id: Optional[str] = None
    current_batch_started_at: Optional[str] = None


class GetSessionRequest(BaseModel):
    """Request to get session."""

    chat_id: int
    topic_id: Optional[int] = None


class SaveSessionRequest(BaseModel):
    """Request to save session."""

    session: dict  # Serialized session


class AddTasksRequest(BaseModel):
    """Request to add tasks."""

    chat_id: int
    topic_id: Optional[int] = None
    tasks: List[dict]  # List of task dicts


class CastVoteRequest(BaseModel):
    """Request to cast vote."""

    chat_id: int
    topic_id: Optional[int] = None
    user_id: int
    vote_value: str


class StartBatchRequest(BaseModel):
    """Request to start batch."""

    chat_id: int
    topic_id: Optional[int] = None


async def get_repo(request: Request) -> SessionRepository:
    """Dependency to get repository from app state."""
    return request.app.state.repository


@router.get("/session", response_model=SessionResponse)
async def get_session(
    chat_id: int,
    topic_id: Optional[int] = None,
    request: Request = None,
) -> SessionResponse:
    """Get session."""
    repo = request.app.state.repository
    
    # Try async method first, fallback to sync
    if hasattr(repo, "get_session_async"):
        session = await repo.get_session_async(chat_id, topic_id)
    else:
        session = repo.get_session(chat_id, topic_id)
    
    return SessionResponse(
        chat_id=session.chat_id,
        topic_id=session.topic_id,
        participants={str(k): v.to_dict() for k, v in session.participants.items()},
        tasks_queue=[t.to_dict() for t in session.tasks_queue],
        current_task_index=session.current_task_index,
        history=[t.to_dict() for t in session.history],
        last_batch=[t.to_dict() for t in session.last_batch],
        batch_completed=session.batch_completed,
        active_vote_message_id=session.active_vote_message_id,
        current_batch_id=session.current_batch_id,
        current_batch_started_at=session.current_batch_started_at,
    )


@router.post("/session")
async def save_session(
    request_data: SaveSessionRequest,
    request: Request = None,
) -> dict:
    """Save session."""
    repo = request.app.state.repository
    # Deserialize and save
    from app.domain.session import Session
    from app.domain.participant import Participant
    from app.domain.task import Task
    
    data = request_data.session
    session = Session(
        chat_id=data["chat_id"],
        topic_id=data.get("topic_id"),
        participants={
            int(uid): Participant.from_dict(int(uid), p_data)
            for uid, p_data in data.get("participants", {}).items()
        },
        tasks_queue=[Task.from_dict(t) for t in data.get("tasks_queue", [])],
        current_task_index=data.get("current_task_index", 0),
        history=[Task.from_dict(t) for t in data.get("history", [])],
        last_batch=[Task.from_dict(t) for t in data.get("last_batch", [])],
        batch_completed=data.get("batch_completed", False),
        active_vote_message_id=data.get("active_vote_message_id"),
        current_batch_id=data.get("current_batch_id"),
        current_batch_started_at=data.get("current_batch_started_at"),
    )
    
    if hasattr(repo, "save_session_async"):
        await repo.save_session_async(session)
    else:
        repo.save_session(session)
    
    return {"success": True}


@router.post("/tasks/add")
async def add_tasks(
    request: AddTasksRequest,
    request_obj: Request = None,
) -> dict:
    """Add tasks to session."""
    repo = request_obj.app.state.repository
    
    # Get session
    if hasattr(repo, "get_session_async"):
        session = await repo.get_session_async(request.chat_id, request.topic_id)
    else:
        session = repo.get_session(request.chat_id, request.topic_id)
    
    # Add tasks (антидубль по jira_key)
    from app.domain.task import Task
    existing_keys = {t.jira_key for t in session.tasks_queue if t.jira_key}
    existing_keys |= {t.jira_key for t in session.last_batch if t.jira_key}
    existing_keys |= {t.jira_key for t in session.history if t.jira_key}
    added_count = 0
    for task_data in request.tasks:
        task = Task.from_dict(task_data)
        if task.jira_key and task.jira_key in existing_keys:
            continue
        if task.jira_key:
            existing_keys.add(task.jira_key)
        session.tasks_queue.append(task)
        added_count += 1
    
    # Save session
    if hasattr(repo, "save_session_async"):
        await repo.save_session_async(session)
    else:
        repo.save_session(session)
    
    return {"success": True, "added": added_count}


@router.post("/vote")
async def cast_vote(
    request: CastVoteRequest,
    request_obj: Request = None,
) -> dict:
    """Cast vote."""
    repo = request_obj.app.state.repository
    
    # Get session
    if hasattr(repo, "get_session_async"):
        session = await repo.get_session_async(request.chat_id, request.topic_id)
    else:
        session = repo.get_session(request.chat_id, request.topic_id)
    
    # Cast vote
    if not session.current_task:
        return {"success": False, "error": "No current task"}
    
    if not session.can_vote(request.user_id):
        return {"success": False, "error": "Cannot vote"}
    
    session.current_task.votes[request.user_id] = request.vote_value
    
    # Save session
    if hasattr(repo, "save_session_async"):
        await repo.save_session_async(session)
    else:
        repo.save_session(session)
    
    return {"success": True}


@router.post("/batch/start")
async def start_batch(
    request: StartBatchRequest,
    request_obj: Request = None,
) -> dict:
    """Start voting batch."""
    from datetime import datetime
    
    repo = request_obj.app.state.repository
    
    # Get session
    if hasattr(repo, "get_session_async"):
        session = await repo.get_session_async(request.chat_id, request.topic_id)
    else:
        session = repo.get_session(request.chat_id, request.topic_id)
    
    if not session.tasks_queue:
        return {"success": False, "error": "No tasks in queue"}
    
    # Start batch
    session.current_task_index = 0
    session.batch_completed = False
    session.current_batch_started_at = datetime.utcnow().isoformat()
    if session.current_task:
        session.current_task.votes.clear()
    
    # Save session
    if hasattr(repo, "save_session_async"):
        await repo.save_session_async(session)
    else:
        repo.save_session(session)
    
    return {"success": True}


@router.post("/batch/finish")
async def finish_batch(
    request: StartBatchRequest,
    request_obj: Request = None,
) -> dict:
    """Finish voting batch."""
    from datetime import datetime
    
    repo = request_obj.app.state.repository
    
    # Get session
    if hasattr(repo, "get_session_async"):
        session = await repo.get_session_async(request.chat_id, request.topic_id)
    else:
        session = repo.get_session(request.chat_id, request.topic_id)
    
    if session.batch_completed:
        return {"success": False, "error": "Batch already completed"}
    
    # Finish batch
    completed_tasks = []
    finished_at = datetime.utcnow().isoformat()
    
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
    
    # Save session
    if hasattr(repo, "save_session_async"):
        await repo.save_session_async(session)
    else:
        repo.save_session(session)
    
    return {
        "success": True,
        "completed_tasks": [t.to_dict() for t in completed_tasks],
    }
