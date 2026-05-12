import pytest

from app.adapters.voting_service_client import VotingServiceHttpClient
from app.domain.session import Session, SessionFactory


class DummyVotingClient(VotingServiceHttpClient):
    def __init__(self, response):
        super().__init__(base_url="http://voting-service.test")
        self.response = response
        self.calls = []

    async def _request_json(self, method, url, *, params=None, json_body=None, expected_statuses=(200,)):
        self.calls.append(
            {
                "method": method,
                "url": url,
                "params": params,
                "json_body": json_body,
                "expected_statuses": expected_statuses,
            }
        )
        if isinstance(self.response, BaseException):
            raise self.response
        return self.response


@pytest.mark.asyncio
async def test_get_session_uses_service_owned_atomic_create() -> None:
    payload = SessionFactory.to_dict(Session(chat_id=123, topic_id=456))
    client = DummyVotingClient((200, payload))

    session = await client.get_session(123, 456)

    assert session.chat_id == 123
    assert session.topic_id == 456
    assert client.calls[0]["expected_statuses"] == (200,)


@pytest.mark.asyncio
async def test_get_session_does_not_create_local_fallback_on_missing_service_session() -> None:
    client = DummyVotingClient(RuntimeError("Voting Service returned status 404"))

    with pytest.raises(RuntimeError, match="Failed to get session from Voting Service"):
        await client.get_session(123, None)


@pytest.mark.asyncio
async def test_cast_vote_uses_service_atomic_vote_endpoint() -> None:
    client = DummyVotingClient((200, {"success": True}))

    success = await client.cast_vote_atomic(123, None, 42, "5")

    assert success is True
    assert client.calls[0]["method"] == "POST"
    assert client.calls[0]["url"] == "http://voting-service.test/api/v1/vote"
    assert client.calls[0]["json_body"] == {
        "chat_id": 123,
        "topic_id": None,
        "user_id": 42,
        "vote_value": "5",
    }
