"""
Group configuration repository implementation
"""
import json
import os
from typing import Optional, List
import logging

from core.interfaces import IGroupConfigRepository
from domain.entities import DomainGroupConfig
from domain.value_objects import ChatId, TopicId, Username, TimeoutSeconds
from core.factories import GroupConfigFactory

logger = logging.getLogger(__name__)


class GroupConfigRepository(IGroupConfigRepository):
    """Repository for group configuration management"""
    
    def __init__(self, data_dir: str = "data"):
        self.data_dir = data_dir
        self.config_file = os.path.join(data_dir, "group_configs.json")
        self._ensure_data_dir()
    
    def _ensure_data_dir(self) -> None:
        """Ensure data directory exists"""
        os.makedirs(self.data_dir, exist_ok=True)
    
    def _load_configs(self) -> List[dict]:
        """Load configurations from file"""
        try:
            if os.path.exists(self.config_file):
                with open(self.config_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
        except Exception as e:
            logger.error(f"Error loading group configs: {e}")
        return []
    
    def _save_configs(self, configs: List[dict]) -> None:
        """Save configurations to file"""
        try:
            with open(self.config_file, 'w', encoding='utf-8') as f:
                json.dump(configs, f, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.error(f"Error saving group configs: {e}")
            raise
    
    def get_group_config(self, chat_id: int, topic_id: int) -> Optional[DomainGroupConfig]:
        """Get group configuration"""
        configs = self._load_configs()
        
        for config_data in configs:
            if (config_data.get('chat_id') == chat_id and 
                config_data.get('topic_id') == topic_id):
                return GroupConfigFactory.from_dict(config_data)
        
        return None
    
    def save_group_config(self, config: DomainGroupConfig) -> None:
        """Save group configuration"""
        configs = self._load_configs()
        
        # Convert to dict
        config_dict = {
            'chat_id': config.chat_id.value,
            'topic_id': config.topic_id.value,
            'admins': [admin.value for admin in config.admins],
            'timeout': config.timeout.value,
            'scale': config.scale,
            'is_active': config.is_active,
            'created_at': config.created_at.isoformat()
        }
        
        # Update existing or add new
        updated = False
        for i, existing_config in enumerate(configs):
            if (existing_config.get('chat_id') == config.chat_id.value and 
                existing_config.get('topic_id') == config.topic_id.value):
                configs[i] = config_dict
                updated = True
                break
        
        if not updated:
            configs.append(config_dict)
        
        self._save_configs(configs)
        logger.debug(f"Saved group config: {config.chat_id.value}_{config.topic_id.value}")
