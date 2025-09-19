"""
Enhanced validation system
"""
import re
from typing import List, Optional, Dict, Any, Tuple, Union
from dataclasses import dataclass
from enum import Enum

from core.exceptions import ValidationError


class ValidationSeverity(Enum):
    """Validation severity levels"""
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


@dataclass
class ValidationIssue:
    """Validation issue details"""
    field: str
    message: str
    severity: ValidationSeverity
    code: Optional[str] = None
    suggestion: Optional[str] = None


def validate_chat_id(chat_id: int) -> Tuple[bool, Optional[str]]:
    """Validate chat ID"""
    if not isinstance(chat_id, int):
        return False, "Chat ID must be an integer"
    if chat_id >= 0:
        return False, "Chat ID must be negative for groups"
    return True, None


def validate_topic_id(topic_id: int) -> Tuple[bool, Optional[str]]:
    """Validate topic ID"""
    if not isinstance(topic_id, int):
        return False, "Topic ID must be an integer"
    if topic_id < 0:
        return False, "Topic ID must be non-negative"
    return True, None


def validate_user_id(user_id: int) -> Tuple[bool, Optional[str]]:
    """Validate user ID"""
    if not isinstance(user_id, int):
        return False, "User ID must be an integer"
    if user_id <= 0:
        return False, "User ID must be positive"
    return True, None


def validate_username(username: str) -> Tuple[bool, Optional[str]]:
    """Validate username"""
    if not username or not username.strip():
        return False, "Username cannot be empty"
    
    clean_username = username.lstrip('@')
    
    if not re.match(r'^[a-zA-Z0-9_]+$', clean_username):
        return False, "Username contains invalid characters"
    
    if len(clean_username) > 32:
        return False, "Username too long (max 32 characters)"
    
    return True, None


def validate_vote_value(value: str, scale: List[str]) -> Tuple[bool, Optional[str]]:
    """Validate vote value"""
    if not value or not value.strip():
        return False, "Vote value cannot be empty"
    
    # Check if value is in scale
    if value in scale:
        return True, None
    
    # Check special values
    special_values = ['?', '∞', 'coffee', 'break']
    if value.lower() in special_values:
        return True, None
    
    # Check numeric values
    try:
        float(value)
        return True, None
    except ValueError:
        pass
    
    return False, f"Invalid vote value: {value}"


def validate_task_text(text: str) -> Tuple[bool, Optional[str]]:
    """Validate task text"""
    if not text or not text.strip():
        return False, "Task text cannot be empty"
    
    if len(text.strip()) < 3:
        return False, "Task text too short (min 3 characters)"
    
    if len(text) > 1000:
        return False, "Task text too long (max 1000 characters)"
    
    return True, None


def validate_token(token: str) -> Tuple[bool, Optional[str]]:
    """Validate token"""
    if not token or not token.strip():
        return False, "Token cannot be empty"
    
    if len(token) < 8:
        return False, "Token too short (min 8 characters)"
    
    if len(token) > 50:
        return False, "Token too long (max 50 characters)"
    
    if not re.match(r'^[a-zA-Z0-9_-]+$', token):
        return False, "Token contains invalid characters"
    
    return True, None


def validate_timeout(timeout: int) -> Tuple[bool, Optional[str]]:
    """Validate timeout value"""
    if not isinstance(timeout, int):
        return False, "Timeout must be an integer"
    
    if timeout < 10:
        return False, "Timeout too short (min 10 seconds)"
    
    if timeout > 3600:
        return False, "Timeout too long (max 3600 seconds)"
    
    return True, None


def validate_scale(scale: List[str]) -> Tuple[bool, Optional[str]]:
    """Validate voting scale"""
    if not scale or len(scale) < 2:
        return False, "Scale must have at least 2 values"
    
    for value in scale:
        if not value or not value.strip():
            return False, "Scale values cannot be empty"
    
    return True, None
