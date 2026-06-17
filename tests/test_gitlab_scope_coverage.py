from app.domain.scope_board import compute_scope_metrics_from_sections, normalize_scope_issue


def _issue(key: str, sp: float, **extra):
    return normalize_scope_issue(
        {
            "key": key,
            "summary": key,
            "url": f"/browse/{key}",
            "story_points": sp,
            "status": {"name": "В работе", "category": "indeterminate"},
            "jira_role_assignees": {"front": "", "back": "", "qa": ""},
            **extra,
        }
    )


def test_role_coverage_tracks_jira_fields_and_unfilled():
    attributed = _issue(
        "P-1",
        5,
        jira_role_assignees={"front": "", "back": "Back Dev", "qa": ""},
    )
    unattributed = _issue("P-2", 3)
    metrics = compute_scope_metrics_from_sections(
        80,
        [{"id": "core", "name": "Plan", "kind": "planned", "order": 0, "issues": [attributed, unattributed]}],
        "2026-06",
    )
    coverage = metrics["plan_role_coverage"]["back"]
    assert coverage["confirmed_jira"] == 1
    assert coverage["unattributed"] == 1
    assert coverage["total"] == 2


def test_role_coverage_counts_front_and_back_independently():
    issue = _issue(
        "FLEX-1965",
        2,
        jira_role_assignees={"front": "", "back": "Back Dev", "qa": ""},
    )
    metrics = compute_scope_metrics_from_sections(
        80,
        [{"id": "core", "name": "Plan", "kind": "planned", "order": 0, "issues": [issue]}],
        "2026-06",
    )

    assert metrics["plan_role_coverage"]["back"]["total"] == 1
    assert metrics["plan_role_coverage"]["back"]["confirmed_jira"] == 1
    assert metrics["plan_role_coverage"]["front"]["total"] == 1
    assert metrics["plan_role_coverage"]["front"]["unattributed"] == 1
