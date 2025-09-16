"""
Bootstrap configuration for dependency injection
"""
import logging
from typing import Optional

from .container import Container
from .interfaces import (
    ISessionRepository, IGroupConfigRepository, ITokenRepository,
    ISessionService, ITimerService, IGroupConfigService, IMessageService, IFileParser,
    ISessionControlService
)
from repositories import SessionRepository, GroupConfigRepository, TokenRepository
from services import SessionService, TimerService, GroupConfigService, MessageService, FileParserService
from services.session_control_service import SessionControlService

logger = logging.getLogger(__name__)


class Bootstrap:
    """Bootstrap class for configuring dependency injection"""
    
    def __init__(self, container: Optional[Container] = None):
        self.container = container or Container()
    
    def configure_services(self, data_dir: str = "data") -> None:
        """Configure all services in the container"""
        logger.info("Configuring services...")
        
        # Register repositories
        self.container.register_factory(
            ISessionRepository,
            lambda: SessionRepository(data_dir)
        )
        
        self.container.register_factory(
            IGroupConfigRepository,
            lambda: GroupConfigRepository(data_dir)
        )
        
        self.container.register_factory(
            ITokenRepository,
            lambda: TokenRepository(data_dir)
        )
        
        # Register services
        self.container.register_factory(
            ISessionService,
            lambda: SessionService(self.container.get(ISessionRepository))
        )
        
        self.container.register_factory(
            IGroupConfigService,
            lambda: GroupConfigService(
                self.container.get(IGroupConfigRepository),
                self.container.get(ITokenRepository)
            )
        )
        
        self.container.register_factory(
            ITimerService,
            lambda: TimerService(
                self.container.get(ISessionService),
                self.container.get(IGroupConfigService)
            )
        )
        
        self.container.register_factory(
            IMessageService,
            lambda: MessageService()
        )
        
        self.container.register_factory(
            IFileParser,
            lambda: FileParserService()
        )
        
        self.container.register_factory(
            ISessionControlService,
            lambda: SessionControlService(
                self.container.get(ISessionService),
                self.container.get(IMessageService)
            )
        )
        
        logger.info("Services configured successfully")
    
    def get_session_service(self) -> ISessionService:
        """Get session service"""
        return self.container.get(ISessionService)
    
    def get_timer_service(self) -> ITimerService:
        """Get timer service"""
        return self.container.get(ITimerService)
    
    def get_group_config_service(self) -> IGroupConfigService:
        """Get group config service"""
        return self.container.get(IGroupConfigService)
    
    def get_message_service(self) -> IMessageService:
        """Get message service"""
        return self.container.get(IMessageService)
    
    def get_file_parser_service(self) -> IFileParser:
        """Get file parser service"""
        return self.container.get(IFileParser)
    
    def get_session_control_service(self) -> ISessionControlService:
        """Get session control service"""
        return self.container.get(ISessionControlService)
    
    def get_session_repository(self) -> ISessionRepository:
        """Get session repository"""
        return self.container.get(ISessionRepository)
    
    def get_group_config_repository(self) -> IGroupConfigRepository:
        """Get group config repository"""
        return self.container.get(IGroupConfigRepository)
    
    def get_token_repository(self) -> ITokenRepository:
        """Get token repository"""
        return self.container.get(ITokenRepository)


# Global bootstrap instance
bootstrap = Bootstrap()
bootstrap.configure_services()  # Initialize all services
