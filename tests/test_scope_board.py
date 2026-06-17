from typing import Optional

from app.domain.scope_board import (
    apply_priority_queue_comment,
    apply_priority_queue_reorder,
    build_scope_snapshot,
    classify_scope_report_bucket,
    compute_scope_metrics,
    compute_scope_metrics_from_sections,
    compute_scope_refresh_delta,
    compute_scope_report,
    compute_scope_report_from_sections,
    jira_priority_rank,
    merge_jira_role_fields_configured,
    merge_priority_queue,
    merge_scope_issues,
    month_start_iso,
    normalize_scope_issue,
    normalize_scope_sections,
    pause_supplement_jql,
    refresh_scope_snapshot_metrics,
    sort_issues_by_jira_priority,
)


def _raw_issue(key: str, sp: Optional[float], *, status="To Do", category="new", created="2026-05-01T10:00:00.000+0000"):
    return {
        "key": key,
        "summary": key,
        "url": f"/browse/{key}",
        "story_points": sp,
        "status": {"name": status, "category": category},
        "issue_type": {"name": "Story"},
        "labels": [],
        "created": created,
        "updated": created,
    }


def _issue(key: str, sp: Optional[float], *, status="To Do", category="new", created="2026-05-01T10:00:00.000+0000"):
    return normalize_scope_issue(_raw_issue(key, sp, status=status, category=category, created=created))


def test_month_start_iso():
    assert month_start_iso("2026-06").startswith("2026-06-01")


def test_normalize_scope_issue_keeps_jira_metadata():
    issue = normalize_scope_issue(
        {
            "key": "P-1",
            "summary": "Task",
            "story_points": 3,
            "status": {"name": "In Progress", "category": "indeterminate"},
            "issue_type": {"name": "Story"},
            "priority": "High",
            "assignee": "Paul",
            "epic_key": "EPIC-1",
            "sprint": "June",
            "severity": "SEV2",
            "domain": "Multifeed",
            "plan_status": "Committed",
            "team_labels": ["rip"],
        }
    )
    assert issue["priority"] == "High"
    assert issue["assignee"] == "Paul"
    assert issue["epic_key"] == "EPIC-1"
    assert issue["sprint"] == "June"
    assert issue["severity"] == "SEV2"
    assert issue["domain"] == "Multifeed"
    assert issue["team_labels"] == ["rip"]


def test_normalize_scope_issue_keeps_jira_role_assignees():
    issue = normalize_scope_issue(
        {
            "key": "FLEX-2673",
            "summary": "Task",
            "jira_role_assignees": {"front": "", "back": "", "qa": "QA Person"},
        }
    )
    assert issue["jira_role_assignees"] == {"front": "", "back": "", "qa": "QA Person"}


def test_compute_scope_metrics_ok():
    plan = [_issue("P-1", 20), _issue("P-2", 10)]
    unplan = [_issue("U-1", 5)]
    metrics = compute_scope_metrics(80, plan, unplan, "2026-06")
    assert metrics["plan_sp"] == 30
    assert metrics["unplan_sp"] == 5
    assert metrics["buffer_sp"] == 45
    assert metrics["intake_status"] == "ok"


def test_compute_scope_metrics_stop_on_overfill():
    plan = [_issue("P-1", 50)]
    unplan = [_issue("U-1", 40)]
    metrics = compute_scope_metrics(80, plan, unplan, "2026-06")
    assert metrics["buffer_sp"] == -10
    assert metrics["overfill_sp"] == 10
    assert metrics["intake_status"] == "stop"


def test_compute_scope_metrics_stop_on_unestimated_active():
    plan = [_issue("P-1", 10), _issue("P-2", None)]
    metrics = compute_scope_metrics(80, plan, [], "2026-06")
    assert metrics["unestimated_count"] == 1
    assert metrics["intake_status"] == "warning"


def test_compute_scope_metrics_warning_on_low_buffer():
    plan = [_issue("P-1", 70)]
    unplan = [_issue("U-1", 8)]
    metrics = compute_scope_metrics(80, plan, unplan, "2026-06")
    assert metrics["buffer_sp"] == 2
    assert metrics["intake_status"] == "warning"


def test_scope_refresh_delta_detects_added_issue():
    prev_plan = [_issue("P-1", 20)]
    prev_metrics = compute_scope_metrics(80, prev_plan, [], "2026-06")
    previous = build_scope_snapshot(
        plan_issues=prev_plan,
        unplan_issues=[],
        metrics=prev_metrics,
        refreshed_at="2026-06-10T10:00:00+00:00",
    )
    next_plan = prev_plan + [_issue("P-2", 5)]
    next_metrics = compute_scope_metrics(80, next_plan, [], "2026-06")
    delta_pack = compute_scope_refresh_delta(previous, next_plan, [], next_metrics)
    assert delta_pack["delta"]["plan_sp"] == 5
    assert delta_pack["delta"]["buffer_sp"] == -5
    assert any(event["type"] == "added" and event["key"] == "P-2" for event in delta_pack["events"])


