from app.utils.jira_changelog import epic_linked_at, infer_developer_from_changelog, status_entered_at, status_entered_at_for_targets


def test_status_entered_at_uses_latest_transition_to_status():
    histories = [
        {
            "created": "2026-06-10T10:00:00.000+0000",
            "items": [{"field": "status", "fromString": "To Do", "toString": "In Progress"}],
        },
        {
            "created": "2026-06-18T10:00:00.000+0000",
            "items": [{"field": "status", "fromString": "In Progress", "toString": "К выполнению"}],
        },
        {
            "created": "2026-06-20T10:00:00.000+0000",
            "items": [{"field": "status", "fromString": "К выполнению", "toString": "In Progress"}],
        },
        {
            "created": "2026-06-21T10:00:00.000+0000",
            "items": [{"field": "status", "fromString": "In Progress", "toString": "К выполнению"}],
        },
    ]
    assert status_entered_at(histories, "К выполнению") == "2026-06-21T10:00:00.000+0000"


def test_epic_linked_at_uses_first_binding():
    histories = [
        {
            "created": "2026-06-05T10:00:00.000+0000",
            "items": [{"field": "Epic Link", "fromString": None, "toString": "FLEX-2318"}],
        },
        {
            "created": "2026-06-12T10:00:00.000+0000",
            "items": [{"field": "Epic Link", "fromString": "FLEX-2318", "toString": "FLEX-2319"}],
        },
        {
            "created": "2026-06-18T10:00:00.000+0000",
            "items": [{"field": "Epic Link", "fromString": "FLEX-2319", "toString": "FLEX-2318"}],
        },
    ]
    assert epic_linked_at(histories, "FLEX-2318") == "2026-06-05T10:00:00.000+0000"


def test_status_entered_at_for_targets_matches_partial_status_names():
    histories = [
        {
            "created": "2026-06-18T10:00:00.000+0000",
            "items": [{"field": "status", "fromString": "In Progress", "toString": "К выполнению"}],
        }
    ]
    assert status_entered_at_for_targets(histories, ["К выполнению"], mode="last") == "2026-06-18T10:00:00.000+0000"


def test_status_entered_at_reads_status_name_from_object_to_field():
    histories = [
        {
            "created": "2026-06-18T10:00:00.000+0000",
            "items": [
                {
                    "field": "status",
                    "from": {"name": "In Progress"},
                    "to": {"name": "К выполнению"},
                }
            ],
        }
    ]
    assert status_entered_at(histories, "К выполнению") == "2026-06-18T10:00:00.000+0000"


def test_infer_developer_uses_assignee_before_leaving_dev_status():
    histories = [
        {
            "created": "2026-06-10T10:00:00.000+0000",
            "items": [
                {"field": "assignee", "fromString": None, "toString": "Dev Alice"},
                {"field": "status", "fromString": "To Do", "toString": "In Progress"},
            ],
        },
        {
            "created": "2026-06-18T10:00:00.000+0000",
            "items": [
                {"field": "status", "fromString": "In Progress", "toString": "In Test"},
                {"field": "assignee", "fromString": "Dev Alice", "toString": "Tester Bob"},
            ],
        },
    ]
    developer, source = infer_developer_from_changelog(
        histories,
        current_status="In Test",
        current_assignee="Tester Bob",
    )
    assert developer == "Dev Alice"
    assert source == "changelog"


def test_infer_developer_falls_back_to_current_assignee_without_history():
    developer, source = infer_developer_from_changelog(
        [],
        current_status="In Test",
        current_assignee="Tester Bob",
    )
    assert developer == "Tester Bob"
    assert source == "fallback"


def test_qa_assignee_from_current_status_allowed_for_done_and_test():
    from app.utils.jira_changelog import qa_assignee_from_current_status_allowed

    assert qa_assignee_from_current_status_allowed("Готово") is True
    assert qa_assignee_from_current_status_allowed("Тестирование") is True
    assert qa_assignee_from_current_status_allowed("К релизу") is True
    assert qa_assignee_from_current_status_allowed("В работе") is False
    assert qa_assignee_from_current_status_allowed("Backlog") is False
