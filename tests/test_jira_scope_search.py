"""Tests for scope Jira search helpers."""

import pytest

from app.adapters.jira_http import JiraHttpClient


def _client() -> JiraHttpClient:
    return JiraHttpClient(
        base_url="https://jira.example",
        username="u",
        api_token="t",
        story_points_field="customfield_10016",
    )


def test_apply_scope_status_fallback_uses_status_changed_at():
    client = _client()
    enriched = client._apply_scope_status_fallback(
        {"key": "A-1", "status_changed_at": "2026-06-10T10:00:00+00:00"}
    )
    assert enriched["status_entered_at"] == "2026-06-10T10:00:00+00:00"


@pytest.mark.asyncio
async def test_hydrate_legacy_issue_rows_keeps_rows_with_keys():
    client = _client()
    rows = [{"key": "A-1", "fields": {}}, {"key": "A-2", "fields": {}}]
    assert await client._hydrate_legacy_issue_rows(rows, 10) == rows


def test_scope_issue_from_raw_parses_plan_fields():
    client = _client()
    issue = client._scope_issue_from_raw(
        {
            "key": "FLEX-1",
            "fields": {
                "summary": "Task",
                "status": {"name": "Open", "statusCategory": {"key": "new"}},
                "issuetype": {"name": "Story"},
                "customfield_13045": {"value": "Added After Plan", "id": "12288"},
                "customfield_13047": {"value": "Срочный запрос от бизнеса", "id": "12300"},
            },
        }
    )
    assert issue["plan_status"] == "Added After Plan"
    assert issue["plan_change_reasons"] == ["Срочный запрос от бизнеса"]
    assert issue["plan_change_reason"] == "Срочный запрос от бизнеса"