def test_build_scope_snapshot_appends_refresh_log():
    plan = [_issue("P-1", 10)]
    metrics = compute_scope_metrics(80, plan, [], "2026-06")
    first = build_scope_snapshot(
        plan_issues=plan,
        unplan_issues=[],
        metrics=metrics,
        refreshed_at="2026-06-10T10:00:00+00:00",
    )
    second_plan = plan + [_issue("P-2", 8)]
    second_metrics = compute_scope_metrics(80, second_plan, [], "2026-06")
    second = build_scope_snapshot(
        plan_issues=second_plan,
        unplan_issues=[],
        metrics=second_metrics,
        refreshed_at="2026-06-11T10:00:00+00:00",
        previous_snapshot=first,
    )
    assert len(second["refresh_log"]) == 2
    assert second["delta"]["plan_sp"] == 8
    assert any(event["type"] == "added" for event in second["events"])


def test_scope_creep_detection():
    plan = [
        _issue("P-1", 5, created="2026-06-05T10:00:00.000+0000"),
        _issue("P-2", 5, created="2026-05-01T10:00:00.000+0000"),
    ]
    metrics = compute_scope_metrics(80, plan, [], "2026-06")
    assert metrics["scope_creep_count"] == 1


def test_classify_scope_report_bucket_flex_statuses():
    assert classify_scope_report_bucket(_issue("P-1", 3, status="В работе", category="indeterminate")) == "in_work"
    assert classify_scope_report_bucket(_issue("P-2", 3, status="К тестированию", category="indeterminate")) == "in_test"
    assert classify_scope_report_bucket(_issue("P-3", 3, status="Тестирование", category="indeterminate")) == "in_test"
    assert classify_scope_report_bucket(_issue("P-4", 3, status="Готово", category="done")) == "done"
    assert classify_scope_report_bucket(_issue("P-5", 3, status="Пауза", category="indeterminate")) == "open_questions"
    assert classify_scope_report_bucket(_issue("P-6", 3, status="К релизу", category="indeterminate")) == "in_test"
    assert classify_scope_report_bucket(_issue("P-7", 3, status="Backlog", category="new")) == "not_started"
    assert classify_scope_report_bucket(_issue("P-8", 3, status="К выполнению", category="new")) == "not_started"


def test_compute_scope_report_groups_plan_and_unplan():
    plan = [
        _issue("P-1", 3, status="В работе", category="indeterminate"),
        _issue("P-2", 2, status="Готово", category="done"),
    ]
    plan[0]["priority"] = "Medium"
    unplan = [
        _issue("U-1", 1, status="Пауза", category="indeterminate"),
    ]
    unplan[0]["last_comment"] = "Ждём ответ от провайдера"
    report = compute_scope_report(plan, unplan)
    assert report["counts"]["in_work"] == 1
    assert report["counts"]["done"] == 1
    assert report["counts"]["open_questions"] == 1
    assert report["plan"]["counts"]["in_work"] == 1
    assert report["unplan"]["counts"]["total"] == 0
    assert report["open_questions"][0]["last_comment"] == "Ждём ответ от провайдера"


def test_compute_scope_report_excludes_not_started_but_keeps_done():
    issues = [
        *[_issue(f"B-{idx}", 1, status="Backlog", category="new") for idx in range(5)],
        *[_issue(f"T-{idx}", 1, status="К выполнению", category="new") for idx in range(2)],
        *[_issue(f"W-{idx}", 1, status="В работе", category="indeterminate") for idx in range(3)],
        _issue("Q-1", 1, status="Пауза", category="indeterminate"),
        _issue("IBO2-1561", 1, status="Готово", category="done"),
        _issue("IBO2-1560", 1, status="Готово", category="done"),
        *[_issue(f"D-{idx}", 1, status="Готово", category="done") for idx in range(3)],
    ]
    report = compute_scope_report_from_sections(
        [
            {
                "id": "ibo2-1610",
                "name": "BO.[tech] оптимизация. Июнь. 2026",
                "kind": "planned",
                "order": 0,
                "issues": issues,
            }
        ]
    )
    section = report["sections"][0]
    assert section["counts"] == {"in_work": 3, "in_test": 0, "done": 5, "total": 8}
    assert {"IBO2-1560", "IBO2-1561"}.issubset({issue["key"] for issue in section["done"]})
    assert [issue["key"] for issue in report["open_questions"]] == ["Q-1"]


def test_sort_done_issues_by_recent_status():
    issues = [
        {**_issue("P-1", 1, status="Готово", category="done"), "status_entered_at": "2026-06-01T10:00:00+00:00"},
        {**_issue("P-2", 1, status="Готово", category="done"), "status_entered_at": "2026-06-13T10:00:00+00:00"},
        {**_issue("P-3", 1, status="Готово", category="done"), "status_entered_at": "2026-06-10T10:00:00+00:00"},
    ]
    from app.domain.scope_board import sort_done_issues_by_recent_status

    ordered = sort_done_issues_by_recent_status(issues)
    assert [issue["key"] for issue in ordered] == ["P-2", "P-3", "P-1"]


