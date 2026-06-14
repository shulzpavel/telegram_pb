from app.domain.scope_board import compute_scope_metrics_from_sections, normalize_scope_issue


def _issue(key: str, sp: float, **extra):
    return normalize_scope_issue(
        {
            "key": key,
            "summary": key,
            "url": f"/browse/{key}",
            "story_points": sp,
            "status": "Done",
            **extra,
        }
    )


def test_role_coverage_tracks_gitlab_api_and_unresolved_reason():
    issue = _issue(
        "P-1",
        5,
        labels=["backend"],
        role_contributors={"back": {"name": "Back Dev", "source": "gitlab_api_mr"}},
        role_evidence=[
            {
                "role": "back",
                "name": "Back Dev",
                "source": "gitlab_api_mr",
                "confidence": "confirmed",
            }
        ],
    )
    unattributed = _issue(
        "P-2",
        3,
        labels=["backend"],
        role_evidence=[{"role": "back", "unresolved_reason": "unresolved_no_gitlab_link"}],
    )
    metrics = compute_scope_metrics_from_sections(
        80,
        [{"id": "core", "name": "Plan", "kind": "planned", "order": 0, "issues": [issue, unattributed]}],
        "2026-06",
    )
    coverage = metrics["plan_role_coverage"]["back"]
    assert coverage["confirmed_gitlab"] == 1
    assert coverage["unresolved_no_gitlab_link"] == 1
    assert coverage["total"] == 2
