"""Tests for Jira plain-text helpers."""

from app.utils.jira_text import adf_to_plain_text, truncate_text


def test_adf_to_plain_text_paragraph() -> None:
    adf = {
        "type": "doc",
        "version": 1,
        "content": [
            {
                "type": "paragraph",
                "content": [{"type": "text", "text": "Hello Jira"}],
            }
        ],
    }
    assert adf_to_plain_text(adf).strip() == "Hello Jira"


def test_truncate_text_adds_ellipsis() -> None:
    text = "one two three four five six seven eight nine ten"
    clipped = truncate_text(text, 20)
    assert clipped.endswith("…")
    assert len(clipped) <= 20
