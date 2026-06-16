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


def test_scope_issue_from_raw_reads_role_assignee_fields(monkeypatch):
    import config

    monkeypatch.setattr(config, "JIRA_FRONT_ASSIGNEE_FIELD", "customfield_201")
    monkeypatch.setattr(config, "JIRA_BACK_ASSIGNEE_FIELD", "customfield_202")
    monkeypatch.setattr(config, "JIRA_QA_ASSIGNEE_FIELD", "customfield_203")
    client = _client()
    issue = client._scope_issue_from_raw(
        {
            "key": "FLEX-1",
            "fields": {
                "summary": "Task",
                "status": {"name": "В работе", "statusCategory": {"key": "indeterminate"}},
                "issuetype": {"name": "Story"},
                "customfield_201": {"displayName": "Front Dev"},
                "customfield_202": [{"displayName": "Back Dev"}],
                "customfield_203": {"displayName": "QA Person"},
            },
        }
    )

    assert issue["role_contributors_from_jira_fields"] == {
        "front": {"name": "Front Dev", "source": "jira_field"},
        "back": {"name": "Back Dev", "source": "jira_field"},
        "qa": {"name": "QA Person", "source": "jira_field"},
    }


def test_finalize_scope_issue_roles_trusts_jira_qa_field():
    client = _client()
    enriched = client._finalize_scope_issue_roles(
        {
            "key": "FLEX-1",
            "status": "В работе",
            "assignee": "Developer",
            "story_points": 3,
            "role_contributors_from_jira_fields": {
                "qa": {"name": "QA Person", "source": "jira_field"},
            },
        },
        histories=[],
    )

    assert enriched["role_contributors"]["qa"] == {
        "name": "QA Person",
        "source": "jira_field",
    }
    assert not any(
        item.get("role") == "qa" and item.get("unresolved_reason") == "unresolved_no_qa_transition"
        for item in enriched["role_evidence"]
    )


def test_finalize_scope_issue_roles_uses_assignee_for_done_without_changelog():
    client = _client()
    enriched = client._finalize_scope_issue_roles(
        {
            "key": "IBO2-1560",
            "status": "Готово",
            "assignee": "Максим Строгов",
            "story_points": 2,
        },
        histories=None,
    )
    assert enriched["role_contributors"]["qa"] == {
        "name": "Максим Строгов",
        "source": "current",
    }


def test_finalize_scope_issue_roles_remaps_qa_fallback_for_done_status():
    client = _client()
    enriched = client._finalize_scope_issue_roles(
        {
            "key": "IBO2-1560",
            "status": "Готово",
            "assignee": "Максим Строгов",
            "story_points": 2,
        },
        histories=[],
    )
    assert enriched["role_contributors"]["qa"] == {
        "name": "Максим Строгов",
        "source": "current",
    }


def test_finalize_scope_issue_roles_ignores_qa_fallback_for_backlog():
    client = _client()
    enriched = client._finalize_scope_issue_roles(
        {
            "key": "IBO2-1500",
            "status": "Backlog",
            "assignee": "Максим Строгов",
            "story_points": 2,
        },
        histories=[],
    )
    assert "qa" not in enriched["role_contributors"]


def test_finalize_scope_issue_roles_uses_current_assignee_for_backend_in_work():
    client = _client()
    enriched = client._finalize_scope_issue_roles(
        {
            "key": "IBO2-1600",
            "status": "В работе",
            "assignee": "Backend Dev",
            "labels": ["backend"],
            "story_points": 3,
        },
        histories=None,
    )
    assert enriched["role_contributors"]["back"] == {
        "name": "Backend Dev",
        "source": "changelog_dev",
    }


def test_finalize_scope_issue_roles_uses_current_assignee_for_frontend_in_work():
    client = _client()
    enriched = client._finalize_scope_issue_roles(
        {
            "key": "IBO2-1601",
            "status": "In Progress",
            "assignee": "Frontend Dev",
            "labels": ["frontend"],
            "story_points": 5,
        },
        histories=None,
    )
    assert enriched["role_contributors"]["front"] == {
        "name": "Frontend Dev",
        "source": "changelog_dev",
    }


def test_finalize_scope_issue_roles_ignores_current_assignee_for_backend_backlog():
    client = _client()
    enriched = client._finalize_scope_issue_roles(
        {
            "key": "IBO2-1602",
            "status": "Backlog",
            "assignee": "Backend Dev",
            "labels": ["backend"],
            "story_points": 3,
        },
        histories=None,
    )
    assert "back" not in enriched["role_contributors"]
