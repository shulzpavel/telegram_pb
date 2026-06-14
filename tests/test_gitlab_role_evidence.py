from app.utils.gitlab_role_evidence import (
    GITLAB_API_SOURCES,
    build_gitlab_api_contributors,
    build_gitlab_api_workload_items,
    unresolved_reason_for_role,
)


def test_build_gitlab_api_workload_items_from_merge_request():
    raw = {
        "merge_requests": [
            {
                "web_url": "https://gitlab.example/mr/1",
                "project_path": "iGaming/frontend/cms-backoffice",
                "author": {"name": "Front Dev"},
            }
        ],
        "commits": [],
    }
    items = build_gitlab_api_workload_items(raw, jira_key="FLEX-100")
    assert len(items) == 1
    assert items[0]["role"] == "front"
    assert items[0]["name"] == "Front Dev"
    assert items[0]["source"] == "gitlab_api_mr"
    assert items[0]["source_url"] == "https://gitlab.example/mr/1"
    assert items[0]["confidence"] == "confirmed"


def test_build_gitlab_api_workload_items_for_subtask():
    raw = {
        "merge_requests": [
            {
                "web_url": "https://gitlab.example/mr/2",
                "project_path": "iGaming/backend/cms-api",
                "author": {"name": "Back Dev"},
            }
        ],
        "commits": [],
    }
    items = build_gitlab_api_workload_items(
        raw,
        jira_key="FLEX-200",
        subtask_key="FLEX-201",
        subtask_summary="API work",
    )
    assert items[0]["source"] == "subtask_gitlab_api_mr"
    assert items[0]["subtask_key"] == "FLEX-201"


def test_build_gitlab_api_contributors_prefers_mr_over_commit():
    items = build_gitlab_api_workload_items(
        {
            "merge_requests": [
                {
                    "web_url": "https://gitlab.example/mr/1",
                    "project_path": "iGaming/backend/cms-api",
                    "author": {"name": "MR Dev"},
                }
            ],
            "commits": [
                {
                    "web_url": "https://gitlab.example/commit/1",
                    "project_path": "iGaming/backend/cms-api",
                    "author_name": "Commit Dev",
                }
            ],
        },
        jira_key="FLEX-300",
    )
    contributors = build_gitlab_api_contributors(items)
    assert contributors["back"]["name"] == "MR Dev"
    assert contributors["back"]["source"] == "gitlab_api_mr"


def test_unresolved_reason_no_gitlab_link():
    reason = unresolved_reason_for_role(
        role="back",
        labels=["backend"],
        gitlab_items=[],
        comment_gitlab_roles=set(),
        has_trusted_name=False,
    )
    assert reason == "unresolved_no_gitlab_link"


def test_unresolved_reason_ambiguous_role():
    reason = unresolved_reason_for_role(
        role="back",
        labels=["backend"],
        gitlab_items=[
            {"role": "front", "name": "Front Dev", "source": "gitlab_api_mr"},
            {"role": "back", "name": "Back Dev", "source": "gitlab_api_mr"},
        ],
        comment_gitlab_roles=set(),
        has_trusted_name=False,
    )
    assert reason == "unresolved_ambiguous_role"


def test_gitlab_api_sources_constant():
    assert "gitlab_api_mr" in GITLAB_API_SOURCES
