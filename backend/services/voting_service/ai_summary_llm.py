"""Anthropic Claude integration for voting task AI summaries."""

from __future__ import annotations

import json
import logging
import os
import re
from datetime import datetime, timezone
from typing import Any, Optional

import aiohttp

from app.domain.task import Task
from app.utils.jira_text import truncate_text

logger = logging.getLogger(__name__)

ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION = "2023-06-01"
JSON_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE | re.MULTILINE)


class LlmSummaryError(Exception):
    """Raised when LLM summary generation fails (strict mode, no fallback)."""

    def __init__(self, message: str, status_code: int = 502) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def _anthropic_api_key() -> str:
    return os.getenv("ANTHROPIC_API_KEY", "").strip()


def _anthropic_model() -> str:
    return os.getenv("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001").strip()


def _anthropic_timeout() -> aiohttp.ClientTimeout:
    seconds = max(5, int(os.getenv("ANTHROPIC_TIMEOUT_SECONDS", "20")))
    return aiohttp.ClientTimeout(total=seconds)


def _max_context_chars() -> int:
    return max(500, int(os.getenv("ANTHROPIC_MAX_CONTEXT_CHARS", "6000")))


def llm_configured() -> bool:
    return bool(_anthropic_api_key())


def _strip_json_fences(text: str) -> str:
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = JSON_FENCE_RE.sub("", stripped).strip()
    return stripped


def _parse_llm_json_payload(raw_text: str) -> dict[str, Any]:
    cleaned = _strip_json_fences(raw_text)
    try:
        payload = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise LlmSummaryError("LLM returned invalid JSON", status_code=502) from exc
    if not isinstance(payload, dict):
        raise LlmSummaryError("LLM JSON must be an object", status_code=502)
    return payload


def _validate_summary_payload(payload: dict[str, Any]) -> dict[str, Any]:
    description = str(payload.get("description") or "").strip()
    if not description:
        raise LlmSummaryError("LLM summary is missing description", status_code=502)

    methods_raw = payload.get("methods")
    if not isinstance(methods_raw, list):
        raise LlmSummaryError("LLM summary is missing methods", status_code=502)
    methods = [str(item).strip() for item in methods_raw if str(item).strip()]
    if not methods:
        raise LlmSummaryError("LLM summary methods must not be empty", status_code=502)
    methods = methods[:6]

    complexity = str(payload.get("complexity") or "").strip()
    if not complexity:
        raise LlmSummaryError("LLM summary is missing complexity", status_code=502)

    return {
        "description": description[:2000],
        "methods": methods,
        "complexity": complexity[:500],
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "anthropic",
    }


def _build_task_context(task: Task, jira_context: Optional[dict[str, Any]]) -> str:
    lines = [
        f"summary: {task.summary.strip()}",
        f"source: {task.source}",
    ]
    if task.jira_key:
        lines.append(f"jira_key: {task.jira_key}")
    if task.url:
        lines.append(f"url: {task.url}")
    if task.story_points is not None:
        lines.append(f"story_points_in_session: {task.story_points}")

    if jira_context:
        for key in ("key", "summary", "url", "issue_type", "story_points"):
            value = jira_context.get(key)
            if value not in (None, ""):
                lines.append(f"jira_{key}: {value}")
        labels = jira_context.get("labels") or []
        if labels:
            lines.append(f"jira_labels: {', '.join(str(label) for label in labels)}")
        components = jira_context.get("components") or []
        if components:
            lines.append(f"jira_components: {', '.join(str(item) for item in components)}")
        description = str(jira_context.get("description") or "").strip()
        if description:
            lines.append(f"jira_description:\n{description}")

    return truncate_text("\n".join(lines), _max_context_chars())


def _system_prompt() -> str:
    return (
        "You help a software team estimate Jira tasks during planning poker. "
        "Respond with a single JSON object only, no markdown fences, using this schema:\n"
        '{"description": string, "methods": string[], "complexity": string}\n'
        "description: 2-4 sentences in Russian explaining what the task delivers and what to verify.\n"
        "methods: 3-5 short bullets in Russian naming focus areas (API, UI, data, tests, integration, etc.).\n"
        "complexity: one sentence in Russian with AI baseline story points range (e.g. 2-3 SP, 5-8 SP, 13+ SP) "
        "and why. Base the answer on the provided task context only; do not invent unrelated scope."
    )


