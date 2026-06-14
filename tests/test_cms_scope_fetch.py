"""Tests for scope board Jira fetch helpers in cms_api."""

from services.voting_service.cms_api import (
    SCOPE_JQL_MAX_RESULTS,
    _ScopeJqlFetchResult,
    _count_snapshot_issues,
    _scope_fetch_warnings,
)


def test_count_snapshot_issues_sums_sections_and_queues():
    snapshot = {
        "sections": [{"issues": [{"key": "A-1"}, {"key": "A-2"}]}],
        "plan_issues": [{"key": "P-1"}],
        "priority_queues": {
            "todo": {"issues": [{"key": "T-1"}]},
            "test": {"issues": []},
        },
    }
    assert _count_snapshot_issues(snapshot) == 4


def test_scope_fetch_warnings_only_for_truncated_jql():
    warnings = _scope_fetch_warnings(
        [
            _ScopeJqlFetchResult(jql="project = A", issues=[{}] * 10, truncated=False),
            _ScopeJqlFetchResult(jql="project = B", issues=[{}] * SCOPE_JQL_MAX_RESULTS, truncated=True),
        ]
    )
    assert warnings == [{"jql": "project = B", "truncated": True, "count": SCOPE_JQL_MAX_RESULTS}]
