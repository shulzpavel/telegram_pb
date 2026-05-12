"""Repository helpers for session reads and atomic mutations."""

from __future__ import annotations

import inspect
from typing import Any, Callable, Optional

from app.domain.session import Session


async def maybe_await(value: Any) -> Any:
    if inspect.isawaitable(value):
        return await value
    return value


async def get_repo_session(repo: Any, chat_id: int, topic_id: Optional[int]) -> Session:
    if hasattr(repo, "get_session_async"):
        return await repo.get_session_async(chat_id, topic_id)
    return await maybe_await(repo.get_session(chat_id, topic_id))


async def save_repo_session(repo: Any, session: Session) -> None:
    if hasattr(repo, "save_session_async"):
        await repo.save_session_async(session)
    else:
        await maybe_await(repo.save_session(session))


async def mutate_repo_session(
    repo: Any,
    chat_id: int,
    topic_id: Optional[int],
    mutator: Callable[[Session], Any],
) -> tuple[Session, Any]:
    """Apply a sync or async mutator and persist the session if the repo cannot mutate atomically."""
    if hasattr(repo, "mutate_session"):
        return await repo.mutate_session(chat_id, topic_id, mutator)

    session = await get_repo_session(repo, chat_id, topic_id)
    result = await maybe_await(mutator(session))
    await save_repo_session(repo, session)
    return session, result