def test_sort_issues_by_jira_priority():
    issues = [
        {**_issue("P-1", 1), "priority": "Low"},
        {**_issue("P-2", 1), "priority": "Highest"},
        {**_issue("P-3", 1), "priority": "High"},
    ]
    ordered = sort_issues_by_jira_priority(issues)
    assert [issue["key"] for issue in ordered] == ["P-2", "P-3", "P-1"]
    assert jira_priority_rank("Highest") < jira_priority_rank("Medium")


def test_build_scope_snapshot_includes_report():
    plan = [_issue("P-1", 10, status="В работе", category="indeterminate")]
    metrics = compute_scope_metrics(80, plan, [], "2026-06")
    snapshot = build_scope_snapshot(
        plan_issues=plan,
        unplan_issues=[],
        metrics=metrics,
        refreshed_at="2026-06-10T10:00:00+00:00",
    )
    assert snapshot["report"]["plan"]["counts"]["in_work"] == 1
    assert "jira_role_fields_configured" in snapshot
    assert set(snapshot["jira_role_fields_configured"]) == {"front", "back", "qa"}


def test_pause_supplement_jql_adds_status_filter():
    jql = pause_supplement_jql('"Epic Link" = FLEX-2318')
    assert "FLEX-2318" in jql
    assert "Пауза" in jql


def test_merge_scope_issues_prefers_later_group():
    first = [_issue("P-1", 3, status="Готово", category="done")]
    second = [_issue("P-1", 3, status="Пауза", category="indeterminate")]
    merged = merge_scope_issues(first, second)
    assert len(merged) == 1
    assert merged[0]["status"] == "Пауза"


def test_merge_priority_queue_puts_new_issues_first_and_preserves_existing_order():
    fetched = [
        {**_issue("P-1", 3), "priority": "High", "status": "К выполнению", "status_entered_at": "2026-06-10T10:00:00+00:00"},
        {**_issue("P-2", 2), "priority": "Highest", "status": "К выполнению", "status_entered_at": "2026-06-11T10:00:00+00:00"},
        {**_issue("P-3", 1), "priority": "Low", "status": "К выполнению", "status_entered_at": "2026-06-18T10:00:00+00:00"},
        {**_issue("P-4", 1), "issue_type": "Bug", "priority": "Highest", "status": "К выполнению", "status_entered_at": "2026-06-19T10:00:00+00:00"},
    ]
    previous = {
        "order": ["P-2", "P-1"],
        "issues": fetched[:2],
        "history": [
            {
                "type": "appeared",
                "at": "2026-06-13T10:00:00+00:00",
                "by": "Jira",
                "issue_key": "P-1",
                "message": "stale",
            }
        ],
        "filter_seen_at": {"P-1": "2026-06-10T10:00:00+00:00", "P-2": "2026-06-11T10:00:00+00:00"},
    }
    merged = merge_priority_queue(
        fetched,
        previous,
        queue_label="Задачи к выполнению",
        refreshed_at="2026-06-20T10:00:00+00:00",
    )
    assert [issue["key"] for issue in merged["issues"]] == ["P-3", "P-2", "P-1", "P-4"]
    appeared = [entry for entry in merged["history"] if entry["type"] == "appeared"]
    assert len(appeared) == 4
    by_key = {entry["issue_key"]: entry["at"] for entry in appeared}
    assert by_key["P-1"] == "2026-06-10T10:00:00+00:00"
    assert by_key["P-3"] == "2026-06-18T10:00:00+00:00"
    assert all(entry["at"] != "2026-06-20T10:00:00+00:00" for entry in appeared)


def test_merge_priority_queue_skips_appeared_without_milestone_date():
    fetched = [{**_issue("P-1", 3), "status": "К выполнению"}]
    merged = merge_priority_queue(
        fetched,
        {"order": [], "issues": [], "history": [], "filter_seen_at": {}},
        queue_label="Задачи к выполнению",
        refreshed_at="2026-06-20T10:00:00+00:00",
    )
    assert [entry for entry in merged["history"] if entry["type"] == "appeared"] == []


def test_apply_priority_queue_reorder_requires_comment_history():
    queue = {
        "order": ["P-1", "P-2", "P-3"],
        "issues": [_issue("P-1", 1), _issue("P-2", 2), _issue("P-3", 3)],
        "history": [],
    }
    updated = apply_priority_queue_reorder(
        queue,
        order=["P-2", "P-1", "P-3"],
        comment="Подняли из-за блокера",
        actor_name="PO",
        changed_at="2026-06-12T11:00:00+00:00",
        queue_label="Задачи к выполнению",
        moved_key="P-2",
    )
    assert [issue["key"] for issue in updated["issues"]] == ["P-2", "P-1", "P-3"]
    assert updated["history"][0]["type"] == "reorder"
    assert updated["history"][0]["issue_key"] == "P-2"
    assert updated["issues"][0]["grooming_comment"] == "Подняли из-за блокера"


