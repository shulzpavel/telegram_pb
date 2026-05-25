"""Tests for web participant email validation and stable user IDs."""

import pytest

from services.voting_service.participant_identity import (
    stable_user_id_from_email,
    validate_participant_email,
)
from services.voting_service.web_api import _stable_user_id


def test_validate_participant_email_normalizes() -> None:
    assert validate_participant_email("Paul_S@Betboom.COM") == "paul_s@betboom.com"


def test_validate_participant_email_rejects_invalid() -> None:
    with pytest.raises(ValueError, match="почту"):
        validate_participant_email("")
    with pytest.raises(ValueError, match="betboom"):
        validate_participant_email("paul@gmail.com")


def test_stable_user_id_from_email_is_repeatable_and_negative() -> None:
    email = "paul_s@betboom.com"
    assert stable_user_id_from_email(email) == stable_user_id_from_email(email)
    assert stable_user_id_from_email(email) < 0


def test_stable_user_id_from_email_differs_from_uuid_mapping() -> None:
    email = "paul_s@betboom.com"
    uuid_id = _stable_user_id("some-uuid-participant")
    assert stable_user_id_from_email(email) != uuid_id
