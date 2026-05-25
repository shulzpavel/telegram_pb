"""Tests for session summary CSV helpers."""

from app.domain.participant import Participant
from app.domain.session import Session
from app.domain.task import Task
from config import UserRole
from services.voting_service.app_api import (
    _csv_ai_summary_fields,
    _serialize_completed_task,
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