def test_apply_priority_queue_comment_appends_history():
    queue = {
        "order": ["P-1"],
        "issues": [_issue("P-1", 1)],
        "history": [],
    }
    updated = apply_priority_queue_comment(
        queue,
        issue_key="P-1",
        comment="Берём после релиза",
        actor_name="PO",
        changed_at="2026-06-12T12:00:00+00:00",
        queue_label="Задачи к тестированию",
    )
    assert updated["issues"][0]["grooming_comment"] == "Берём после релиза"
    assert updated["history"][0]["type"] == "comment"


def test_normalize_scope_sections_legacy_fallback():
    sections = normalize_scope_sections(None, plan_jql="project = P", unplan_jql="labels = adhoc")
    assert len(sections) == 2
    assert sections[0]["id"] == "plan"
    assert sections[0]["kind"] == "planned"
    assert sections[1]["id"] == "unplan"
    assert sections[1]["kind"] == "unplanned"


def test_normalize_scope_sections_custom_order():
    sections = normalize_scope_sections(
        [
            {"id": "b", "name": "Mobile", "jql": "labels = mobile", "kind": "planned", "order": 1},
            {"id": "a", "name": "Core", "jql": "labels = core", "kind": "planned", "order": 0},
        ]
    )
    assert [section["id"] for section in sections] == ["a", "b"]
    assert sections[0]["order"] == 0
    assert sections[1]["order"] == 1


def test_compute_scope_metrics_from_custom_sections():
    sections = [
        {"id": "core", "name": "Epic Core", "kind": "planned", "order": 0, "issues": [_issue("P-1", 10)]},
        {"id": "mobile", "name": "Mobile", "kind": "planned", "order": 1, "issues": [_issue("P-2", 5)]},
        {"id": "adhoc", "name": "Ad-hoc", "kind": "unplanned", "order": 2, "issues": [_issue("U-1", 3)]},
    ]
    metrics = compute_scope_metrics_from_sections(80, sections, "2026-06")
    assert metrics["plan_sp"] == 15
    assert metrics["unplan_sp"] == 3
    assert metrics["buffer_sp"] == 62
    assert metrics["section_count"] == 3
    assert len(metrics["sections"]) == 3
    assert metrics["sections"][0]["name"] == "Epic Core"


def test_compute_scope_metrics_plan_fields():
    issue_with_plan = normalize_scope_issue(
        {
            **_issue("P-1", 5),
            "plan_status": "On track",
            "plan_change_reasons": ["Scope creep", "Priority shift"],
            "assignee": "Alice",
        }
    )
    issue_without_reason = normalize_scope_issue({**_issue("P-2", 3), "plan_status": "At risk", "assignee": "Bob"})
    sections = [
        {
            "id": "core",
            "name": "Epic Core",
            "kind": "planned",
            "order": 0,
            "issues": [issue_with_plan, issue_without_reason],
        },
        {
            "id": "adhoc",
            "name": "Ad-hoc",
            "kind": "unplanned",
            "order": 1,
            "issues": [normalize_scope_issue({**_issue("U-1", 2), "assignee": "Alice"})],
        },
    ]
    metrics = compute_scope_metrics_from_sections(80, sections, "2026-06")
    assert metrics["plan_status_counts"] == {"On track": 1, "At risk": 1, "Не указан": 1}
    assert metrics["plan_change_reason_counts"] == {"Scope creep": 1, "Priority shift": 1}
    assert metrics["plan_by_assignee"] == [
        {"assignee": "Alice", "story_points": 5.0, "count": 1},
        {"assignee": "Bob", "story_points": 3.0, "count": 1},
    ]
    assert metrics["unplan_by_assignee"] == [{"assignee": "Alice", "story_points": 2.0, "count": 1}]


def test_compute_scope_metrics_developer_breakdown():
    issue_with_plan = normalize_scope_issue(
        {
            **_issue("P-1", 5),
            "assignee": "Tester Bob",
            "developer": "Dev Alice",
            "developer_source": "changelog",
        }
    )
    issue_without_reason = normalize_scope_issue(
        {**_issue("P-2", 3), "assignee": "Tester Eve", "developer": "Dev Bob", "developer_source": "changelog"}
    )
    sections = [
        {
            "id": "core",
            "name": "Epic Core",
            "kind": "planned",
            "order": 0,
            "issues": [issue_with_plan, issue_without_reason],
        },
        {
            "id": "adhoc",
            "name": "Ad-hoc",
            "kind": "unplanned",
            "order": 1,
            "issues": [
                normalize_scope_issue(
                    {**_issue("U-1", 2), "assignee": "Tester Bob", "developer": "Dev Alice", "developer_source": "changelog"}
                )
            ],
        },
    ]
    metrics = compute_scope_metrics_from_sections(80, sections, "2026-06")
    assert metrics["plan_by_developer"][0]["developer"] == "Dev Alice"
    assert metrics["plan_by_developer"][0]["count"] == 1
    assert metrics["plan_by_developer"][0]["issues"][0]["key"] == "P-1"
    assert metrics["plan_by_developer"][0]["issues"][0]["assignee"] == "Tester Bob"
    assert metrics["unplan_by_developer"] == [
        {
            "developer": "Dev Alice",
            "story_points": 2.0,
            "count": 1,
            "issues": [
                {
                    "key": "U-1",
                    "summary": "U-1",
                    "url": "/browse/U-1",
                    "story_points": 2.0,
                    "status": "",
                    "assignee": "Tester Bob",
                    "developer_source": "changelog",
                    "status_entered_at": None,
                    "status_changed_at": None,
                    "updated": "2026-05-01T10:00:00.000+0000",
                    "role_contributors_list": [],
                    "front": "",
                    "back": "",
                    "qa": "",
                    }
            ],
        }
    ]


