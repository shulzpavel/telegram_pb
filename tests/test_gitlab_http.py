import pytest

from app.adapters.gitlab_http import GitLabHttpClient


@pytest.mark.asyncio
async def test_fetch_evidence_by_keys_uses_search_results(monkeypatch):
    client = GitLabHttpClient(base_url="https://gitlab.example", token="token")

    async def fake_raw(key: str):
        if key == "FLEX-1":
            return {
                "merge_requests": [
                    {
                        "title": "FLEX-1 feature",
                        "project_id": 10,
                        "author": {"name": "Dev"},
                        "project_path": "iGaming/backend/cms-api",
                    }
                ],
                "commits": [],
            }
        return {"merge_requests": [], "commits": []}

    monkeypatch.setattr(client, "fetch_issue_evidence_raw", fake_raw)

    result = await client.fetch_evidence_by_keys(["FLEX-1", "FLEX-2"])
    assert "FLEX-1" in result
    assert result["FLEX-1"]["merge_requests"][0]["project_path"] == "iGaming/backend/cms-api"
    await client.close()


@pytest.mark.asyncio
async def test_fetch_evidence_disabled_without_token():
    client = GitLabHttpClient(base_url="", token="")
    assert client.enabled is False
    result = await client.fetch_evidence_by_keys(["FLEX-1"])
    assert result == {}
