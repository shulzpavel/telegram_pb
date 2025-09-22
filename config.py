import json
import os
from enum import Enum
from pathlib import Path
from typing import Any, Dict, Optional, Set


class UserRole(Enum):
    PARTICIPANT = "participant"
    LEAD = "lead"
    ADMIN = "admin"


# Токены для подключения берём из окружения
BOT_TOKEN = os.getenv("BOT_TOKEN", "")

# Токены для ролей
USER_TOKEN = os.getenv("USER_TOKEN", "user_token")
LEAD_TOKEN = os.getenv("LEAD_TOKEN", "lead_token")
ADMIN_TOKEN = os.getenv("ADMIN_TOKEN", "admin_token")

# Jira конфигурация
JIRA_URL = os.getenv("JIRA_URL", "https://your-domain.atlassian.net")
JIRA_USERNAME = os.getenv("JIRA_USERNAME", "your-email@domain.com")
JIRA_API_TOKEN = os.getenv("JIRA_API_TOKEN", "YOUR_JIRA_API_TOKEN_HERE")
STORY_POINTS_FIELD = os.getenv("STORY_POINTS_FIELD", "customfield_10022")

# Файл для сохранения состояния
STATE_FILE = Path(os.getenv("STATE_FILE", "data/state.json"))


def _parse_supported_topics(raw_value: str) -> Dict[int, Dict[str, Any]]:
    try:
        parsed = json.loads(raw_value) if raw_value else {}
    except json.JSONDecodeError:
        return {}

    result: Dict[int, Dict[str, Any]] = {}
    for chat_id_str, topics in parsed.items():
        try:
            chat_id = int(chat_id_str)
        except (TypeError, ValueError):
            continue

        allow_all = False
        topic_ids: Set[int] = set()
        for value in topics or []:
            if isinstance(value, str) and value.strip().upper() == "ALL":
                allow_all = True
                continue
            try:
                topic_ids.add(int(value))
            except (TypeError, ValueError):
                continue

        result[chat_id] = {"allow_all": allow_all or not topic_ids, "topics": topic_ids}

    return result


SUPPORTED_TOPICS = _parse_supported_topics(os.getenv("SUPPORTED_TOPICS", "{}"))


def is_supported_thread(chat_id: int, topic_id: Optional[int]) -> bool:
    """Проверить, может ли бот работать в данном чате/топике."""
    constraint = SUPPORTED_TOPICS.get(chat_id)

    # Группа без топиков — работаем всегда
    if topic_id is None:
        return True

    # Если чат не сконфигурирован, топики игнорируем
    if constraint is None:
        return False

    if constraint["allow_all"]:
        return True

    return topic_id in constraint["topics"]