def _active_issue(key: str, sp: Optional[float], **extra):
    return normalize_scope_issue(
        {
            **_raw_issue(key, sp, status="В работе", category="indeterminate"),
            "jira_role_assignees": {"front": "", "back": "", "qa": ""},
            **extra,
        }
    )


def test_merge_jira_role_fields_configured_prefers_true_flags():
    merged = merge_jira_role_fields_configured(
        {"front": False, "back": False, "qa": False},
        {"front": True, "back": False, "qa": False},
    )
    assert merged == {"front": True, "back": False, "qa": False}


def test_compute_scope_metrics_role_breakdown():
    front_issue = _active_issue(
        "P-1",
        5,
        jira_role_assignees={"front": "Front Dev", "back": "", "qa": ""},
    )
    qa_issue = normalize_scope_issue(
        {
            **_raw_issue("P-2", 3, status="Тестирование", category="indeterminate"),
            "jira_role_assignees": {"front": "Front Dev", "back": "", "qa": "QA Person"},
            "story_points_test": 3,
        }
    )
    sections = [
        {
            "id": "core",
            "name": "Epic Core",
            "kind": "planned",
            "order": 0,
            "issues": [front_issue, qa_issue],
        },
        {
            "id": "adhoc",
            "name": "Ad-hoc",
            "kind": "unplanned",
            "order": 1,
            "issues": [],
        },
    ]
    metrics = compute_scope_metrics_from_sections(80, sections, "2026-06")
    assert metrics["plan_by_role"]["front"][0]["developer"] == "Front Dev"
    assert metrics["plan_by_role"]["front"][0]["count"] == 2
    assert metrics["plan_by_role"]["qa"][0]["developer"] == "QA Person"
    assert metrics["plan_by_role"]["qa"][0]["count"] == 1
    assert metrics["plan_role_coverage"]["front"] == {
        "attributed": 2,
        "total": 2,
        "confirmed": 2,
        "estimated": 0,
        "unattributed": 0,
        "confirmed_jira": 2,
        "confirmed_gitlab": 0,
        "unresolved_no_gitlab_link": 0,
        "unresolved_ambiguous_role": 0,
    }
    assert metrics["plan_role_coverage"]["qa"] == {
        "attributed": 1,
        "total": 1,
        "confirmed": 1,
        "estimated": 0,
        "unattributed": 0,
        "confirmed_jira": 1,
        "confirmed_jira_qa": 1,
        "unresolved_no_qa_transition": 0,
    }


def test_role_attention_respects_single_engineering_label():
    frontend_only = _active_issue(
        "FLEX-2847",
        3,
        labels=["frontend"],
        jira_role_assignees={"front": "", "back": "", "qa": ""},
    )
    backend_only = _active_issue(
        "FLEX-2865",
        8,
        labels=["backend"],
        jira_role_assignees={"front": "", "back": "", "qa": ""},
    )
    metrics = compute_scope_metrics_from_sections(
        80,
        [
            {
                "id": "core",
                "name": "Plan",
                "kind": "planned",
                "order": 0,
                "issues": [frontend_only, backend_only],
            }
        ],
        "2026-06",
    )

    assert metrics["plan_role_coverage"]["front"] == {
        "attributed": 0,
        "total": 1,
        "confirmed": 0,
        "estimated": 0,
        "unattributed": 1,
        "confirmed_jira": 0,
        "confirmed_gitlab": 0,
        "unresolved_no_gitlab_link": 0,
        "unresolved_ambiguous_role": 0,
    }
    assert metrics["plan_role_coverage"]["back"] == {
        "attributed": 0,
        "total": 1,
        "confirmed": 0,
        "estimated": 0,
        "unattributed": 1,
        "confirmed_jira": 0,
        "confirmed_gitlab": 0,
        "unresolved_no_gitlab_link": 0,
        "unresolved_ambiguous_role": 0,
    }


def test_qa_role_workload_includes_done_status_with_sp_test():
    issue = normalize_scope_issue(
        {
            **_raw_issue("FLEX-2739", 2, status="Готово", category="done"),
            "jira_role_assignees": {"front": "", "back": "", "qa": ""},
            "story_points_test": 2,
            "assignee": "Егор Бухтояров",
            "status_entered_at": "2026-06-20T10:00:00+00:00",
        }
    )
    metrics = compute_scope_metrics_from_sections(
        80,
        [{"id": "core", "name": "Plan", "kind": "planned", "order": 0, "issues": [issue]}],
        "2026-06",
    )
    assert metrics["plan_by_role"]["qa"][0]["developer"] == "Егор Бухтояров"
    assert metrics["plan_role_coverage"]["qa"]["total"] == 1


