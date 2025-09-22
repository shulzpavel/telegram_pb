# Example configuration for the Planning Poker bot. Copy to `config.py` or
# export the listed environment variables in production.

import json
import os
from enum import Enum
from pathlib import Path
from typing import Any, Dict, Optional, Set


class UserRole(Enum):
    PARTICIPANT = "participant"
    LEAD = "lead"
    ADMIN = "admin"


# Telegram tokens (should be provided via environment variables in production)
BOT_TOKEN = os.getenv("BOT_TOKEN", "YOUR_TELEGRAM_BOT_TOKEN")
USER_TOKEN = os.getenv("USER_TOKEN", "user_join_token")
LEAD_TOKEN = os.getenv("LEAD_TOKEN", "lead_join_token")
ADMIN_TOKEN = os.getenv("ADMIN_TOKEN", "admin_join_token")

# Jira credentials
JIRA_URL = os.getenv("JIRA_URL", "https://your-domain.atlassian.net")
JIRA_USERNAME = os.getenv("JIRA_USERNAME", "your-email@example.com")
JIRA_API_TOKEN = os.getenv("JIRA_API_TOKEN", "YOUR_JIRA_API_TOKEN")
STORY_POINTS_FIELD = os.getenv("STORY_POINTS_FIELD", "customfield_10022")

# State persistence
STATE_FILE = Path(os.getenv("STATE_FILE", "data/state.json"))


def _parse_supported_topics(raw_value: str) -> Dict[int, Dict[str, Any]]:
    """Return mapping chat_id -> {allow_all: bool, topics: set}."""
    try:
        parsed = json.loads(raw_value) if raw_value else {}
    except json.JSONDecodeError:
        parsed = {}

    result: Dict[int, Dict[str, Any]] = {}
    for chat_id_str, topic_values in parsed.items():
        try:
            chat_id = int(chat_id_str)
        except (TypeError, ValueError):
            continue

        allow_all = False
        topics: Set[int] = set()
        for value in topic_values or []:
            if isinstance(value, str) and value.strip().upper() == "ALL":
                allow_all = True
                continue
            try:
                topics.add(int(value))
            except (TypeError, ValueError):
                continue

        result[chat_id] = {"allow_all": allow_all or not topics, "topics": topics}

    return result


SUPPORTED_TOPICS = _parse_supported_topics(
    os.getenv("SUPPORTED_TOPICS", '{"-100123456789": ["ALL"]}')
)


def is_supported_thread(chat_id: int, topic_id: Optional[int]) -> bool:
    """Decide whether the bot should handle updates for this chat/topic."""
    constraint = SUPPORTED_TOPICS.get(chat_id)

    if topic_id is None:
        return True

    if constraint is None:
        return False

    if constraint["allow_all"]:
        return True

    return topic_id in constraint["topics"]
