"""
Configuration management system
"""
import os
import json
import logging
from typing import Dict, Any, Optional, Union, List
from dataclasses import dataclass, field
from pathlib import Path

logger = logging.getLogger(__name__)


@dataclass
class DatabaseConfig:
    """Database configuration"""
    host: str = "localhost"
    port: int = 5432
    name: str = "planning_poker"
    user: str = "postgres"
    password: str = ""
    pool_size: int = 10
    max_overflow: int = 20


@dataclass
class RedisConfig:
    """Redis configuration"""
    host: str = "localhost"
    port: int = 6379
    db: int = 0
    password: Optional[str] = None
    max_connections: int = 10


@dataclass
class LoggingConfig:
    """Logging configuration"""
    level: str = "INFO"
    format: str = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    file_path: Optional[str] = None
    max_size: int = 10 * 1024 * 1024  # 10MB
    backup_count: int = 5


@dataclass
class SecurityConfig:
    """Security configuration"""
    secret_key: str = ""
    token_expiry: int = 3600  # 1 hour
    max_login_attempts: int = 5
    lockout_duration: int = 900  # 15 minutes
    require_https: bool = True


@dataclass
class BotConfig:
    """Bot configuration"""
    token: str = ""
    webhook_url: Optional[str] = None
    webhook_port: int = 8080
    max_connections: int = 100
    timeout: int = 30


@dataclass
class AppConfig:
    """Application configuration"""
    debug: bool = False
    environment: str = "production"
    data_dir: str = "data"
    backup_dir: str = "backups"
    max_file_size: int = 10 * 1024 * 1024  # 10MB
    cleanup_interval: int = 3600  # 1 hour


