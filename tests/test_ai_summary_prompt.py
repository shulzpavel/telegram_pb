"""Regression tests for the Anthropic prompt used by AI summaries.

The system prompt encodes the team's Story Points rubric. The validator
(:func:`_validate_summary_payload`) already rejects malformed responses,
but if a refactor accidentally drops a rule from the prompt (e.g. the
``SP = max(SP dev, SP test)`` formula or the Fibonacci scale) the model
will silently start producing different — but still well-formed — output.
These tests pin the rules we care about so that does not happen.
"""

import pytest

from services.voting_service.ai_summary_llm import (
    STORY_POINT_SCALE,
    _system_prompt,
    _validate_summary_payload,
)


def test_prompt_includes_max_formula() -> None:
    prompt = _system_prompt()
    assert "max(sp_dev, sp_test)" in prompt or "max(SP dev, SP test)" in prompt


def test_prompt_lists_full_fibonacci_scale() -> None:
    prompt = _system_prompt()
    for value in STORY_POINT_SCALE:
        assert f" {value} SP" in prompt or f"{value}|" in prompt or f": {value}\n" in prompt, (
            f"prompt must reference SP scale value {value}, got: {prompt!r}"
        )


@pytest.mark.parametrize(
    "rule_substring",
    [
        "Story Points",  # the term itself
        "Фибоначчи",  # scale name
        "max(sp_dev, sp_test)",  # final formula
        "18 SP",  # decomposition trigger
        "Эпики",  # epics-not-estimated rule
        "spike",  # research-task escape hatch
        "ретро",  # what NOT to estimate
        "low",  # confidence enum
        "high",  # confidence enum
    ],
)
def test_prompt_contains_rubric_keywords(rule_substring: str) -> None:
    """Each rule the team relies on must be physically present in the prompt;
    fuzz-matching is intentional — exact wording can drift, but the key
    concepts must survive any refactor."""
    assert rule_substring in _system_prompt(), (
        f"prompt is missing rubric concept {rule_substring!r}"
    )


def test_prompt_demands_strict_json_object() -> None:
    """The validator rejects markdown fences and non-object payloads, so the
    prompt must explicitly forbid them."""
    prompt = _system_prompt()
    assert "JSON" in prompt
    assert "schema" in prompt.lower() or "схеме" in prompt


def test_validator_still_accepts_well_formed_response() -> None:
    """Sanity check: the response shape the prompt asks for is the one the
    validator accepts. Catches drift between the prompt and the validator."""
    payload = _validate_summary_payload(
        {
            "description": "Описание задачи на пару предложений.",
            "methods": ["API", "БД", "Тесты"],
            "complexity": "Средняя сложность из-за двух интеграций.",
            "sp_dev": 5,
            "sp_test": 3,
            "sp_final": 5,
            "scale_label": "5 SP — средняя",
            "confidence": "medium",
            "assumptions": ["Требуется уточнение по правам доступа"],
        }
    )
    assert payload["sp_final"] == 5
    assert payload["estimation_model"] == "max(sp_dev, sp_test)"
    assert payload["confidence"] == "medium"


def test_validator_corrects_sp_final_below_max() -> None:
    """The validator must enforce sp_final >= max(sp_dev, sp_test) regardless
    of what the model returns. Prompt rule + validator rule together — this
    is the belt-and-braces check."""
    payload = _validate_summary_payload(
        {
            "description": "Задача",
            "methods": ["API"],
            "complexity": "Средняя",
            "sp_dev": 8,
            "sp_test": 3,
            # Model returned a lower value than max — validator must lift it.
            "sp_final": 3,
            "confidence": "medium",
        }
    )
    assert payload["sp_final"] == 8
