"""
Value Objects for domain modeling
"""
from dataclasses import dataclass
from typing import Union
import re


@dataclass(frozen=True)
class ChatId:
    """Chat ID value object"""
    value: int
    
    def __post_init__(self):
        if not isinstance(self.value, int):
            raise ValueError("Chat ID must be an integer")
        if self.value >= 0:
            raise ValueError("Chat ID must be negative for groups")


@dataclass(frozen=True)
class TopicId:
    """Topic ID value object"""
    value: int
    
    def __post_init__(self):
        if not isinstance(self.value, int):
            raise ValueError("Topic ID must be an integer")
        if self.value < 0:
            raise ValueError("Topic ID must be non-negative")


@dataclass(frozen=True)
class UserId:
    """User ID value object"""
    value: int
    
    def __post_init__(self):
        if not isinstance(self.value, int):
            raise ValueError("User ID must be an integer")
        if self.value <= 0:
            raise ValueError("User ID must be positive")


@dataclass(frozen=True)
class TaskText:
    """Task text value object"""
    value: str
    
    def __post_init__(self):
        if not isinstance(self.value, str):
            raise ValueError("Task text must be a string")
        if not self.value.strip():
            raise ValueError("Task text cannot be empty")
        if len(self.value) > 1000:
            raise ValueError("Task text too long (max 1000 characters)")


@dataclass(frozen=True)
class VoteValue:
    """Vote value object"""
    value: str
    
    def __post_init__(self):
        if not isinstance(self.value, str):
            raise ValueError("Vote value must be a string")
        if not self.value.strip():
            raise ValueError("Vote value cannot be empty")
        
        # Check if it's a valid vote (number or special values)
        valid_patterns = [
            r'^\d+$',  # Numbers
            r'^\d+\.\d+$',  # Decimals
            r'^[?∞]$',  # Special values
        ]
        
        if not any(re.match(pattern, self.value) for pattern in valid_patterns):
            raise ValueError(f"Invalid vote value: {self.value}")


@dataclass(frozen=True)
class SessionKey:
    """Session key value object"""
    chat_id: ChatId
    topic_id: TopicId
    
    @property
    def value(self) -> str:
        return f"{self.chat_id.value}_{self.topic_id.value}"
    
    @classmethod
    def from_string(cls, key: str) -> 'SessionKey':
        """Create from string key"""
        try:
            chat_id_str, topic_id_str = key.split('_', 1)
            return cls(
                chat_id=ChatId(int(chat_id_str)),
                topic_id=TopicId(int(topic_id_str))
            )
        except (ValueError, IndexError) as e:
            raise ValueError(f"Invalid session key format: {key}") from e


@dataclass(frozen=True)
class TimeoutSeconds:
    """Timeout in seconds value object"""
    value: int
    
    def __post_init__(self):
        if not isinstance(self.value, int):
            raise ValueError("Timeout must be an integer")
        if self.value < 10:
            raise ValueError("Timeout must be at least 10 seconds")
        if self.value > 3600:
            raise ValueError("Timeout cannot exceed 1 hour")


@dataclass(frozen=True)
class Token:
    """Token value object"""
    value: str
    
    def __post_init__(self):
        if not isinstance(self.value, str):
            raise ValueError("Token must be a string")
        if len(self.value) < 8:
            raise ValueError("Token must be at least 8 characters")
        if len(self.value) > 50:
            raise ValueError("Token too long (max 50 characters)")
        if not re.match(r'^[a-zA-Z0-9_-]+$', self.value):
            raise ValueError("Token contains invalid characters")


@dataclass(frozen=True)
class Username:
    """Username value object"""
    value: str
    
    def __post_init__(self):
        if not isinstance(self.value, str):
            raise ValueError("Username must be a string")
        if not self.value.strip():
            raise ValueError("Username cannot be empty")
        # Remove @ symbol if present for validation
        clean_username = self.value.lstrip('@')
        if not re.match(r'^[a-zA-Z0-9_]+$', clean_username):
            raise ValueError("Username contains invalid characters")
        if len(self.value) > 32:
            raise ValueError("Username too long (max 32 characters)")


@dataclass(frozen=True)
class FullName:
    """Full name value object"""
    value: str
    
    def __post_init__(self):
        if not isinstance(self.value, str):
            raise ValueError("Full name must be a string")
        if not self.value.strip():
            raise ValueError("Full name cannot be empty")
        if len(self.value) > 100:
            raise ValueError("Full name too long (max 100 characters)")


@dataclass(frozen=True)
class PauseDuration:
    """Pause duration value object"""
    value: int  # seconds
    
    def __post_init__(self):
        if not isinstance(self.value, int):
            raise ValueError("Pause duration must be an integer")
        if self.value < 0:
            raise ValueError("Pause duration cannot be negative")
        if self.value > 86400:  # 24 hours
            raise ValueError("Pause duration too long (max 24 hours)")


@dataclass(frozen=True)
class VoteDiscrepancy:
    """Vote discrepancy value object"""
    min_vote: float
    max_vote: float
    discrepancy_ratio: float
    
    def __post_init__(self):
        if not isinstance(self.min_vote, (int, float)):
            raise ValueError("Min vote must be a number")
        if not isinstance(self.max_vote, (int, float)):
            raise ValueError("Max vote must be a number")
        if self.min_vote < 0 or self.max_vote < 0:
            raise ValueError("Votes cannot be negative")
        if self.min_vote > self.max_vote:
            raise ValueError("Min vote cannot be greater than max vote")
        if not isinstance(self.discrepancy_ratio, (int, float)):
            raise ValueError("Discrepancy ratio must be a number")
        if self.discrepancy_ratio < 0:
            raise ValueError("Discrepancy ratio cannot be negative")
    
    @property
    def is_significant(self) -> bool:
        """Check if discrepancy is significant (ratio > 3)"""
        return self.discrepancy_ratio > 3.0