def test_qa_role_workload_marks_missing_sp_test_unattributed():
    issue = normalize_scope_issue(
        {
            **_raw_issue("FLEX-2508", 3, status="Тестирование", category="indeterminate"),
            "jira_role_assignees": {"front": "", "back": "", "qa": ""},
            "story_points_test": None,
            "assignee": "Александр Катанский",
        }
    )
    metrics = compute_scope_metrics_from_sections(
        80,
        [{"id": "core", "name": "Plan", "kind": "planned", "order": 0, "issues": [issue]}],
        "2026-06",
    )
    assert metrics["plan_by_role"]["qa"][0]["developer"] == "Не атрибутировано"
    assert metrics["plan_role_coverage"]["qa"]["unattributed"] == 1
    assert metrics["plan_by_role"]["qa"][0]["issues"][0]["role_unresolved"]["qa"] == "jira_sp_test_empty"


def test_qa_role_workload_sorts_by_recent_status_transition():
    older = normalize_scope_issue(
        {
            **_raw_issue("FLEX-1", 2, status="Тестирование", category="indeterminate"),
            "story_points_test": 2,
            "assignee": "QA Older",
            "status_entered_at": "2026-06-10T10:00:00+00:00",
        }
    )
    newer = normalize_scope_issue(
        {
            **_raw_issue("FLEX-2", 3, status="К релизу", category="indeterminate"),
            "story_points_test": 3,
            "assignee": "QA Newer",
            "status_entered_at": "2026-06-20T10:00:00+00:00",
        }
    )
    metrics = compute_scope_metrics_from_sections(
        80,
        [{"id": "core", "name": "Plan", "kind": "planned", "order": 0, "issues": [older, newer]}],
        "2026-06",
    )
    row = next(item for item in metrics["plan_by_role"]["qa"] if item["developer"] == "QA Newer")
    assert [task["key"] for task in row["issues"]] == ["FLEX-2"]


def test_qa_role_workload_uses_assignee_when_tester_empty_and_sp_test_filled():
    issue = normalize_scope_issue(
        {
            **_raw_issue("FLEX-2508", 3, status="Тестирование", category="indeterminate"),
            "jira_role_assignees": {"front": "", "back": "", "qa": ""},
            "story_points_test": 3,
            "assignee": "Александр Катанский",
        }
    )
    metrics = compute_scope_metrics_from_sections(
        80,
        [{"id": "core", "name": "Plan", "kind": "planned", "order": 0, "issues": [issue]}],
        "2026-06",
    )
    assert metrics["plan_by_role"]["qa"][0]["developer"] == "Александр Катанский"
    assert metrics["plan_role_coverage"]["qa"]["unattributed"] == 0


def test_qa_role_workload_skips_ready_for_test_status():
    issue = normalize_scope_issue(
        {
            **_raw_issue("FLEX-2085", 2, status="К тестированию", category="indeterminate"),
            "jira_role_assignees": {"front": "", "back": "", "qa": ""},
            "story_points_test": 2,
            "assignee": "Сергей Баранов",
        }
    )
    metrics = compute_scope_metrics_from_sections(
        80,
        [{"id": "core", "name": "Plan", "kind": "planned", "order": 0, "issues": [issue]}],
        "2026-06",
    )
    assert metrics["plan_by_role"]["qa"] == []
    assert metrics["plan_role_coverage"]["qa"]["total"] == 0


def test_role_metrics_ignore_gitlab_when_jira_field_empty():
    issue = _active_issue(
        "P-1",
        5,
        role_contributors={"front": {"name": "Wrong Dev", "source": "gitlab_mr"}},
    )
    metrics = compute_scope_metrics_from_sections(
        80,
        [{"id": "core", "name": "Plan", "kind": "planned", "order": 0, "issues": [issue]}],
        "2026-06",
    )
    assert metrics["plan_by_role"]["front"][0]["developer"] == "Не атрибутировано"
    assert metrics["plan_role_coverage"]["front"] == {
        "attributed": 0,
        "total": 1,
        "confirmed": 0,
        "estimated": 0,
        "unattributed": 1,
        "confirmed_jira": 0,
        "confirmed_gitlab": 0,
        "unresolved_no_gitlab_link": 0,
        "unresolved_ambiguous_role": 0,
    }


def test_role_metrics_trust_jira_field_contributors():
    issue = normalize_scope_issue(
        {
            **_raw_issue("P-1", 3, status="Тестирование", category="indeterminate"),
            "jira_role_assignees": {"front": "", "back": "", "qa": "QA Person"},
            "story_points_test": 2,
            "role_contributors": {"qa": {"name": "QA Person", "source": "jira_field"}},
        }
    )
    metrics = compute_scope_metrics_from_sections(
        80,
        [{"id": "core", "name": "Plan", "kind": "planned", "order": 0, "issues": [issue]}],
        "2026-06",
    )

    assert metrics["plan_by_role"]["qa"][0]["developer"] == "QA Person"
    assert metrics["plan_role_coverage"]["qa"] == {
        "attributed": 1,
        "total": 1,
        "confirmed": 1,
        "estimated": 0,
        "unattributed": 0,
        "confirmed_jira": 1,
        "confirmed_jira_qa": 1,
        "unresolved_no_qa_transition": 0,
    }
    assert "role_unresolved" not in metrics["plan_by_role"]["qa"][0]["issues"][0]


