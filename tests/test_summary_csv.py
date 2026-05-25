"""Tests for session summary CSV helpers."""

from app.domain.participant import Participant
from app.domain.session import Session
from app.domain.task import Task
from config import UserRole
from services.voting_service.app_api import (
    _csv_ai_summary_fields,
    _markdown_report,
    _serialize_completed_task,
    _summary_payload,
)


def test_csv_ai_summary_fields_empty_when_missing() -> None:
    assert _csv_ai_summary_fields(None) == ("", "", "")
    assert _csv_ai_summary_fields({}) == ("", "", "")


def test_csv_ai_summary_fields_flattens_payload() -> None:
    description, complexity, methods = _csv_ai_summary_fields(
        {
            "description": "Line one\nLine two",
            "complexity": "Medium",
            "methods": ["API", "DB"],
        }
    )
    assert description == "Line one Line two"
    assert complexity == "Medium"
    assert methods == "API; DB"


def test_serialize_completed_task_includes_ai_summary() -> None:
    session = Session(chat_id=1, topic_id=None)
    session.participants[1] = Participant(user_id=1, name="dev@betboom.com", role=UserRole.PARTICIPANT)
    task = Task(
        summary="Auth flow",
        ai_summary={
            "description": "OAuth rollout",
            "methods": ["SSO"],
            "complexity": "High",
        },
    )
    task.votes[1] = "5"

    payload = _serialize_completed_task(session, task, bucket_index=0)

    assert payload["ai_summary"]["description"] == "OAuth rollout"


def test_summary_payload_includes_total_story_points() -> None:
    session = Session(chat_id=1, topic_id=None)
    session.batch_completed = True
    session.last_batch = [
        Task(summary="One", story_points=5),
        Task(summary="Skipped"),
        Task(summary="Two", story_points=8),
    ]

    payload = _summary_payload(session, title="Session")

    assert payload["stats"]["total_story_points"] == 13


def test_summary_payload_includes_post_finish_extension_tasks() -> None:
    session = Session(chat_id=1, topic_id=None)
    session.batch_completed = False
    session.last_batch = [Task(summary="Finished earlier", story_points=5)]
    session.tasks_queue = [
        Task(summary="New completed", story_points=8),
        Task(summary="Not played yet", story_points=13),
    ]
    session.current_task_index = 1

    payload = _summary_payload(session, title="Session")

    assert payload["stats"]["total_completed"] == 2
    assert payload["stats"]["total_story_points"] == 13
    assert [task["summary"] for task in payload["completed_tasks"]] == [
        "Finished earlier",
        "New completed",
    ]


def test_markdown_report_contains_confluence_summary() -> None:
    session = Session(chat_id=1, topic_id=None)
    session.participants[1] = Participant(user_id=1, name="dev@betboom.com", role=UserRole.PARTICIPANT)
    task = Task(
        jira_key="BB-1",
        summary="Checkout flow",
        url="https://jira.example/browse/BB-1",
        story_points=8,
        ai_summary={"description": "Payment rollout", "methods": ["API"], "complexity": "Medium"},
    )
    task.votes[1] = "8"
    session.batch_completed = True
    session.last_batch = [task]

    report = _markdown_report(_summary_payload(session, title="Sprint Planning"))

    assert "# Planning Poker: Sprint Planning" in report
    assert "**TOTAL SP:** 8" in report
    assert "[BB-1](https://jira.example/browse/BB-1)" in report
    assert "Payment rollout" in report
