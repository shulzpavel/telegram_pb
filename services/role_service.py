"""
Role service implementation
"""
import json
import os
import logging
from typing import Optional, Dict, List
from aiogram import types

from core.interfaces import IRoleService
from core.file_locks import file_lock
from domain.enums import ParticipantRole

logger = logging.getLogger(__name__)


class RoleService(IRoleService):
    """Service for managing user roles"""
    
    def __init__(self, data_dir: str = "data"):
        self.data_dir = data_dir
        self.roles_file = os.path.join(data_dir, "user_roles.json")
        self._ensure_data_dir()
        self._roles_cache: Dict[str, ParticipantRole] = {}
        self._load_roles()
    
    def _ensure_data_dir(self) -> None:
        """Ensure data directory exists"""
        os.makedirs(self.data_dir, exist_ok=True)
    
    def _load_roles(self) -> None:
        """Load roles from file with file locking"""
        try:
            if os.path.exists(self.roles_file):
                with file_lock(self.roles_file, 'r') as f:
                    roles_data = json.load(f)
                    for user_id, role_str in roles_data.items():
                        try:
                            self._roles_cache[user_id] = ParticipantRole(role_str)
                        except ValueError:
                            logger.warning(f"Invalid role '{role_str}' for user {user_id}")
        except Exception as e:
            logger.error(f"Error loading roles: {e}")
    
    def _save_roles(self) -> None:
        """Save roles to file with file locking"""
        try:
            roles_data = {user_id: role.value for user_id, role in self._roles_cache.items()}
            with file_lock(self.roles_file, 'w') as f:
                json.dump(roles_data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.error(f"Error saving roles: {e}")
            raise
    
    def get_user_role(self, user: types.User) -> ParticipantRole:
        """Get user role"""
        user_id = str(user.id)
        
        # Check cache first
        if user_id in self._roles_cache:
            return self._roles_cache[user_id]
        
        # Default role is PARTICIPANT
        return ParticipantRole.PARTICIPANT
    
    def set_user_role(self, user: types.User, role: ParticipantRole) -> bool:
        """Set user role"""
        try:
            user_id = str(user.id)
            self._roles_cache[user_id] = role
            self._save_roles()
            logger.info(f"Set role {role.value} for user {user_id}")
            return True
        except Exception as e:
            logger.error(f"Error setting role: {e}")
            return False
    
    def can_vote(self, user: types.User) -> bool:
        """Check if user can vote"""
        role = self.get_user_role(user)
        # PARTICIPANT and LEAD can vote, ADMIN and SUPER_ADMIN cannot
        return role in [ParticipantRole.PARTICIPANT, ParticipantRole.LEAD]
    
    def can_manage_session(self, user: types.User) -> bool:
        """Check if user can manage session (admin rights)"""
        role = self.get_user_role(user)
        # LEAD, ADMIN and SUPER_ADMIN can manage sessions
        return role in [ParticipantRole.LEAD, ParticipantRole.ADMIN, ParticipantRole.SUPER_ADMIN]
    
    def should_include_in_calculations(self, user: types.User) -> bool:
        """Check if user should be included in vote calculations"""
        role = self.get_user_role(user)
        # PARTICIPANT and LEAD are included, ADMIN and SUPER_ADMIN are excluded
        return role in [ParticipantRole.PARTICIPANT, ParticipantRole.LEAD]
    
    def get_all_roles(self) -> Dict[str, str]:
        """Get all user roles"""
        return {user_id: role.value for user_id, role in self._roles_cache.items()}
    
    def get_users_by_role(self, role: ParticipantRole) -> List[str]:
        """Get all users with specific role"""
        return [user_id for user_id, user_role in self._roles_cache.items() if user_role == role]
