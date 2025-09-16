"""
Configuration module for Planning Poker Bot.

Handles environment variables, default settings, and group configurations.
"""

import json
import os
from typing import Any, Dict, List

from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Telegram Bot Configuration
BOT_TOKEN: str = os.getenv('BOT_TOKEN', '')

# Default Settings
DEFAULT_TIMEOUT: int = 90
DEFAULT_SCALE: List[str] = ['1', '2', '3', '5', '8', '13']

# Legacy Configuration (for backward compatibility)
ALLOWED_CHAT_ID: int = int(os.getenv('ALLOWED_CHAT_ID', '0'))
ALLOWED_TOPIC_ID: int = int(os.getenv('ALLOWED_TOPIC_ID', '0'))

# Admin Configuration
HARD_ADMIN: str = os.getenv('HARD_ADMIN', '')
HARD_ADMINS_STR: str = os.getenv('HARD_ADMINS', '')
HARD_ADMINS: List[str] = [
    admin.strip() for admin in HARD_ADMINS_STR.split(',') if admin.strip()
]

# Default Token
DEFAULT_TOKEN: str = os.getenv('DEFAULT_TOKEN', 'magic_token')

# Jira Integration
JIRA_BASE_URL: str = os.getenv('JIRA_BASE_URL', 'https://media-life.atlassian.net')
JIRA_EMAIL: str = os.getenv('JIRA_EMAIL', '')
JIRA_TOKEN: str = os.getenv('JIRA_TOKEN', '')

# Groups Configuration
try:
    from config_parser import GROUPS_CONFIG
except ImportError:
    # Fallback to simple parsing
    GROUPS_CONFIG_STR: str = os.getenv('GROUPS_CONFIG', '')
    GROUPS_CONFIG: List[Dict[str, Any]] = []

    if GROUPS_CONFIG_STR:
        try:
            GROUPS_CONFIG = json.loads(GROUPS_CONFIG_STR)
        except json.JSONDecodeError:
            GROUPS_CONFIG = []

    # Fallback to legacy configuration if no groups configured
    if not GROUPS_CONFIG and ALLOWED_CHAT_ID:
        GROUPS_CONFIG = [{
            'chat_id': ALLOWED_CHAT_ID,
            'topic_id': ALLOWED_TOPIC_ID,
            'admins': HARD_ADMINS,
            'timeout': DEFAULT_TIMEOUT,
            'scale': DEFAULT_SCALE,
            'is_active': True
        }]

# Application Settings
DATA_DIR: str = os.getenv('DATA_DIR', 'data')
LOG_LEVEL: str = os.getenv('LOG_LEVEL', 'DEBUG')
CLEANUP_DAYS: int = int(os.getenv('CLEANUP_DAYS', '7'))