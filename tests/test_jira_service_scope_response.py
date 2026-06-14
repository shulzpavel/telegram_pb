from services.jira_service.api import _scope_issue_responses


def test_scope_issue_responses_include_role_contributors():
    rows = _scope_issue_responses(
        [
            {
                "key": "FLEX-1889",
                "summary": "Example",
                "url": "/browse/FLEX-1889",
                "story_points": 5,
                "status": {"name": "Done", "category": "done"},
                "issue_type": {"name": "Story"},
                "role_contributors": {
                    "front": {"name": "Уткина Александра", "source": "gitlab_mr"},
                    "qa": {"name": "Егор Бухтояров", "source": "changelog"},
                },
                "role_contributors_list": [
                    {"role": "front", "name": "Уткина Александра", "source": "gitlab_mr"},
                    {"role": "qa", "name": "Егор Бухтояров", "source": "changelog"},
                ],
                "story_points_front": 3,
                "story_points_back": 2,
                "story_points_qa": 1,
            }
        ]
    )
    assert rows[0].role_contributors["front"].name == "Уткина Александра"
    assert rows[0].role_contributors["qa"].source == "changelog"
    assert rows[0].role_contributors_list[0]["role"] == "front"
    assert rows[0].story_points_front == 3
    assert rows[0].story_points_back == 2
    assert rows[0].story_points_qa == 1
