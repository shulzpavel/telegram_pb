"""
Group configuration service implementation
"""
import logging
from typing import Optional
from aiogram import types

from core.interfaces import IGroupConfigService, IGroupConfigRepository, ITokenRepository
from domain.entities import DomainGroupConfig
from domain.value_objects import ChatId, TopicId, Username, Token
from core.exceptions import AuthorizationError

logger = logging.getLogger(__name__)


class GroupConfigService(IGroupConfigService):
    """Service for group configuration management"""
    
    def __init__(self, group_config_repository: IGroupConfigRepository, token_repository: ITokenRepository):
        self._group_config_repo = group_config_repository
        self._token_repo = token_repository
    
    def is_admin(self, chat_id: int, topic_id: int, user: types.User) -> bool:
        """Check if user is admin"""
        try:
            logger.info(f"IS_ADMIN: Checking admin status for user {user.id} ({user.username}) in {chat_id}_{topic_id}")
            
            # Check for super admin
            import os
            hard_admin = os.getenv('HARD_ADMIN', '').strip()
            logger.info(f"IS_ADMIN: HARD_ADMIN env var: '{hard_admin}'")
            
            if hard_admin and user.username and user.username.lower() == hard_admin.lower().lstrip('@'):
                logger.info(f"IS_ADMIN: User {user.username} is super admin")
                return True
            
            # Check group config
            group_config = self.get_group_config(chat_id, topic_id)
            if not group_config:
                logger.warning(f"IS_ADMIN: No group config found for {chat_id}_{topic_id}")
                return False
            
            logger.info(f"IS_ADMIN: Group config found, admins: {group_config.admins}")
            
            # Check if user is in admins list
            user_username = user.username or ""
            if user_username:
                # Try both with and without @ prefix
                user_username_with_at = f"@{user_username}"
                user_username_obj = Username(user_username)
                user_username_with_at_obj = Username(user_username_with_at)
                
                is_admin = group_config.is_admin(user_username_obj) or group_config.is_admin(user_username_with_at_obj)
                logger.info(f"IS_ADMIN: User {user_username} admin check: {is_admin}")
                return is_admin
            
            logger.info(f"IS_ADMIN: User has no username, not admin")
            return False
            
        except Exception as e:
            logger.error(f"IS_ADMIN: Error checking admin status: {e}", exc_info=True)
            return False
    
    def get_group_config(self, chat_id: int, topic_id: int) -> Optional[DomainGroupConfig]:
        """Get group configuration"""
        try:
            return self._group_config_repo.get_group_config(chat_id, topic_id)
        except Exception as e:
            logger.error(f"Error getting group config: {e}")
            return None
    
    def get_token(self, chat_id: int, topic_id: int) -> str:
        """Get token for group"""
        try:
            return self._token_repo.get_token(chat_id, topic_id)
        except Exception as e:
            logger.error(f"Error getting token: {e}")
            return ""
    
    def set_token(self, chat_id: int, topic_id: int, token: str) -> None:
        """Set token for group"""
        try:
            self._token_repo.set_token(chat_id, topic_id, token)
            logger.info(f"Set token for {chat_id}_{topic_id}")
        except Exception as e:
            logger.error(f"Error setting token: {e}")
            raise
    
    def get_today_history(self, chat_id: int, topic_id: int) -> list:
        """Get today's history for group"""
        try:
            # Get session service to access session history
            from core.bootstrap import bootstrap
            session_service = bootstrap.get_session_service()
            session = session_service.get_session(chat_id, topic_id)
            
            if not session:
                return []
            
            # Filter history for today
            from datetime import datetime, date
            today = date.today()
            today_history = []
            
            for task_result in session.history:
                try:
                    task_date = datetime.fromisoformat(task_result['timestamp']).date()
                    if task_date == today:
                        today_history.append(task_result)
                except (ValueError, KeyError):
                    continue
            
            logger.info(f"GET_TODAY_HISTORY: Found {len(today_history)} tasks for today in {chat_id}_{topic_id}")
            return today_history
            
        except Exception as e:
            logger.error(f"Error getting today history: {e}")
            return []
    
    def create_group_config(
        self, 
        chat_id: int, 
        topic_id: int, 
        admins: list = None,
        timeout: int = 90,
        scale: list = None,
        is_active: bool = True
    ) -> DomainGroupConfig:
        """Create group configuration"""
        try:
            from core.factories import GroupConfigFactory
            
            config = GroupConfigFactory.create(
                chat_id=chat_id,
                topic_id=topic_id,
                admins=admins or [],
                timeout=timeout,
                scale=scale or ['1', '2', '3', '5', '8', '13'],
                is_active=is_active
            )
            
            self._group_config_repo.save_group_config(config)
            logger.info(f"Created group config for {chat_id}_{topic_id}")
            return config
            
        except Exception as e:
            logger.error(f"Error creating group config: {e}")
            raise
    
    def update_group_config(self, config: DomainGroupConfig) -> None:
        """Update group configuration"""
        try:
            self._group_config_repo.save_group_config(config)
            logger.info(f"Updated group config for {config.chat_id.value}_{config.topic_id.value}")
        except Exception as e:
            logger.error(f"Error updating group config: {e}")
            raise
    
    def add_admin(self, chat_id: int, topic_id: int, username: str) -> bool:
        """Add admin to group"""
        try:
            config = self.get_group_config(chat_id, topic_id)
            if not config:
                logger.warning(f"No group config found for {chat_id}_{topic_id}")
                return False
            
            username_obj = Username(username)
            config.add_admin(username_obj)
            self.update_group_config(config)
            
            logger.info(f"Added admin {username} to {chat_id}_{topic_id}")
            return True
            
        except Exception as e:
            logger.error(f"Error adding admin: {e}")
            return False
    
    def remove_admin(self, chat_id: int, topic_id: int, username: str) -> bool:
        """Remove admin from group"""
        try:
            config = self.get_group_config(chat_id, topic_id)
            if not config:
                logger.warning(f"No group config found for {chat_id}_{topic_id}")
                return False
            
            username_obj = Username(username)
            success = config.remove_admin(username_obj)
            
            if success:
                self.update_group_config(config)
                logger.info(f"Removed admin {username} from {chat_id}_{topic_id}")
            
            return success
            
        except Exception as e:
            logger.error(f"Error removing admin: {e}")
            return False
    
    def validate_admin_access(self, chat_id: int, topic_id: int, user: types.User) -> None:
        """Validate admin access, raise exception if not admin"""
        if not self.is_admin(chat_id, topic_id, user):
            raise AuthorizationError(f"User {user.username or user.id} is not admin for {chat_id}_{topic_id}")
    
    def get_scale(self, chat_id: int, topic_id: int) -> list:
        """Get voting scale for group"""
        config = self.get_group_config(chat_id, topic_id)
        return config.scale if config else ['1', '2', '3', '5', '8', '13']
    
    def get_timeout(self, chat_id: int, topic_id: int) -> int:
        """Get timeout for group"""
        config = self.get_group_config(chat_id, topic_id)
        return config.timeout.value if config else 90
