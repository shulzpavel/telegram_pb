"""
Interfaces (Protocols) for dependency injection
"""
from abc import ABC, abstractmethod
from typing import Protocol, List, Optional, Dict, Any
from datetime import datetime
from aiogram import types

from domain.entities import DomainSession as Session, DomainParticipant as Participant
from models import GroupConfig
from domain.entities import DomainSession, DomainParticipant, DomainTask


class ISessionRepository(Protocol):
    """Repository interface for session management"""
    
    def get_session(self, chat_id: int, topic_id: int) -> DomainSession:
        """Get or create session"""
        ...
    
    def save_session(self, session: DomainSession) -> None:
        """Save session"""
        ...
    
    def get_today_history(self, chat_id: int, topic_id: int) -> List[Dict[str, Any]]:
        """Get history for today"""
        ...
    
    def cleanup_old_sessions(self, days: int = 7) -> None:
        """Cleanup old sessions"""
        ...


class IGroupConfigRepository(Protocol):
    """Repository interface for group configuration"""
    
    def get_group_config(self, chat_id: int, topic_id: int) -> Optional[GroupConfig]:
        """Get group configuration"""
        ...
    
    def save_group_config(self, config: GroupConfig) -> None:
        """Save group configuration"""
        ...


class ITokenRepository(Protocol):
    """Repository interface for token management"""
    
    def get_token(self, chat_id: int, topic_id: int) -> str:
        """Get token for group"""
        ...
    
    def set_token(self, chat_id: int, topic_id: int, token: str) -> None:
        """Set token for group"""
        ...


class ISessionService(Protocol):
    """Service interface for session management"""
    
    def get_session(self, chat_id: int, topic_id: int) -> DomainSession:
        """Get session"""
        ...
    
    def save_session(self, session: DomainSession) -> None:
        """Save session"""
        ...
    
    def add_participant(self, chat_id: int, topic_id: int, user: types.User) -> bool:
        """Add participant"""
        ...
    
    def remove_participant(self, chat_id: int, topic_id: int, user_id: int) -> Optional[Participant]:
        """Remove participant"""
        ...
    
    def start_voting_session(self, chat_id: int, topic_id: int, tasks: List[str]) -> bool:
        """Start voting session"""
        ...
    
    def add_vote(self, chat_id: int, topic_id: int, user_id: int, value: str) -> bool:
        """Add vote"""
        ...
    
    def is_all_voted(self, chat_id: int, topic_id: int) -> bool:
        """Check if all voted"""
        ...
    
    def complete_current_task(self, chat_id: int, topic_id: int) -> bool:
        """Complete current task"""
        ...
    
    def get_current_batch_info(self, chat_id: int, topic_id: int) -> tuple:
        """Get current batch information"""
        ...
    
    def get_total_all_tasks_count(self, chat_id: int, topic_id: int) -> int:
        """Get total number of tasks"""
        ...


class ITimerService(Protocol):
    """Service interface for timer management"""
    
    def start_vote_timer(self, chat_id: int, topic_id: int, message: types.Message) -> None:
        """Start vote timer"""
        ...
    
    def extend_timer(self, chat_id: int, topic_id: int, seconds: int) -> None:
        """Extend timer"""
        ...
    
    async def finish_voting(self, chat_id: int, topic_id: int, message: types.Message) -> None:
        """Finish voting"""
        ...
    
    async def _start_next_task(self, chat_id: int, topic_id: int, message: types.Message) -> None:
        """Start next voting task"""
        ...


class IGroupConfigService(Protocol):
    """Service interface for group configuration"""
    
    def is_admin(self, chat_id: int, topic_id: int, user: types.User) -> bool:
        """Check if user is admin"""
        ...
    
    def get_group_config(self, chat_id: int, topic_id: int) -> Optional[GroupConfig]:
        """Get group configuration"""
        ...
    
    def get_token(self, chat_id: int, topic_id: int) -> str:
        """Get token for group"""
        ...
    
    def set_token(self, chat_id: int, topic_id: int, token: str) -> None:
        """Set token for group"""
        ...
    
    def update_group_config(self, config: 'GroupConfig') -> None:
        """Update group configuration"""
        ...
    
    def get_today_history(self, chat_id: int, topic_id: int) -> list:
        """Get today's voting history"""
        ...


class IFileParser(Protocol):
    """Interface for file parsing"""
    
    def parse_text(self, text: str) -> List[str]:
        """Parse text into tasks"""
        ...
    
    def parse_xlsx(self, file_path: str) -> List[str]:
        """Parse xlsx file into tasks"""
        ...


class IMessageService(Protocol):
    """Service interface for message handling"""
    
    async def send_message(
        self, 
        message_func, 
        text: str, 
        reply_markup=None,
        parse_mode=None,
        **kwargs
    ) -> Optional[types.Message]:
        """Send message safely"""
        ...
    
    async def edit_message(
        self, 
        bot, 
        chat_id: int, 
        message_id: int, 
        text: str, 
        reply_markup=None,
        **kwargs
    ) -> bool:
        """Edit message safely"""
        ...
    
    async def answer_callback(
        self, 
        callback_query, 
        text: str, 
        show_alert: bool = False
    ) -> None:
        """Answer callback safely"""
        ...


class ISessionControlService(Protocol):
    """Service interface for session control (pause and revoting)"""
    
    def check_batch_completion(self, chat_id: int, topic_id: int) -> bool:
        """Check if current batch is complete and handle accordingly"""
        ...
    
    def pause_session(self, chat_id: int, topic_id: int, reason: str = "admin_request") -> bool:
        """Pause the session"""
        ...
    
    def resume_session(self, chat_id: int, topic_id: int) -> bool:
        """Resume the session"""
        ...
    
    def start_revoting(self, chat_id: int, topic_id: int, task_indices: List[int]) -> bool:
        """Start revoting for specified tasks"""
        ...
    
    def add_revoting_vote(self, chat_id: int, topic_id: int, user_id: int, vote_value: str) -> bool:
        """Add vote during revoting"""
        ...
    
    def is_revoting_all_voted(self, chat_id: int, topic_id: int) -> bool:
        """Check if all participants voted in revoting"""
        ...
    
    def complete_revoting_task(self, chat_id: int, topic_id: int) -> bool:
        """Complete current revoting task"""
        ...
    
    def get_revoting_status(self, chat_id: int, topic_id: int) -> Dict[str, Any]:
        """Get revoting status information"""
        ...
    
    def get_pause_status(self, chat_id: int, topic_id: int) -> Dict[str, Any]:
        """Get pause status information"""
        ...
    
    def analyze_session_for_revoting(self, chat_id: int, topic_id: int) -> List[Dict[str, Any]]:
        """Analyze entire session for tasks needing revoting"""
        ...
    
    def get_batch_progress(self, chat_id: int, topic_id: int) -> Dict[str, Any]:
        """Get current batch progress information"""
        ...
