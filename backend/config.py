import os
from enum import Enum


class UserRole(Enum):
    PARTICIPANT = "participant"
    LEAD = "lead"
    ADMIN = "admin"


# Role tokens
USER_TOKEN = os.getenv("USER_TOKEN", "user_token")
LEAD_TOKEN = os.getenv("LEAD_TOKEN", "lead_token")
ADMIN_TOKEN = os.getenv("ADMIN_TOKEN", "admin_token")

# Microservices configuration (REQUIRED)
JIRA_SERVICE_URL = os.getenv("JIRA_SERVICE_URL", "http://localhost:8001")
VOTING_SERVICE_URL = os.getenv("VOTING_SERVICE_URL", "http://localhost:8002")

# Postgres metrics storage
POSTGRES_DSN = os.getenv("POSTGRES_DSN", "")

# Instruction URL (shown in welcome message)
INSTRUCTION_URL = os.getenv("INSTRUCTION_URL", "https://www.youtube.com/watch?v=dQw4w9WgXcQ")

# Redis configuration (for Voting Service)
REDIS_URL = os.getenv("REDIS_URL", "")

# Legacy Jira config (used by Jira Service internally)
JIRA_URL = os.getenv("JIRA_URL", "https://your-domain.atlassian.net")
JIRA_USERNAME = os.getenv("JIRA_USERNAME", "your-email@domain.com")
JIRA_API_TOKEN = os.getenv("JIRA_API_TOKEN", "YOUR_JIRA_API_TOKEN_HERE")
STORY_POINTS_FIELD = os.getenv("STORY_POINTS_FIELD", "customfield_10022")

# Web UI base URL (e.g. https://poker.example.com); leave empty to disable web links
WEB_UI_URL = os.getenv("WEB_UI_URL", "")
