"""
Token repository implementation
"""
import json
import os
from typing import Dict
import logging

from core.interfaces import ITokenRepository
from domain.value_objects import Token

logger = logging.getLogger(__name__)


class TokenRepository(ITokenRepository):
    """Repository for token management"""
    
    def __init__(self, data_dir: str = "data"):
        self.data_dir = data_dir
        self.tokens_file = os.path.join(data_dir, "tokens.json")
        self._ensure_data_dir()
    
    def _ensure_data_dir(self) -> None:
        """Ensure data directory exists"""
        os.makedirs(self.data_dir, exist_ok=True)
    
    def _load_tokens(self) -> Dict[str, str]:
        """Load tokens from file"""
        try:
            if os.path.exists(self.tokens_file):
                with open(self.tokens_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
        except Exception as e:
            logger.error(f"Error loading tokens: {e}")
        return {}
    
    def _save_tokens(self, tokens: Dict[str, str]) -> None:
        """Save tokens to file"""
        try:
            with open(self.tokens_file, 'w', encoding='utf-8') as f:
                json.dump(tokens, f, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.error(f"Error saving tokens: {e}")
            raise
    
    def get_token(self, chat_id: int, topic_id: int) -> str:
        """Get token for group"""
        tokens = self._load_tokens()
        key = f"{chat_id}_{topic_id}"
        group_token = tokens.get(key, "")
        
        # If no group-specific token exists, fall back to default token
        if not group_token:
            from config import DEFAULT_TOKEN
            return DEFAULT_TOKEN
        
        return group_token
    
    def set_token(self, chat_id: int, topic_id: int, token: str) -> None:
        """Set token for group"""
        try:
            # Validate token
            Token(token)
            
            tokens = self._load_tokens()
            key = f"{chat_id}_{topic_id}"
            tokens[key] = token
            self._save_tokens(tokens)
            
            logger.debug(f"Set token for {key}")
            
        except Exception as e:
            logger.error(f"Error setting token: {e}")
            raise
