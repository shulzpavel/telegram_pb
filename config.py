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

# Microservices configuration (REQUIRED)
JIRA_SERVICE_URL = os.getenv("JIRA_SERVICE_URL", "http://localhost:8001")
VOTING_SERVICE_URL = os.getenv("VOTING_SERVICE_URL", "http://localhost:8002")

# Postgres metrics storage
POSTGRES_DSN = os.getenv("POSTGRES_DSN", "")

# Redis configuration (for Voting Service)
REDIS_URL = os.getenv("REDIS_URL", "")

# Legacy Jira config (used by Jira Service internally)
# These are passed to Jira Service, not used directly by gateway
JIRA_URL = os.getenv("JIRA_URL", "https://your-domain.atlassian.net")
JIRA_USERNAME = os.getenv("JIRA_USERNAME", "your-email@domain.com")
JIRA_API_TOKEN = os.getenv("JIRA_API_TOKEN", "YOUR_JIRA_API_TOKEN_HERE")
STORY_POINTS_FIELD = os.getenv("STORY_POINTS_FIELD", "customfield_10022")


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

    # Если чат не сконфигурирован — запрещаем
    if constraint is None:
        return False

    # Разрешаем любые треды, включая общий, только если явно указано ALL/пустой список
    if constraint["allow_all"]:
        return True

    # "Главный" чат без темы запрещён, если нет allow_all
    if topic_id is None:
        return False

    return topic_id in constraint["topics"]
