"""HTTP client adapter for Voting Service microservice."""

import asyncio
import logging
import os
from typing import Any, Optional

import aiohttp

from app.domain.session import Session, SessionFactory
from app.ports.session_repository import SessionRepository

logger = logging.getLogger(__name__)


class VotingServiceHttpClient(SessionRepository):
    """HTTP client for Voting Service microservice."""

    def __init__(self, base_url: str = None, timeout: int = 30, retry_attempts: int = 3):
        self.base_url = base_url or os.getenv("VOTING_SERVICE_URL", "http://localhost:8002")
        self._session: Optional[aiohttp.ClientSession] = None
        self._timeout = aiohttp.ClientTimeout(total=timeout)
        self._retry_attempts = max(1, retry_attempts)

    async def _get_session(self) -> aiohttp.ClientSession:
        """Get or create aiohttp session."""
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(timeout=self._timeout)
        return self._session

    async def close(self) -> None:
        """Close aiohttp session."""
        if self._session and not self._session.closed:
            await self._session.close()

    async def _request_json(
        self,
        method: str,
        url: str,
        *,
        params: Optional[dict[str, Any]] = None,
        json_body: Optional[dict[str, Any]] = None,
        expected_statuses: tuple[int, ...] = (200,),
    ) -> tuple[int, Optional[dict[str, Any]]]:
        session_client = await self._get_session()
        transient_statuses = {429, 500, 502, 503, 504}
        last_error: Optional[BaseException] = None
        for attempt in range(1, self._retry_attempts + 1):
            try:
                async with session_client.request(method, url, params=params, json=json_body) as resp:
                    if resp.status in expected_statuses:
                        if resp.content_length == 0:
                            return resp.status, None
                        return resp.status, await resp.json()
                    if resp.status in transient_statuses and attempt < self._retry_attempts:
                        await asyncio.sleep(0.2 * attempt)
                        continue
                    body = await resp.text()
                    raise RuntimeError(f"Voting Service returned status {resp.status}: {body[:500]}")
            except aiohttp.ClientError as exc:
                last_error = exc
                if attempt >= self._retry_attempts:
                    break
                logger.warning("Voting Service request failed, retrying: %s %s attempt=%s", method, url, attempt)
                await asyncio.sleep(0.2 * attempt)
        raise RuntimeError(f"Voting Service unavailable: {last_error}") from last_error

    async def get_session(self, chat_id: int, topic_id: Optional[int]) -> Session:
        """Get or create session atomically via Voting Service."""
        url = f"{self.base_url}/api/v1/session"

        params = {"chat_id": chat_id}
        if topic_id is not None:
            params["topic_id"] = topic_id

        try:
            _, data = await self._request_json("GET", url, params=params, expected_statuses=(200,))
            if not data:
                raise RuntimeError("Voting Service returned empty session payload")
            return self._deserialize_session(data, chat_id, topic_id)
        except Exception as e:
            raise RuntimeError(f"Failed to get session from Voting Service: {e}") from e

    async def save_session(self, session: Session) -> None:
        """Save session via Voting Service."""
        url = f"{self.base_url}/api/v1/session"

        data = {
            "session": self._serialize_session(session),
        }

        try:
            await self._request_json("POST", url, json_body=data, expected_statuses=(200, 201))
        except Exception as e:
            raise RuntimeError(f"Failed to save session to Voting Service: {e}") from e

    async def delete_session(self, chat_id: int, topic_id: Optional[int]) -> None:
        """Delete session via Voting Service."""
        url = f"{self.base_url}/api/v1/session"

        params = {"chat_id": chat_id}
        if topic_id is not None:
            params["topic_id"] = topic_id

        try:
            await self._request_json("DELETE", url, params=params, expected_statuses=(200, 204))
        except Exception as e:
            raise RuntimeError(f"Failed to delete session from Voting Service: {e}") from e

    async def generate_web_token(self, chat_id: int, topic_id: Optional[int]) -> Optional[str]:
        """Generate a web voting token for the given session."""
        url = f"{self.base_url}/api/v1/web/token"
        try:
            _, data = await self._request_json(
                "POST",
                url,
                json_body={"chat_id": chat_id, "topic_id": topic_id},
                expected_statuses=(200,),
            )
            return data.get("token") if data else None
        except Exception as exc:
            logger.warning("Failed to generate web token via Voting Service: %s", exc)
            return None

    async def cast_vote_atomic(
        self,
        chat_id: int,
        topic_id: Optional[int],
        user_id: int,
        vote_value: str,
    ) -> bool:
        """Cast a vote through the service-owned atomic mutation endpoint."""
        url = f"{self.base_url}/api/v1/vote"
        _, data = await self._request_json(
            "POST",
            url,
            json_body={
                "chat_id": chat_id,
                "topic_id": topic_id,
                "user_id": user_id,
                "vote_value": vote_value,
            },
            expected_statuses=(200,),
        )
        return bool(data and data.get("success"))

    def _serialize_session(self, session: Session) -> dict:
        """Serialize session to dict."""
        return SessionFactory.to_dict(session)

    def _deserialize_session(self, data: dict, chat_id: int, topic_id: Optional[int]) -> Session:
        """Deserialize session from dict."""
        return SessionFactory.from_dict(data, chat_id, topic_id)
