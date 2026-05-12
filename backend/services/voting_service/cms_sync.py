"""Coalesced background sync for the CMS read model."""

from __future__ import annotations

import asyncio
import logging
from typing import Optional

from app.domain.session import Session, SessionFactory

logger = logging.getLogger(__name__)


def session_identity(chat_id: int, topic_id: Optional[int]) -> str:
    topic_part = "none" if topic_id is None else str(topic_id)
    return f"{chat_id}:{topic_part}"


def snapshot_session(session: Session) -> Session:
    return SessionFactory.from_dict(SessionFactory.to_dict(session), session.chat_id, session.topic_id)


class CmsSyncScheduler:
    """Debounce and coalesce expensive full-session CMS syncs.

    Voting writes stay on the critical path; the read model catches up in the
    background and keeps only the latest session snapshot per session key.
    """

    def __init__(self, cms_store, debounce_seconds: float = 0.15):
        self.cms_store = cms_store
        self.debounce_seconds = debounce_seconds
        self._pending: dict[str, Session] = {}
        self._tasks: dict[str, asyncio.Task] = {}

    def schedule(self, session: Session) -> None:
        key = session_identity(session.chat_id, session.topic_id)
        self._pending[key] = snapshot_session(session)
        task = self._tasks.get(key)
        if task is None or task.done():
            self._tasks[key] = asyncio.create_task(self._run(key))

    async def _run(self, key: str) -> None:
        try:
            await asyncio.sleep(self.debounce_seconds)
            while True:
                session = self._pending.pop(key, None)
                if session is None:
                    return
                try:
                    await self.cms_store.sync_session(session)
                except Exception as exc:  # noqa: BLE001
                    logger.warning("CMS background sync failed: key=%s error=%s", key, exc)
                if key not in self._pending:
                    return
        finally:
            self._tasks.pop(key, None)

    async def close(self) -> None:
        tasks = [task for task in self._tasks.values() if not task.done()]
        if not tasks:
            return
        await asyncio.gather(*tasks, return_exceptions=True)
