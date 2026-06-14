from app.utils.jira_role_contributors import (
    build_changelog_dev_fallback,
    build_subtask_workload_items,
    infer_qa_from_testing_comments,
    infer_role_contributors_from_comments,
    merge_role_contributors,
    person_bucket_key,
)


def test_infer_role_contributors_from_gitlab_comments():
    comments = [
        {
            "created": "2026-02-04T20:19:09.287+0400",
            "author": {"displayName": "igaming"},
            "body": (
                "Уткина Александра Васильевна mentioned this issue in a merge request of "
                "iGaming / frontend / dashboards / cms-backoffice on branch FLEX-1889-bo-verifications-refactoring"
            ),
        },
    ]
    roles = infer_role_contributors_from_comments(comments)
    assert roles["front"]["name"] == "Уткина Александра Васильевна"
    assert roles["front"]["source"] == "gitlab_mr"


def test_build_subtask_workload_items_from_gitlab_comments():
    subtasks = [
        {
            "key": "FLEX-2245",
            "summary": "CMS_API. Разблокировка",
            "comments": [
                {
                    "author": {"displayName": "igaming"},
                    "body": (
                        "Минаев Дмитрий Дмитриевич mentioned this issue in a merge request of "
                        "iGaming / backend / cms-api on branch FLEX-2238"
                    ),
                }
            ],
        }
    ]
    items = build_subtask_workload_items(subtasks)
    assert items == [
        {
            "role": "back",
            "name": "Минаев Дмитрий Дмитриевич",
            "source": "subtask_gitlab_mr",
            "subtask_key": "FLEX-2245",
            "subtask_summary": "CMS_API. Разблокировка",
        }
    ]


def test_merge_role_contributors_prefers_parent_gitlab_over_subtasks():
    merged, items = merge_role_contributors(
        from_comments={"front": {"name": "Parent Front", "source": "gitlab_mr"}},
        subtask_workload_items=[
            {
                "role": "front",
                "name": "Subtask Front",
                "source": "subtask_gitlab_mr",
                "subtask_key": "FLEX-1",
                "subtask_summary": "Front work",
            }
        ],
        qa_from_changelog="QA Person",
        qa_source="changelog",
    )
    assert merged["front"]["name"] == "Parent Front"
    assert merged["qa"]["name"] == "QA Person"
    assert len(items) == 1


def test_merge_role_contributors_uses_subtasks_when_parent_missing_role():
    merged, items = merge_role_contributors(
        from_comments={},
        subtask_workload_items=[
            {
                "role": "back",
                "name": "Минаев Дмитрий Дмитриевич",
                "source": "subtask_gitlab_mr",
                "subtask_key": "FLEX-2245",
                "subtask_summary": "CMS_API",
            },
            {
                "role": "back",
                "name": "Егор Наумов",
                "source": "subtask_gitlab_commit",
                "subtask_key": "FLEX-2243",
                "subtask_summary": "Crutcher",
            },
        ],
    )
    assert merged["back"]["name"] == "Минаев Дмитрий Дмитриевич"
    assert merged["back"]["source"] == "subtask_gitlab_mr"
    assert len(items) == 2


def test_build_changelog_dev_fallback_skips_when_gitlab_exists():
    fallback = build_changelog_dev_fallback(
        labels=["backend"],
        developer="Back Dev",
        developer_source="changelog",
        from_comments={"front": {"name": "Front Dev", "source": "gitlab_mr"}},
        workload_items=[],
    )
    assert fallback == {}


def test_merge_role_contributors_uses_changelog_dev_without_gitlab():
    merged, _items = merge_role_contributors(
        from_comments={},
        labels=["backend"],
        developer="Back Dev",
        developer_source="changelog",
    )
    assert merged["back"] == {"name": "Back Dev", "source": "changelog_dev"}


def test_merge_role_contributors_uses_current_dev_without_gitlab():
    merged, _items = merge_role_contributors(
        from_comments={},
        labels=["frontend"],
        developer="Front Dev",
        developer_source="current",
    )
    assert merged["front"] == {"name": "Front Dev", "source": "changelog_dev"}


def test_merge_role_contributors_ignores_non_dev_fallback_source():
    merged, _items = merge_role_contributors(
        from_comments={},
        labels=["backend"],
        developer="Back Dev",
        developer_source="fallback",
    )
    assert "back" not in merged


def test_merge_role_contributors_uses_testing_comment_for_qa():
    merged, _items = merge_role_contributors(
        from_comments={},
        issue_comments=[
            {
                "created": "2026-03-01T10:00:00.000+0400",
                "author": {"displayName": "Tester QA"},
                "body": "Задача реализована, в рамках тестирования проверено.",
            }
        ],
        developer="Back Dev",
    )
    assert merged["qa"] == {"name": "Tester QA", "source": "testing_comment"}


def test_merge_role_contributors_prefers_gitlab_api_over_comments():
    merged, items = merge_role_contributors(
        from_gitlab_api={"front": {"name": "API Front", "source": "gitlab_api_mr"}},
        from_comments={"front": {"name": "Comment Front", "source": "gitlab_mr"}},
    )
    assert merged["front"]["name"] == "API Front"
    assert merged["front"]["source"] == "gitlab_api_mr"
    assert items == []


def test_person_bucket_key_normalizes_name_order():
    assert person_bucket_key("Илья Пыхтин") == person_bucket_key("Пыхтин Илья Александрович")