class ConfigManager:
    """Configuration manager"""
    
    def __init__(self, config_file: Optional[str] = None):
        self.config_file = config_file or "config.json"
        self.config: Dict[str, Any] = {}
        self._load_config()
    
    def _load_config(self) -> None:
        """Load configuration from file and environment"""
        # Load from file if exists
        if os.path.exists(self.config_file):
            try:
                with open(self.config_file, 'r', encoding='utf-8') as f:
                    self.config = json.load(f)
                logger.info(f"Loaded configuration from {self.config_file}")
            except Exception as e:
                logger.error(f"Failed to load config file: {e}")
                self.config = {}
        
        # Override with environment variables
        self._load_from_env()
        
        # Set defaults
        self._set_defaults()
    
    def _load_from_env(self) -> None:
        """Load configuration from environment variables"""
        env_mappings = {
            'BOT_TOKEN': 'bot.token',
            'DATABASE_URL': 'database.url',
            'REDIS_URL': 'redis.url',
            'LOG_LEVEL': 'logging.level',
            'DEBUG': 'app.debug',
            'DATA_DIR': 'app.data_dir',
            'SECRET_KEY': 'security.secret_key',
        }
        
        for env_var, config_path in env_mappings.items():
            value = os.getenv(env_var)
            if value is not None:
                self._set_nested_value(config_path, value)
    
    def _set_nested_value(self, path: str, value: Any) -> None:
        """Set nested configuration value"""
        keys = path.split('.')
        current = self.config
        
        for key in keys[:-1]:
            if key not in current:
                current[key] = {}
            current = current[key]
        
        # Convert string values to appropriate types
        if value.lower() in ('true', 'false'):
            value = value.lower() == 'true'
        elif value.isdigit():
            value = int(value)
        elif value.replace('.', '').isdigit():
            value = float(value)
        
        current[keys[-1]] = value
    
    def _set_defaults(self) -> None:
        """Set default configuration values"""
        defaults = {
            'app': {
                'debug': False,
                'environment': 'production',
                'data_dir': 'data',
                'backup_dir': 'backups',
                'max_file_size': 10 * 1024 * 1024,
                'cleanup_interval': 3600
            },
            'bot': {
                'token': '',
                'webhook_url': None,
                'webhook_port': 8080,
                'max_connections': 100,
                'timeout': 30
            },
            'database': {
                'host': 'localhost',
                'port': 5432,
                'name': 'planning_poker',
                'user': 'postgres',
                'password': '',
                'pool_size': 10,
                'max_overflow': 20
            },
            'redis': {
                'host': 'localhost',
                'port': 6379,
                'db': 0,
                'password': None,
                'max_connections': 10
            },
            'logging': {
                'level': 'INFO',
                'format': '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
                'file_path': None,
                'max_size': 10 * 1024 * 1024,
                'backup_count': 5
            },
            'security': {
                'secret_key': '',
                'token_expiry': 3600,
                'max_login_attempts': 5,
                'lockout_duration': 900,
                'require_https': True
            }
        }
        
        for section, values in defaults.items():
            if section not in self.config:
                self.config[section] = {}
            for key, value in values.items():
                if key not in self.config[section]:
                    self.config[section][key] = value
    
    def get(self, key: str, default: Any = None) -> Any:
        """Get configuration value"""
        keys = key.split('.')
        current = self.config
        
        try:
            for k in keys:
                current = current[k]
            return current
        except (KeyError, TypeError):
            return default
    
    def set(self, key: str, value: Any) -> None:
        """Set configuration value"""
        self._set_nested_value(key, value)
    
    def save(self) -> None:
        """Save configuration to file"""
        try:
            with open(self.config_file, 'w', encoding='utf-8') as f:
                json.dump(self.config, f, indent=2, ensure_ascii=False)
            logger.info(f"Saved configuration to {self.config_file}")
        except Exception as e:
            logger.error(f"Failed to save config: {e}")
    
    def get_database_config(self) -> DatabaseConfig:
        """Get database configuration"""
        db_config = self.get('database', {})
        return DatabaseConfig(
            host=db_config.get('host', 'localhost'),
            port=db_config.get('port', 5432),
            name=db_config.get('name', 'planning_poker'),
            user=db_config.get('user', 'postgres'),
            password=db_config.get('password', ''),
            pool_size=db_config.get('pool_size', 10),
            max_overflow=db_config.get('max_overflow', 20)
        )
    
    def get_redis_config(self) -> RedisConfig:
        """Get Redis configuration"""
        redis_config = self.get('redis', {})
        return RedisConfig(
            host=redis_config.get('host', 'localhost'),
            port=redis_config.get('port', 6379),
            db=redis_config.get('db', 0),
            password=redis_config.get('password'),
            max_connections=redis_config.get('max_connections', 10)
        )
    
    def get_logging_config(self) -> LoggingConfig:
        """Get logging configuration"""
        log_config = self.get('logging', {})
        return LoggingConfig(
            level=log_config.get('level', 'INFO'),
            format=log_config.get('format', '%(asctime)s - %(name)s - %(levelname)s - %(message)s'),
            file_path=log_config.get('file_path'),
            max_size=log_config.get('max_size', 10 * 1024 * 1024),
            backup_count=log_config.get('backup_count', 5)
        )
    
    def get_security_config(self) -> SecurityConfig:
        """Get security configuration"""
        sec_config = self.get('security', {})
        return SecurityConfig(
            secret_key=sec_config.get('secret_key', ''),
            token_expiry=sec_config.get('token_expiry', 3600),
            max_login_attempts=sec_config.get('max_login_attempts', 5),
            lockout_duration=sec_config.get('lockout_duration', 900),
            require_https=sec_config.get('require_https', True)
        )
    
    def get_bot_config(self) -> BotConfig:
        """Get bot configuration"""
        bot_config = self.get('bot', {})
        return BotConfig(
            token=bot_config.get('token', ''),
            webhook_url=bot_config.get('webhook_url'),
            webhook_port=bot_config.get('webhook_port', 8080),
            max_connections=bot_config.get('max_connections', 100),
            timeout=bot_config.get('timeout', 30)
        )
    
    def get_app_config(self) -> AppConfig:
        """Get application configuration"""
        app_config = self.get('app', {})
        return AppConfig(
            debug=app_config.get('debug', False),
            environment=app_config.get('environment', 'production'),
            data_dir=app_config.get('data_dir', 'data'),
            backup_dir=app_config.get('backup_dir', 'backups'),
            max_file_size=app_config.get('max_file_size', 10 * 1024 * 1024),
            cleanup_interval=app_config.get('cleanup_interval', 3600)
        )


# Global configuration manager
config_manager = ConfigManager()
