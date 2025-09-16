"""
Data validators using Pydantic
"""
from typing import List, Optional
from pydantic import BaseModel, Field, field_validator
import re


class ChatIdValidator(BaseModel):
    """Chat ID validator"""
    chat_id: int = Field(..., description="Chat ID")
    
    @field_validator('chat_id')
    @classmethod
    def validate_chat_id(cls, v):
        if not isinstance(v, int):
            raise ValueError('Chat ID must be an integer')
        if v >= 0:
            raise ValueError('Chat ID must be negative for groups')
        return v


class TopicIdValidator(BaseModel):
    """Topic ID validator"""
    topic_id: int = Field(..., description="Topic ID")
    
    @field_validator('topic_id')
    @classmethod
    def validate_topic_id(cls, v):
        if not isinstance(v, int):
            raise ValueError('Topic ID must be an integer')
        if v < 0:
            raise ValueError('Topic ID must be non-negative')
        return v


class UserIdValidator(BaseModel):
    """User ID validator"""
    user_id: int = Field(..., description="User ID")
    
    @field_validator('user_id')
    @classmethod
    def validate_user_id(cls, v):
        if not isinstance(v, int):
            raise ValueError('User ID must be an integer')
        if v <= 0:
            raise ValueError('User ID must be positive')
        return v


class TaskTextValidator(BaseModel):
    """Task text validator"""
    text: str = Field(..., min_length=1, max_length=1000, description="Task text")
    
    @field_validator('text')
    @classmethod
    def validate_text(cls, v):
        if not v.strip():
            raise ValueError('Task text cannot be empty')
        return v.strip()


class VoteValueValidator(BaseModel):
    """Vote value validator"""
    value: str = Field(..., description="Vote value")
    
    @field_validator('value')
    @classmethod
    def validate_vote_value(cls, v):
        if not v.strip():
            raise ValueError('Vote value cannot be empty')
        
        # Check if it's a valid vote (number or special values)
        valid_patterns = [
            r'^\d+$',  # Numbers
            r'^\d+\.\d+$',  # Decimals
            r'^[?∞]$',  # Special values
        ]
        
        if not any(re.match(pattern, v) for pattern in valid_patterns):
            raise ValueError(f'Invalid vote value: {v}')
        
        return v


class UsernameValidator(BaseModel):
    """Username validator"""
    username: str = Field(..., min_length=1, max_length=32, description="Username")
    
    @field_validator('username')
    @classmethod
    def validate_username(cls, v):
        # Remove @ symbol if present for validation
        clean_username = v.lstrip('@')
        if not re.match(r'^[a-zA-Z0-9_]+$', clean_username):
            raise ValueError('Username contains invalid characters')
        return v


class FullNameValidator(BaseModel):
    """Full name validator"""
    full_name: str = Field(..., min_length=1, max_length=100, description="Full name")
    
    @field_validator('full_name')
    @classmethod
    def validate_full_name(cls, v):
        if not v.strip():
            raise ValueError('Full name cannot be empty')
        return v.strip()


class TokenValidator(BaseModel):
    """Token validator"""
    token: str = Field(..., min_length=8, max_length=50, description="Token")
    
    @field_validator('token')
    @classmethod
    def validate_token(cls, v):
        if not re.match(r'^[a-zA-Z0-9_-]+$', v):
            raise ValueError('Token contains invalid characters')
        return v


class TimeoutValidator(BaseModel):
    """Timeout validator"""
    timeout: int = Field(..., ge=10, le=3600, description="Timeout in seconds")
    
    @field_validator('timeout')
    @classmethod
    def validate_timeout(cls, v):
        if not isinstance(v, int):
            raise ValueError('Timeout must be an integer')
        return v


class ScaleValidator(BaseModel):
    """Scale validator"""
    scale: List[str] = Field(..., min_length=1, description="Voting scale")
    
    @field_validator('scale')
    @classmethod
    def validate_scale(cls, v):
        if not v:
            raise ValueError('Scale cannot be empty')
        
        for value in v:
            VoteValueValidator(value=value)
        
        return v


class ParticipantValidator(BaseModel):
    """Participant validator"""
    user_id: int
    username: str
    full_name: str
    is_admin: bool = False
    
    @field_validator('user_id')
    @classmethod
    def validate_user_id(cls, v):
        return UserIdValidator(user_id=v).user_id
    
    @field_validator('username')
    @classmethod
    def validate_username(cls, v):
        return UsernameValidator(username=v).username
    
    @field_validator('full_name')
    @classmethod
    def validate_full_name(cls, v):
        return FullNameValidator(full_name=v).full_name


class TaskValidator(BaseModel):
    """Task validator"""
    text: str
    index: int = Field(..., ge=0, description="Task index")
    
    @field_validator('text')
    @classmethod
    def validate_text(cls, v):
        return TaskTextValidator(text=v).text


class VoteValidator(BaseModel):
    """Vote validator"""
    user_id: int
    value: str
    timestamp: str
    
    @field_validator('user_id')
    @classmethod
    def validate_user_id(cls, v):
        return UserIdValidator(user_id=v).user_id
    
    @field_validator('value')
    @classmethod
    def validate_value(cls, v):
        return VoteValueValidator(value=v).value


class GroupConfigValidator(BaseModel):
    """Group configuration validator"""
    chat_id: int
    topic_id: int
    admins: List[str] = Field(default_factory=list)
    timeout: int = 90
    scale: List[str] = Field(default_factory=lambda: ['1', '2', '3', '5', '8', '13'])
    is_active: bool = True
    
    @field_validator('chat_id')
    @classmethod
    def validate_chat_id(cls, v):
        return ChatIdValidator(chat_id=v).chat_id
    
    @field_validator('topic_id')
    @classmethod
    def validate_topic_id(cls, v):
        return TopicIdValidator(topic_id=v).topic_id
    
    @field_validator('admins')
    @classmethod
    def validate_admins(cls, v):
        for admin in v:
            UsernameValidator(username=admin)
        return v
    
    @field_validator('timeout')
    @classmethod
    def validate_timeout(cls, v):
        return TimeoutValidator(timeout=v).timeout
    
    @field_validator('scale')
    @classmethod
    def validate_scale(cls, v):
        return ScaleValidator(scale=v).scale


class FileUploadValidator(BaseModel):
    """File upload validator"""
    file_name: str
    file_size: int
    mime_type: str
    
    @field_validator('file_name')
    @classmethod
    def validate_file_name(cls, v):
        if not v:
            raise ValueError('File name cannot be empty')
        
        # Check file extension
        allowed_extensions = ['.xlsx', '.xls']
        if not any(v.lower().endswith(ext) for ext in allowed_extensions):
            raise ValueError('Only .xlsx and .xls files are allowed')
        
        return v
    
    @field_validator('file_size')
    @classmethod
    def validate_file_size(cls, v):
        max_size = 10 * 1024 * 1024  # 10MB
        if v > max_size:
            raise ValueError('File size too large (max 10MB)')
        return v
    
    @field_validator('mime_type')
    @classmethod
    def validate_mime_type(cls, v):
        allowed_types = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel'
        ]
        if v not in allowed_types:
            raise ValueError('Invalid file type')
        return v