def test_role_coverage_requires_qa_only_in_test_status():
    in_work_without_qa = _active_issue("P-1", 3)
    in_test_without_qa = normalize_scope_issue(
        {
            **_raw_issue("P-2", 2, status="Тестирование", category="indeterminate"),
            "jira_role_assignees": {"front": "", "back": "", "qa": ""},
        }
    )
    in_test_with_qa = normalize_scope_issue(
        {
            **_raw_issue("P-3", 1, status="Тестирование", category="indeterminate"),
            "jira_role_assignees": {"front": "", "back": "", "qa": "QA Person"},
            "story_points_test": 1,
        }
    )
    metrics = compute_scope_metrics_from_sections(
        80,
        [
            {
                "id": "core",
                "name": "Plan",
                "kind": "planned",
                "order": 0,
                "issues": [in_work_without_qa, in_test_without_qa, in_test_with_qa],
            }
        ],
        "2026-06",
    )
    assert metrics["plan_role_coverage"]["qa"] == {
        "attributed": 1,
        "total": 2,
        "confirmed": 1,
        "estimated": 0,
        "unattributed": 1,
        "confirmed_jira": 1,
        "confirmed_jira_qa": 1,
        "unresolved_no_qa_transition": 1,
    }


def test_role_metrics_add_unattributed_bucket_for_active_work_without_jira_field():
    issue = _active_issue("P-1", 5)
    metrics = compute_scope_metrics_from_sections(
        80,
        [{"id": "core", "name": "Plan", "kind": "planned", "order": 0, "issues": [issue]}],
        "2026-06",
    )
    assert metrics["plan_by_role"]["front"][0]["developer"] == "Не атрибутировано"
    assert metrics["plan_by_role"]["front"][0]["count"] == 1
    assert metrics["plan_by_role"]["front"][0]["story_points"] == 5.0
    assert metrics["plan_role_coverage"]["front"] == {
        "attributed": 0,
        "total": 1,
        "confirmed": 0,
        "estimated": 0,
        "unattributed": 1,
        "confirmed_jira": 0,
        "confirmed_gitlab": 0,
        "unresolved_no_gitlab_link": 0,
        "unresolved_ambiguous_role": 0,
    }


def test_role_metrics_count_task_by_jira_back_field():
    issue = _active_issue(
        "P-1",
        4,
        jira_role_assignees={"front": "", "back": "Минаев Дмитрий Дмитриевич", "qa": ""},
    )
    metrics = compute_scope_metrics_from_sections(
        80,
        [{"id": "core", "name": "Plan", "kind": "planned", "order": 0, "issues": [issue]}],
        "2026-06",
    )
    rows = {row["developer"]: row for row in metrics["plan_by_role"]["back"]}
    assert list(rows) == ["Минаев Дмитрий Дмитриевич"]
    assert rows["Минаев Дмитрий Дмитриевич"]["count"] == 1
    assert rows["Минаев Дмитрий Дмитриевич"]["story_points"] == 4.0
    assert rows["Минаев Дмитрий Дмитриевич"]["issues"][0]["key"] == "P-1"
    assert metrics["plan_role_coverage"]["back"] == {
        "attributed": 1,
        "total": 1,
        "confirmed": 1,
        "estimated": 0,
        "unattributed": 0,
        "confirmed_jira": 1,
        "confirmed_gitlab": 0,
        "unresolved_no_gitlab_link": 0,
        "unresolved_ambiguous_role": 0,
    }


def test_role_metrics_ignore_changelog_when_jira_field_empty():
    issue = _active_issue(
        "P-1",
        5,
        developer="Back Dev",
        developer_source="changelog",
        role_contributors={"back": {"name": "Back Dev", "source": "changelog_dev"}},
    )
    metrics = compute_scope_metrics_from_sections(
        80,
        [{"id": "core", "name": "Plan", "kind": "planned", "order": 0, "issues": [issue]}],
        "2026-06",
    )
    assert metrics["plan_by_role"]["back"][0]["developer"] == "Не атрибутировано"
    assert metrics["plan_role_coverage"]["back"]["unattributed"] == 1


def test_role_metrics_merge_same_person_by_name_tokens():
    issues = [
        _active_issue(
            "P-1",
            3,
            jira_role_assignees={"front": "Илья Пыхтин", "back": "", "qa": ""},
        ),
        _active_issue(
            "P-2",
            2,
            jira_role_assignees={"front": "Пыхтин Илья Александрович", "back": "", "qa": ""},
        ),
    ]
    metrics = compute_scope_metrics_from_sections(
        80,
        [{"id": "core", "name": "Plan", "kind": "planned", "order": 0, "issues": issues}],
        "2026-06",
    )
    assert len(metrics["plan_by_role"]["front"]) == 1
    assert metrics["plan_by_role"]["front"][0]["count"] == 2
    assert metrics["plan_by_role"]["front"][0]["story_points"] == 5.0