def _user_prompt(task_context: str) -> str:
    return f"Generate a planning-poker hint for this task:\n\n{task_context}"


async def _call_anthropic(task_context: str) -> str:
    api_key = _anthropic_api_key()
    if not api_key:
        raise LlmSummaryError("LLM is not configured", status_code=503)

    payload = {
        "model": _anthropic_model(),
        "max_tokens": 1024,
        "temperature": 0.2,
        "system": _system_prompt(),
        "messages": [{"role": "user", "content": _user_prompt(task_context)}],
    }
    headers = {
        "x-api-key": api_key,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
    }

    async with aiohttp.ClientSession(timeout=_anthropic_timeout()) as session:
        try:
            async with session.post(ANTHROPIC_API_URL, json=payload, headers=headers) as response:
                body_text = await response.text()
                if response.status in {401, 403}:
                    raise LlmSummaryError("LLM authentication failed", status_code=502)
                if response.status == 429:
                    raise LlmSummaryError("LLM rate limit exceeded, try again shortly", status_code=503)
                if response.status >= 500:
                    raise LlmSummaryError("LLM service is temporarily unavailable", status_code=503)
                if response.status != 200:
                    logger.warning("Anthropic API error status=%s body=%s", response.status, body_text[:300])
                    try:
                        error_payload = json.loads(body_text)
                        error_message = str((error_payload.get("error") or {}).get("message") or "").strip()
                    except json.JSONDecodeError:
                        error_message = ""
                    if response.status == 404 and error_message.startswith("model:"):
                        raise LlmSummaryError(f"Anthropic model not found: {error_message.removeprefix('model:').strip()}", status_code=502)
                    raise LlmSummaryError(error_message or "LLM request failed", status_code=502)

                data = json.loads(body_text) if body_text else {}
        except aiohttp.ClientError as exc:
            raise LlmSummaryError("LLM service is unreachable", status_code=503) from exc
        except json.JSONDecodeError as exc:
            raise LlmSummaryError("LLM returned an unreadable response", status_code=502) from exc

    blocks = data.get("content")
    if not isinstance(blocks, list):
        raise LlmSummaryError("LLM response has no content", status_code=502)

    text_parts = [str(block.get("text", "")) for block in blocks if block.get("type") == "text"]
    combined = "\n".join(part for part in text_parts if part).strip()
    if not combined:
        raise LlmSummaryError("LLM response was empty", status_code=502)
    return combined


async def generate_ai_summary_llm(task: Task, jira_context: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    """Generate and validate AI summary via Anthropic (strict — no heuristic fallback)."""
    task_context = _build_task_context(task, jira_context)
    raw = await _call_anthropic(task_context)
    payload = _parse_llm_json_payload(raw)
    return _validate_summary_payload(payload)


async def fetch_jira_issue_context(issue_key: str) -> Optional[dict[str, Any]]:
    """Fetch rich Jira issue context from jira-service for LLM prompts."""
    key = (issue_key or "").strip().upper()
    if not key:
        return None

    base_url = os.getenv("JIRA_SERVICE_URL", "http://jira-service:8001").rstrip("/")
    timeout = aiohttp.ClientTimeout(total=int(os.getenv("JIRA_SERVICE_TIMEOUT_SECONDS", "30")))
    url = f"{base_url}/api/v1/issue/{key}/context"

    async with aiohttp.ClientSession(timeout=timeout) as session:
        try:
            async with session.get(url) as response:
                if response.status == 404:
                    return None
                if response.status != 200:
                    body = (await response.text())[:300]
                    logger.warning("Jira context fetch failed key=%s status=%s body=%s", key, response.status, body)
                    raise LlmSummaryError("Failed to load Jira issue context", status_code=502)
                data = await response.json()
        except aiohttp.ClientError as exc:
            raise LlmSummaryError("Jira service is unreachable", status_code=503) from exc

    return data if isinstance(data, dict) else None
