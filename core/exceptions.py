"""
Custom exceptions for the application
"""
from typing import Optional


class PokerBotException(Exception):
    """Base exception for Poker Bot"""
    
    def __init__(self, message: str, error_code: Optional[str] = None):
        self.message = message
        self.error_code = error_code
        super().__init__(self.message)


class ValidationError(PokerBotException):
    """Validation error"""
    pass


class AuthorizationError(PokerBotException):
    """Authorization error"""
    pass


class SessionNotFoundError(PokerBotException):
    """Session not found error"""
    pass


class ParticipantNotFoundError(PokerBotException):
    """Participant not found error"""
    pass


class TaskNotFoundError(PokerBotException):
    """Task not found error"""
    pass


class InvalidVoteError(PokerBotException):
    """Invalid vote error"""
    pass


class VotingNotActiveError(PokerBotException):
    """Voting not active error"""
    pass


class FileParseError(PokerBotException):
    """File parsing error"""
    pass


class StorageError(PokerBotException):
    """Storage error"""
    pass


class ConfigurationError(PokerBotException):
    """Configuration error"""
    pass


class TimerError(PokerBotException):
    """Timer error"""
    pass


class MessageError(PokerBotException):
    """Message handling error"""
    pass
