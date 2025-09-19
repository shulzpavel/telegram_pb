"""
Core interfaces for dependency injection
"""
from abc import ABC, abstractmethod
from typing import List, Optional, Dict, Any, Protocol, TypeVar
from aiogram import types

from domain.entities import DomainSession, DomainParticipant, DomainTask, DomainGroupConfig
from domain.value_objects import ChatId, TopicId, UserId, TaskText, VoteValue, Username, FullName
from domain.enums import ParticipantRole
from core.types import (
    ChatIdType, TopicIdType, UserIdType, TaskTextType, VoteValueType,
    HandlerResponse, ValidationResult, SessionStats, VoteScale
)


class ISessionRepository(ABC):
    """Session repository interface"""
    
    @abstractmethod
    def get_session(self, chat_id: int, topic_id: int) -> DomainSession:
        pass
    
    @abstractmethod
    def save_session(self, session: DomainSession) -> None:
        pass


class IGroupConfigRepository(ABC):
    """Group configuration repository interface"""
    
    @abstractmethod
    def get_group_config(self, chat_id: int, topic_id: int) -> Optional[DomainGroupConfig]:
        pass
    
    @abstractmethod
    def save_group_config(self, config: DomainGroupConfig) -> None:
        pass
    
    @abstractmethod
    def get_all_group_configs(self) -> List[DomainGroupConfig]:
        pass


class ITokenRepository(ABC):
    """Token repository interface"""
    
    @abstractmethod
    def get_token(self, chat_id: int, topic_id: int) -> str:
        pass
    
    @abstractmethod
    def set_token(self, chat_id: int, topic_id: int, token: str) -> None:
        pass


class ISessionService(ABC):
    """Session service interface"""
    
    @abstractmethod
    def get_session(self, chat_id: int, topic_id: int) -> DomainSession:
        pass
    
    @abstractmethod
    def save_session(self, session: DomainSession) -> None:
        pass
    
    @abstractmethod
    def add_participant(self, chat_id: int, topic_id: int, user: types.User) -> bool:
        pass
    
    @abstractmethod
    def remove_participant(self, chat_id: int, topic_id: int, user_id: int) -> Optional[DomainParticipant]:
        pass
    
    @abstractmethod
    def start_voting_session(self, chat_id: int, topic_id: int, tasks: List[str]) -> bool:
        pass
    
    @abstractmethod
    def add_vote(self, chat_id: int, topic_id: int, user_id: int, value: str) -> bool:
        pass
    
    @abstractmethod
    def is_all_voted(self, chat_id: int, topic_id: int) -> bool:
        pass
    
    @abstractmethod
    def complete_current_task(self, chat_id: int, topic_id: int) -> bool:
        pass
    
    @abstractmethod
    def get_current_task(self, chat_id: int, topic_id: int) -> Optional[DomainTask]:
        pass
    
    @abstractmethod
    def get_not_voted_participants(self, chat_id: int, topic_id: int) -> List[DomainParticipant]:
        pass
    
    @abstractmethod
    def finish_voting_session(self, chat_id: int, topic_id: int) -> None:
        pass
    
    @abstractmethod
    def get_current_batch_info(self, chat_id: int, topic_id: int) -> tuple:
        pass
    
    @abstractmethod
    def get_total_all_tasks_count(self, chat_id: int, topic_id: int) -> int:
        pass
    
    @abstractmethod
    def get_session_stats(self, chat_id: int, topic_id: int) -> dict:
        pass


class IGroupConfigService(ABC):
    """Group configuration service interface"""
    
    @abstractmethod
    def get_group_config(self, chat_id: int, topic_id: int) -> Optional[DomainGroupConfig]:
        pass
    
    @abstractmethod
    def create_group_config(self, chat_id: int, topic_id: int, admins: List[str], 
                          timeout: int = 90, scale: Optional[List[str]] = None, is_active: bool = True) -> bool:
        pass
    
    @abstractmethod
    def update_group_config(self, config: DomainGroupConfig) -> None:
        pass
    
    @abstractmethod
    def is_admin(self, chat_id: int, topic_id: int, user: types.User) -> bool:
        pass
    
    @abstractmethod
    def get_token(self, chat_id: int, topic_id: int) -> str:
        pass
    
    @abstractmethod
    def set_token(self, chat_id: int, topic_id: int, token: str) -> None:
        pass
    
    @abstractmethod
    def get_today_history(self, chat_id: int, topic_id: int) -> List[Dict[str, Any]]:
        pass


class ITimerService(ABC):
    """Timer service interface"""
    
    @abstractmethod
    def start_vote_timer(self, chat_id: int, topic_id: int, message: types.Message) -> None:
        pass
    
    @abstractmethod
    def extend_timer(self, chat_id: int, topic_id: int, seconds: int) -> None:
        pass
    
    @abstractmethod
    def finish_voting(self, chat_id: int, topic_id: int, message: types.Message) -> None:
        pass
    
    @abstractmethod
    def cancel_timers(self, chat_id: int, topic_id: int) -> None:
        pass


class IMessageService(ABC):
    """Message service interface"""
    
    @abstractmethod
    async def send_message(self, message_func, text: str, reply_markup=None, 
                          parse_mode=None, **kwargs) -> Optional[types.Message]:
        pass
    
    @abstractmethod
    async def edit_message(self, bot, chat_id: int, message_id: int, text: str, 
                          reply_markup=None, **kwargs) -> bool:
        pass
    
    @abstractmethod
    async def answer_callback(self, callback_query, text: str, show_alert: bool = False) -> None:
        pass


class IFileParser(ABC):
    """File parser interface"""
    
    @abstractmethod
    def parse_text(self, text: str) -> List[str]:
        pass
    
    @abstractmethod
    def parse_xlsx(self, file_path: str) -> List[str]:
        pass


class ISessionControlService(ABC):
    """Session control service interface"""
    
    @abstractmethod
    def check_batch_completion(self, chat_id: int, topic_id: int) -> bool:
        pass
    
    @abstractmethod
    def pause_session(self, chat_id: int, topic_id: int, reason: str = "admin_request") -> bool:
        pass
    
    @abstractmethod
    def resume_session(self, chat_id: int, topic_id: int) -> bool:
        pass
    
    @abstractmethod
    def get_batch_progress(self, chat_id: int, topic_id: int) -> Dict[str, Any]:
        pass


class IRoleService(ABC):
    """Role service interface"""
    
    @abstractmethod
    def get_user_role(self, user: types.User) -> ParticipantRole:
        pass
    
    @abstractmethod
    def set_user_role(self, user: types.User, role: ParticipantRole) -> bool:
        pass
    
    @abstractmethod
    def can_vote(self, user: types.User) -> bool:
        pass
    
    @abstractmethod
    def can_manage_session(self, user: types.User) -> bool:
        pass
    
    @abstractmethod
    def should_include_in_calculations(self, user: types.User) -> bool:
        pass
    
    @abstractmethod
    def get_all_roles(self) -> Dict[str, str]:
        pass
    
    @abstractmethod
    def get_users_by_role(self, role: ParticipantRole) -> List[str]:
        pass