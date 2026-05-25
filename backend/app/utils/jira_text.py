"""Plain-text helpers for Jira issue fields (including ADF descriptions)."""

from __future__ import annotations

from typing import Any


def adf_to_plain_text(node: Any) -> str:
    """Convert Atlassian Document Format (or plain string) to readable text."""
    if node is None:
        return ""
    if isinstance(node, str):
        return node.strip()
    if isinstance(node, list):
        return "\n".join(part for part in (adf_to_plain_text(item) for item in node) if part).strip()
    if not isinstance(node, dict):
        return str(node).strip()

    node_type = node.get("type")
    if node_type == "text":
        return str(node.get("text") or "")

    children = node.get("content") or []
    inner = "".join(adf_to_plain_text(child) for child in children)
    if node_type in {"paragraph", "heading", "listItem", "tableRow", "tableCell"}:
        return f"{inner}\n" if inner else ""
    if node_type in {"bulletList", "orderedList", "blockquote", "codeBlock"}:
        return f"{inner}\n" if inner else ""
    if node_type == "hardBreak":
        return "\n"
    return inner


def truncate_text(text: str, max_chars: int) -> str:
    """Trim text for LLM context without breaking mid-word when possible."""
    cleaned = " ".join(text.split())
    if max_chars <= 0 or len(cleaned) <= max_chars:
        return cleaned
    clipped = cleaned[: max_chars - 1].rsplit(" ", 1)[0]
    return f"{clipped}…" if clipped else cleaned[:max_chars]
