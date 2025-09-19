"""
Type definitions and protocols
"""
from typing import Protocol, TypeVar, Generic, Optional, List, Dict, Any, Union, Callable, Awaitable
from aiogram import types
from domain.entities import DomainSession, DomainParticipant, DomainTask, DomainGroupConfig
from domain.value_objects import ChatId, TopicId, UserId, TaskText, VoteValue

T = TypeVar('T')
TEntity = TypeVar('TEntity', bound=DomainSession)


class RepositoryProtocol(Protocol[TEntity]):
    """Repository protocol"""
    def get(self, chat_id: int, topic_id: int) -> TEntity: ...
    def save(self, entity: TEntity) -> None: ...


class ServiceProtocol(Protocol):
    """Service protocol"""
    def get_session(self, chat_id: int, topic_id: int) -> DomainSession: ...
    def save_session(self, session: DomainSession) -> None: ...


class MessageHandler(Protocol):
    """Message handler protocol"""
    async def __call__(self, message: types.Message) -> None: ...


class CallbackHandler(Protocol):
    """Callback handler protocol"""
    async def __call__(self, callback: types.CallbackQuery) -> None: ...


class ErrorHandler(Protocol):
    """Error handler protocol"""
    def handle(self, error: Exception, context: Optional[str] = None) -> str: ...


# Type aliases
ChatIdType = Union[int, ChatId]
TopicIdType = Union[int, TopicId]
UserIdType = Union[int, UserId]
TaskTextType = Union[str, TaskText]
VoteValueType = Union[str, VoteValue]

# Handler types
HandlerFunction = Callable[..., Awaitable[None]]
MessageHandlerFunction = Callable[[types.Message], Awaitable[None]]
CallbackHandlerFunction = Callable[[types.CallbackQuery], Awaitable[None]]

# Service types
SessionServiceType = ServiceProtocol
GroupConfigServiceType = ServiceProtocol
TimerServiceType = ServiceProtocol
RoleServiceType = ServiceProtocol

# Repository types
SessionRepositoryType = RepositoryProtocol[DomainSession]
GroupConfigRepositoryType = RepositoryProtocol[DomainGroupConfig]

# Configuration types
ConfigDict = Dict[str, Any]
GroupConfigDict = Dict[str, Union[int, str, List[str], bool]]
SessionConfigDict = Dict[str, Union[int, str, List[Dict[str, Any]], bool]]

# Response types
ApiResponse = Dict[str, Any]
TelegramResponse = Union[types.Message, bool]
HandlerResponse = Optional[Union[types.Message, bool]]

# Validation types
ValidationResult = tuple[bool, Optional[str]]
ValidationFunction = Callable[[Any], ValidationResult]

# Event types
EventHandler = Callable[[Any], Awaitable[None]]
EventData = Dict[str, Any]

# Timer types
TimerCallback = Callable[[int, int, types.Message], Awaitable[None]]
TimerData = Dict[str, Any]

# File types
FileData = bytes
FilePath = str
FileExtension = str

# Logging types
LogLevel = str
LogMessage = str
LogContext = Dict[str, Any]

# Database types
QueryResult = List[Dict[str, Any]]
QueryParams = Dict[str, Any]
DatabaseConnection = Any  # Placeholder for actual DB connection type

# Cache types
CacheKey = str
CacheValue = Any
CacheTTL = int

# HTTP types
HttpMethod = str
HttpStatus = int
HttpHeaders = Dict[str, str]
HttpResponse = Dict[str, Any]

# Jira types
JiraIssue = Dict[str, Any]
JiraField = Dict[str, Any]
JiraUpdate = Dict[str, Any]

# Planning Poker types
VoteScale = List[str]
VoteResult = Union[str, float]
TaskEstimate = Optional[Union[str, float]]
SessionStats = Dict[str, Union[int, float, str]]

# UI types
KeyboardMarkup = types.InlineKeyboardMarkup
ButtonText = str
CallbackData = str
MenuLevel = str

# State types
FSMState = str
StateData = Dict[str, Any]
StateTransition = Callable[[FSMState, StateData], Awaitable[None]]

# Permission types
Permission = str
Role = str
AccessLevel = int

# Notification types
NotificationType = str
NotificationData = Dict[str, Any]
NotificationRecipient = Union[UserId, List[UserId]]

# Metrics types
MetricName = str
MetricValue = Union[int, float, str]
MetricTags = Dict[str, str]

# Health check types
HealthStatus = str
HealthCheck = Callable[[], Awaitable[HealthStatus]]
ServiceHealth = Dict[str, HealthStatus]
