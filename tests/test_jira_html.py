"""Tests for Jira rendered HTML sanitization."""

from app.utils.jira_html import html_to_plain_text, sanitize_jira_html


def test_sanitize_strips_script_and_keeps_paragraphs() -> None:
    raw = "<p>Hello</p><script>alert(1)</script><p>World</p>"
    assert sanitize_jira_html(raw) == "<p>Hello</p><p>World</p>"


def test_sanitize_keeps_lists_and_headings() -> None:
    raw = "<h2>Goal</h2><ul><li>One</li><li>Two</li></ul>"
    out = sanitize_jira_html(raw)
    assert "<h2>Goal</h2>" in out
    assert "<ul>" in out and "<li>One</li>" in out


def test_sanitize_blocks_javascript_links() -> None:
    raw = '<p><a href="javascript:alert(1)">bad</a> <a href="https://jira.example/x">ok</a></p>'
    out = sanitize_jira_html(raw)
    assert "javascript:" not in out
    assert 'href="https://jira.example/x"' in out


def test_html_to_plain_text_preserves_blocks() -> None:
    raw = "<h1>Spec</h1><p>First <strong>paragraph</strong></p><ul><li>One</li><li>Two</li></ul>"

    assert html_to_plain_text(raw) == "Spec\nFirst paragraph\nOne\nTwo"
