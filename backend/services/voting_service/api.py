"""Voting API endpoints."""

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from app.domain.session import Session, SessionFactory
from app.domain.task import Task
from app.ports.session_repository import SessionRepository
from services.voting_service.repository import get_repository
from services.voting_service.session_helpers import get_repo_session, mutate_repo_session

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
    revealed_task_id: Optional[str] = None
    tasks_version: int = 0


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

    session = await get_repo_session(repo, chat_id, topic_id)

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
        revealed_task_id=session.revealed_task_id,
        tasks_version=session.tasks_version,
    )


@router.post("/session")
async def save_session(
    request_data: SaveSessionRequest,
    request: Request = None,
) -> dict:
    """Save session."""
    repo = request.app.state.repository
    session = SessionFactory.from_dict(request_data.session)

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

    def mutate(session: Session) -> int:
        existing_keys = {t.jira_key for t in session.tasks_queue if t.jira_key}
        existing_keys |= {t.jira_key for t in session.last_batch if t.jira_key}
        existing_keys |= {t.jira_key for t in session.history if t.jira_key}
        added_count = 0
        for index, task_data in enumerate(request.tasks):
            task = Task.from_dict(task_data, legacy_context=f"{session.chat_id}:{session.topic_id}:api_add:{index}")
            if task.jira_key and task.jira_key in existing_keys:
                continue
            if task.jira_key:
                existing_keys.add(task.jira_key)
            session.tasks_queue.append(task)
            added_count += 1
        if added_count:
            session.batch_completed = False
            session.bump_tasks_version()
        return added_count

    _, added_count = await mutate_repo_session(repo, request.chat_id, request.topic_id, mutate)

    return {"success": True, "added": added_count}


@router.post("/vote")
async def cast_vote(
    request: CastVoteRequest,
    request_obj: Request = None,
) -> dict:
    """Cast vote."""
    repo = request_obj.app.state.repository

    def mutate(session: Session) -> Optional[str]:
        if not session.current_task:
            return "No current task"
        if not session.can_vote(request.user_id):
            return "Cannot vote"
        session.current_task.votes[request.user_id] = request.vote_value
        return None

    _, error = await mutate_repo_session(repo, request.chat_id, request.topic_id, mutate)
    if error:
        return {"success": False, "error": error}
    return {"success": True}


@router.post("/batch/start")
async def start_batch(
    request: StartBatchRequest,
    request_obj: Request = None,
) -> dict:
    """Start voting batch."""
    repo = request_obj.app.state.repository

    def mutate(session: Session) -> Optional[str]:
        if not session.tasks_queue:
            return "No tasks in queue"
        session.current_task_index = 0
        session.batch_completed = False
        session.current_batch_started_at = datetime.utcnow().isoformat()
        session.revealed_task_id = None
        if session.current_task:
            session.current_task.votes.clear()
        session.bump_tasks_version()
        return None

    _, error = await mutate_repo_session(repo, request.chat_id, request.topic_id, mutate)
    if error:
        return {"success": False, "error": error}
    return {"success": True}


@router.post("/batch/finish")
async def finish_batch(
    request: StartBatchRequest,
    request_obj: Request = None,
) -> dict:
    """Finish voting batch."""
    repo = request_obj.app.state.repository

    def mutate(session: Session) -> tuple[Optional[str], list[Task]]:
        if session.batch_completed:
            return "Batch already completed", []
        completed_tasks: list[Task] = []
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
        session.revealed_task_id = None
        session.bump_tasks_version()
        return None, completed_tasks

    _, (error, completed_tasks) = await mutate_repo_session(repo, request.chat_id, request.topic_id, mutate)
    if error:
        return {"success": False, "error": error}

    return {
        "success": True,
        "completed_tasks": [t.to_dict() for t in completed_tasks],
    }
