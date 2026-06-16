from typing import Optional

import pytest


from app.domain.scope_board import (
    build_release_context,
    infer_release_version_lookup,
    normalize_scope_issue,
    normalize_version_meta,
    parse_release_jql,
    release_scope_sections,
)


def _issue(
    key: str,
    *,
    status_name: str,
    status_category: str,
    sp: Optional[float] = None,
    fix_versions: Optional[list[str]] = None,
):
    return normalize_scope_issue(
        {
            "key": key,
            "summary": key,
            "story_points": sp,
            "status": {"name": status_name, "category": status_category},
            "issue_type": {"name": "Story"},
            "labels": [],
            "created": "2026-06-01T10:00:00.000+0000",
            "updated": "2026-06-01T10:00:00.000+0000",
            "fix_versions": fix_versions or ["12076"],
        }
    )


def test_release_scope_sections_parses_fix_version():
    sections = release_scope_sections("project = AIG2 AND fixVersion = 12076", label=None)
    assert len(sections) == 1
    assert sections[0]["id"] == "release"
    assert "12076" in sections[0]["name"] or sections[0]["jql"]


def test_parse_release_jql_supports_version_name():
    parsed = parse_release_jql('project = AIG2 AND fixVersion = "0.690"')
    assert parsed["project_key"] == "AIG2"
    assert parsed["version_name"] == "0.690"
    assert "version_id" not in parsed

    parsed_unquoted = parse_release_jql("project = AIG2 AND fixVersion = 0.690")
    assert parsed_unquoted["version_name"] == "0.690"


def test_infer_release_version_lookup_falls_back_to_issues():
    issues = [
        normalize_scope_issue(
            {
                "key": "A-1",
                "summary": "Story",
                "status": {"name": "Open", "category": "new"},
                "fix_versions": ["0.690"],
            }
        )
    ]
    lookup = infer_release_version_lookup("project = AIG2", issues)
    assert lookup["project_key"] == "AIG2"
    assert lookup["version_name"] == "0.690"


def test_build_release_context_slots_and_counts():
    current_issues = [
        _issue("A-1", status_name="In Progress", status_category="indeterminate", sp=3),
        _issue("A-2", status_name="Тестирование", status_category="indeterminate", sp=5),
        _issue("A-3", status_name="Done", status_category="done", sp=8),
        _issue("A-4", status_name="Пауза", status_category="indeterminate", sp=2),
    ]
    previous_issues = [_issue("A-5", status_name="In Progress", status_category="indeterminate", sp=1)]
    next_issues = [_issue("A-6", status_name="Тестирование", status_category="indeterminate", sp=4)]

    ctx = build_release_context(
        current_jql="project = AIG2 AND fixVersion = 12076",
        current_issues=current_issues,
        previous_jql="project = AIG2 AND fixVersion = 11900",
        previous_issues=previous_issues,
        next_jql="project = AIG2 AND fixVersion = 12100",
        next_issues=next_issues,
        custom_name="Custom rel",
        custom_jql="project = AIG2 AND fixVersion = 12200",
        custom_issues=[],
    )

    assert "current" in ctx
    assert "previous" in ctx
    assert "next" in ctx
    # custom slot is included only when custom_jql non-empty (custom_issues can be empty)
    assert "custom" in ctx

    current = ctx["current"]
    assert current["counts"]["total"] == 4
    assert current["counts"]["in_work"] == 1
    assert current["counts"]["in_test"] == 1
    assert current["counts"]["done"] == 1
    assert current["counts"]["open_questions"] == 1


def test_normalize_version_meta_maps_dates_and_flags():
    meta = normalize_version_meta(
        {
            "id": "12076",
            "name": "3.45.0",
            "released": False,
            "archived": False,
            "overdue": False,
            "startDate": None,
            "releaseDate": "2026-06-30",
            "description": "June release",
            "projectId": "10100",
        },
        project_key="AIG2",
    )
    assert meta["id"] == "12076"
    assert meta["name"] == "3.45.0"
    assert meta["start_date"] is None
    assert meta["release_date"] == "2026-06-30"
    assert meta["project_key"] == "AIG2"

    service_payload = normalize_version_meta(
        {
            "id": "12076",
            "name": "0.690",
            "released": False,
            "start_date": None,
            "release_date": "2026-06-30",
            "project_id": "10100",
        },
        project_key="AIG2",
    )
    assert service_payload["release_date"] == "2026-06-30"


def test_build_release_context_applies_version_meta():
    ctx = build_release_context(
        current_jql="project = AIG2 AND fixVersion = 12076",
        current_issues=[],
        version_meta_by_slot={
            "current": normalize_version_meta(
                {
                    "id": "12076",
                    "name": "3.45.0",
                    "released": False,
                    "releaseDate": "2026-06-30",
                },
                project_key="AIG2",
            )
        },
    )
    assert ctx["current"]["version_meta"]["name"] == "3.45.0"
    assert ctx["current"]["version_name"] == "3.45.0"
    assert ctx["current"]["label"] == "3.45.0"