def test_compute_scope_report_from_sections():
    sections = [
        {
            "id": "core",
            "name": "Epic Core",
            "kind": "planned",
            "order": 0,
            "issues": [_issue("P-1", 3, status="В работе", category="indeterminate")],
        },
        {
            "id": "adhoc",
            "name": "Ad-hoc",
            "kind": "unplanned",
            "order": 1,
            "issues": [_issue("U-1", 1, status="Пауза", category="indeterminate")],
        },
    ]
    report = compute_scope_report_from_sections(sections)
    assert len(report["sections"]) == 2
    assert report["sections"][0]["name"] == "Epic Core"
    assert report["sections"][0]["counts"]["in_work"] == 1
    assert report["counts"]["open_questions"] == 1
    assert report["open_questions"][0]["section_name"] == "Ad-hoc"


def test_build_scope_snapshot_with_sections():
    sections = [
        {"id": "core", "name": "Epic Core", "kind": "planned", "order": 0, "issues": [_issue("P-1", 10, status="В работе", category="indeterminate")]},
        {"id": "adhoc", "name": "Ad-hoc", "kind": "unplanned", "order": 1, "issues": []},
    ]
    metrics = compute_scope_metrics_from_sections(80, sections, "2026-06")
    snapshot = build_scope_snapshot(
        sections=sections,
        metrics=metrics,
        refreshed_at="2026-06-10T10:00:00+00:00",
    )
    assert len(snapshot["sections"]) == 2
    assert snapshot["report"]["sections"][0]["name"] == "Epic Core"
    assert snapshot["plan_issues"][0]["section_name"] == "Epic Core"
    assert snapshot["unplan_issues"] == []


def _dev_test_issue(
    key: str,
    *,
    sp: Optional[float] = None,
    sp_dev: Optional[float] = None,
    sp_test: Optional[float] = None,
    status="To Do",
    category="new",
):
    return normalize_scope_issue(
        {
            "key": key,
            "summary": key,
            "url": f"/browse/{key}",
            "story_points": sp,
            "story_points_dev": sp_dev,
            "story_points_test": sp_test,
            "status": {"name": status, "category": category},
            "issue_type": {"name": "Story"},
            "labels": [],
            "created": "2026-05-01T10:00:00.000+0000",
            "updated": "2026-05-01T10:00:00.000+0000",
        }
    )


def test_compute_scope_metrics_dev_test_mode():
    plan = [
        _dev_test_issue("P-1", sp_dev=10, sp_test=3),
        _dev_test_issue("P-2", sp_dev=5, sp_test=2),
    ]
    unplan = [_dev_test_issue("U-1", sp_dev=4, sp_test=1)]
    metrics = compute_scope_metrics(80, plan, unplan, "2026-06", workload_mode="sp_dev_test", capacity_sp_dev=60, capacity_sp_test=30)
    assert metrics["workload_mode"] == "sp_dev_test"
    assert metrics["capacity_sp_dev"] == 60
    assert metrics["capacity_sp_test"] == 30
    assert metrics["plan_dev_sp"] == 15
    assert metrics["plan_test_sp"] == 5
    assert metrics["unplan_dev_sp"] == 4
    assert metrics["unplan_test_sp"] == 1
    assert metrics["plan_sp"] == 20
    assert metrics["unplan_sp"] == 5
    assert metrics["buffer_dev_sp"] == 41
    assert metrics["buffer_test_sp"] == 24
    assert metrics["intake_status"] == "ok"


def test_compute_scope_metrics_dev_test_mode_flags_missing_track_fields():
    plan = [
        _dev_test_issue("P-1", sp_dev=10, sp_test=3),
        _dev_test_issue("P-2", sp_dev=5, sp_test=None),
    ]
    metrics = compute_scope_metrics(80, plan, [], "2026-06", workload_mode="sp_dev_test")
    assert metrics["unestimated_count"] == 1
    assert metrics["unestimated_tasks"][0]["key"] == "P-2"
    assert metrics["unestimated_tasks"][0]["missing_tracks"] == ["test"]
    assert metrics["intake_status"] == "warning"


def test_compute_scope_metrics_dev_test_mode_flags_only_general_sp():
    plan = [_dev_test_issue("FLEX-1853", sp=8, sp_dev=None, sp_test=None, status="В работе", category="indeterminate")]
    metrics = compute_scope_metrics(80, plan, [], "2026-06", workload_mode="sp_dev_test")
    assert metrics["unestimated_count"] == 1
    issue = metrics["unestimated_tasks"][0]
    assert issue["key"] == "FLEX-1853"
    assert issue["missing_tracks"] == ["dev", "test"]
    assert "указан только общий SP" in issue["workload_attention_reasons"]
    assert metrics["intake_status"] == "warning"
