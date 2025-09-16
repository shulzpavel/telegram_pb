"""
Enhanced configuration parser for Planning Poker Bot

Supports multiple configuration formats:
1. JSON format (recommended)
2. Legacy format (backward compatibility)
3. Simple comma-separated format (DevOps friendly)
"""

import json
import os
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv

load_dotenv()


class ConfigParser:
    """Enhanced configuration parser"""
    
    def __init__(self):
        self.groups_config = []
        self._parse_config()
    
    def _parse_config(self) -> None:
        """Parse configuration from environment variables"""
        
        # Method 1: JSON Configuration (recommended)
        groups_config_str = os.getenv('GROUPS_CONFIG', '')
        if groups_config_str:
            try:
                self.groups_config = json.loads(groups_config_str)
                return
            except json.JSONDecodeError as e:
                print(f"Warning: Invalid JSON in GROUPS_CONFIG: {e}")
        
        # Method 2: Simple comma-separated format (DevOps friendly)
        if self._parse_simple_format():
            return
        
        # Method 3: Legacy format (backward compatibility)
        self._parse_legacy_format()
    
    def _parse_simple_format(self) -> bool:
        """Parse simple comma-separated format"""
        chat_ids_str = os.getenv('CHAT_IDS', '')
        topic_ids_str = os.getenv('TOPIC_IDS', '')
        admin_lists_str = os.getenv('ADMIN_LISTS', '')
        timeouts_str = os.getenv('TIMEOUTS', '')
        scales_str = os.getenv('SCALES', '')
        
        if not all([chat_ids_str, topic_ids_str, admin_lists_str]):
            return False
        
        try:
            chat_ids = [int(x.strip()) for x in chat_ids_str.split(',')]
            topic_ids = [int(x.strip()) for x in topic_ids_str.split(',')]
            admin_lists = [x.strip() for x in admin_lists_str.split(':')]
            timeouts = [int(x.strip()) for x in timeouts_str.split(',')] if timeouts_str else [90] * len(chat_ids)
            scales = [x.strip().split(',') for x in scales_str.split(':')] if scales_str else [['1', '2', '3', '5', '8', '13']] * len(chat_ids)
            
            # Ensure all lists have the same length
            max_len = max(len(chat_ids), len(topic_ids), len(admin_lists))
            
            for i in range(max_len):
                chat_id = chat_ids[i] if i < len(chat_ids) else chat_ids[0]
                topic_id = topic_ids[i] if i < len(topic_ids) else topic_ids[0]
                admins = admin_lists[i].split(',') if i < len(admin_lists) else admin_lists[0].split(',')
                timeout = timeouts[i] if i < len(timeouts) else timeouts[0]
                scale = scales[i] if i < len(scales) else scales[0]
                
                self.groups_config.append({
                    'chat_id': chat_id,
                    'topic_id': topic_id,
                    'admins': [admin.strip() for admin in admins],
                    'timeout': timeout,
                    'scale': [s.strip() for s in scale],
                    'is_active': True
                })
            
            return True
            
        except (ValueError, IndexError) as e:
            print(f"Warning: Error parsing simple format: {e}")
            return False
    
    def _parse_legacy_format(self) -> None:
        """Parse legacy format for backward compatibility"""
        allowed_chat_id = int(os.getenv('ALLOWED_CHAT_ID', '0'))
        allowed_topic_id = int(os.getenv('ALLOWED_TOPIC_ID', '0'))
        hard_admins_str = os.getenv('HARD_ADMINS', '')
        
        if allowed_chat_id:
            hard_admins = [admin.strip() for admin in hard_admins_str.split(',') if admin.strip()]
            
            self.groups_config = [{
                'chat_id': allowed_chat_id,
                'topic_id': allowed_topic_id,
                'admins': hard_admins,
                'timeout': int(os.getenv('DEFAULT_TIMEOUT', '90')),
                'scale': os.getenv('DEFAULT_SCALE', '1,2,3,5,8,13').split(','),
                'is_active': True
            }]
    
    def get_groups_config(self) -> List[Dict[str, Any]]:
        """Get parsed groups configuration"""
        return self.groups_config
    
    def validate_config(self) -> bool:
        """Validate configuration"""
        if not self.groups_config:
            print("Error: No groups configured")
            return False
        
        for i, group in enumerate(self.groups_config):
            required_fields = ['chat_id', 'topic_id', 'admins']
            for field in required_fields:
                if field not in group:
                    print(f"Error: Group {i} missing required field: {field}")
                    return False
            
            if not isinstance(group['admins'], list) or not group['admins']:
                print(f"Error: Group {i} has no admins")
                return False
        
        return True
    
    def print_config(self) -> None:
        """Print current configuration"""
        print("Current Groups Configuration:")
        print("=" * 50)
        
        for i, group in enumerate(self.groups_config):
            print(f"Group {i + 1}:")
            print(f"  Chat ID: {group['chat_id']}")
            print(f"  Topic ID: {group['topic_id']}")
            print(f"  Admins: {', '.join(group['admins'])}")
            print(f"  Timeout: {group.get('timeout', 90)}s")
            print(f"  Scale: {', '.join(group.get('scale', ['1', '2', '3', '5', '8', '13']))}")
            print(f"  Active: {group.get('is_active', True)}")
            print()


# Global instance
config_parser = ConfigParser()

# Export for backward compatibility
GROUPS_CONFIG = config_parser.get_groups_config()

if __name__ == "__main__":
    # Test configuration
    parser = ConfigParser()
    
    if parser.validate_config():
        print("✅ Configuration is valid")
        parser.print_config()
    else:
        print("❌ Configuration is invalid")
        exit(1)
