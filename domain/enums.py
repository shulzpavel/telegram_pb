"""
Domain enums
"""
from enum import Enum


class VoteResult(Enum):
    """Vote result enumeration"""
    PENDING = "pending"
    COMPLETED = "completed"
    TIMEOUT = "timeout"


class TaskStatus(Enum):
    """Task status enumeration"""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class SessionStatus(Enum):
    """Session status enumeration"""
    IDLE = "idle"
    VOTING = "voting"
    PAUSED = "paused"
    REVOTING = "revoting"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class ParticipantRole(Enum):
    """Participant role enumeration"""
    PARTICIPANT = "participant"
    ADMIN = "admin"
    SUPER_ADMIN = "super_admin"


class PauseReason(Enum):
    """Pause reason enumeration"""
    BATCH_COMPLETED = "batch_completed"
    ADMIN_REQUEST = "admin_request"
    REVOTING_REQUIRED = "revoting_required"


class RevotingStatus(Enum):
    """Revoting status enumeration"""
    NOT_REQUIRED = "not_required"
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
