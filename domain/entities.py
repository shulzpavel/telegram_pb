"""
Domain entities
"""
from dataclasses import dataclass, field
from typing import Dict, List, Optional
from datetime import datetime

from .value_objects import (
    ChatId, TopicId, UserId, TaskText, VoteValue, 
    SessionKey, TimeoutSeconds, Token, Username, FullName,
    PauseDuration, VoteDiscrepancy
)
from .enums import VoteResult, TaskStatus, SessionStatus, ParticipantRole, PauseReason, RevotingStatus


@dataclass
class DomainVote:
    """Domain vote entity"""
    user_id: UserId
    value: VoteValue
    timestamp: datetime
    
    def __post_init__(self):
        if not isinstance(self.timestamp, datetime):
            raise ValueError("Timestamp must be datetime")


@dataclass
class DomainTask:
    """Domain task entity"""
    text: TaskText
    index: int
    votes: Dict[UserId, DomainVote] = field(default_factory=dict)
    result: VoteResult = VoteResult.PENDING
    status: TaskStatus = TaskStatus.PENDING
    deadline: Optional[datetime] = None
    
    def add_vote(self, vote: DomainVote) -> None:
        """Add vote to task"""
        self.votes[vote.user_id] = vote
        self.status = TaskStatus.IN_PROGRESS
    
    def is_completed(self) -> bool:
        """Check if task is completed"""
        return self.status == TaskStatus.COMPLETED
    
    def get_max_vote(self) -> Optional[VoteValue]:
        """Get maximum vote value"""
        if not self.votes:
            return None
        
        numeric_votes = []
        for vote in self.votes.values():
            try:
                numeric_votes.append(float(vote.value.value))
            except ValueError:
                continue
        
        if not numeric_votes:
            return None
        
        max_value = max(numeric_votes)
        return VoteValue(str(int(max_value) if max_value.is_integer() else max_value))
    
    def get_vote_discrepancy(self) -> Optional[VoteDiscrepancy]:
        """Get vote discrepancy analysis"""
        if len(self.votes) < 2:
            return None
        
        numeric_votes = []
        for vote in self.votes.values():
            try:
                numeric_votes.append(float(vote.value.value))
            except ValueError:
                continue
        
        if len(numeric_votes) < 2:
            return None
        
        min_vote = min(numeric_votes)
        max_vote = max(numeric_votes)
        
        # Calculate discrepancy ratio
        if min_vote == 0:
            discrepancy_ratio = float('inf') if max_vote > 0 else 0
        else:
            discrepancy_ratio = max_vote / min_vote
        
        return VoteDiscrepancy(
            min_vote=min_vote,
            max_vote=max_vote,
            discrepancy_ratio=discrepancy_ratio
        )
    
    def needs_revoting(self) -> bool:
        """Check if task needs revoting due to significant discrepancy"""
        discrepancy = self.get_vote_discrepancy()
        return discrepancy is not None and discrepancy.is_significant


class DomainParticipant:
    """Domain participant entity"""
    def __init__(self, user_id: UserId, username: Username, full_name: FullName, role: ParticipantRole = ParticipantRole.PARTICIPANT):
        self.user_id = user_id
        self.username = username
        self.full_name = full_name
        self.role = role
    
    def is_admin(self) -> bool:
        """Check if participant is admin"""
        return self.role in [ParticipantRole.ADMIN, ParticipantRole.SUPER_ADMIN]
    
    def is_super_admin(self) -> bool:
        """Check if participant is super admin"""
        return self.role == ParticipantRole.SUPER_ADMIN


@dataclass
class DomainGroupConfig:
    """Domain group configuration entity"""
    chat_id: ChatId
    topic_id: TopicId
    admins: List[Username] = field(default_factory=list)
    timeout: TimeoutSeconds = field(default_factory=lambda: TimeoutSeconds(90))
    scale: List[str] = field(default_factory=lambda: ['1', '2', '3', '5', '8', '13'])
    is_active: bool = True
    created_at: datetime = field(default_factory=datetime.now)
    
    def is_admin(self, username: Username) -> bool:
        """Check if username is admin"""
        return username in self.admins
    
    def add_admin(self, username: Username) -> None:
        """Add admin"""
        if username not in self.admins:
            self.admins.append(username)
    
    def remove_admin(self, username: Username) -> bool:
        """Remove admin"""
        if username in self.admins:
            self.admins.remove(username)
            return True
        return False


class DomainSession:
    """Domain session entity"""
    def __init__(self, chat_id: ChatId, topic_id: TopicId, batch_size: int = 10):
        self.chat_id = chat_id
        self.topic_id = topic_id
        self.participants: Dict[UserId, DomainParticipant] = {}
        self.tasks: List[DomainTask] = []
        self.all_tasks: List[DomainTask] = []
        self.current_task_index: int = 0
        self.current_batch_index: int = 0
        self.batch_size: int = batch_size
        self.history: List[Dict] = []
        self.last_batch: List[Dict] = []
        self.status: SessionStatus = SessionStatus.IDLE
        self.active_vote_message_id: Optional[int] = None
        self.vote_deadline: Optional[datetime] = None
        self.default_timeout: TimeoutSeconds = TimeoutSeconds(90)
        self.scale: List[str] = ['1', '2', '3', '5', '8', '13']
        self.created_at: datetime = datetime.now()
        self.updated_at: datetime = datetime.now()
        # New fields for pause and revoting functionality
        self.is_paused: bool = False
        self.pause_reason: Optional[PauseReason] = None
        self.pause_started_at: Optional[datetime] = None
        self.pause_duration: Optional[PauseDuration] = None
        self.revoting_status: RevotingStatus = RevotingStatus.NOT_REQUIRED
        self.tasks_needing_revoting: List[int] = []  # Task indices
        self.revoting_tasks: List[DomainTask] = []
        self.current_revoting_index: int = 0
    
    @property
    def session_key(self) -> SessionKey:
        """Get session key"""
        return SessionKey(self.chat_id, self.topic_id)
    
    @property
    def current_task(self) -> Optional[DomainTask]:
        """Get current task"""
        if 0 <= self.current_task_index < len(self.tasks):
            return self.tasks[self.current_task_index]
        return None
    
    @property
    def is_voting_active(self) -> bool:
        """Check if voting is active"""
        return self.status == SessionStatus.VOTING and self.active_vote_message_id is not None
    
    def add_participant(self, participant: DomainParticipant) -> None:
        """Add participant"""
        self.participants[participant.user_id] = participant
        self.updated_at = datetime.now()
    
    def remove_participant(self, user_id: UserId) -> Optional[DomainParticipant]:
        """Remove participant"""
        participant = self.participants.pop(user_id, None)
        if participant:
            self.updated_at = datetime.now()
        return participant
    
    def add_vote(self, user_id: UserId, vote_value: VoteValue) -> bool:
        """Add vote to current task"""
        import logging
        logger = logging.getLogger(__name__)
        
        logger.info(f"DOMAIN_ADD_VOTE: user_id={user_id}, vote_value={vote_value}")
        logger.info(f"DOMAIN_ADD_VOTE: current_task exists: {self.current_task is not None}")
        logger.info(f"DOMAIN_ADD_VOTE: user_id in participants: {user_id in self.participants}")
        logger.info(f"DOMAIN_ADD_VOTE: participants: {list(self.participants.keys())}")
        
        if not self.current_task:
            logger.warning(f"DOMAIN_ADD_VOTE: No current task")
            return False
            
        if user_id not in self.participants:
            logger.warning(f"DOMAIN_ADD_VOTE: User {user_id} not in participants")
            return False
        
        vote = DomainVote(
            user_id=user_id,
            value=vote_value,
            timestamp=datetime.now()
        )
        
        logger.info(f"DOMAIN_ADD_VOTE: Created vote: {vote}")
        self.current_task.add_vote(vote)
        logger.info(f"DOMAIN_ADD_VOTE: Vote added to task, votes count: {len(self.current_task.votes)}")
        self.updated_at = datetime.now()
        return True
    
    def is_all_voted(self) -> bool:
        """Check if all participants voted"""
        import logging
        logger = logging.getLogger(__name__)
        
        if not self.current_task:
            logger.info(f"DOMAIN_IS_ALL_VOTED: No current task")
            return False
            
        votes_count = len(self.current_task.votes)
        participants_count = len(self.participants)
        result = votes_count == participants_count
        
        logger.info(f"DOMAIN_IS_ALL_VOTED: votes_count={votes_count}, participants_count={participants_count}, result={result}")
        logger.info(f"DOMAIN_IS_ALL_VOTED: voted_users: {list(self.current_task.votes.keys())}")
        logger.info(f"DOMAIN_IS_ALL_VOTED: all_participants: {list(self.participants.keys())}")
        
        return result
    
    def get_not_voted_participants(self) -> List[DomainParticipant]:
        """Get participants who haven't voted"""
        if not self.current_task:
            return []
        
        voted_user_ids = set(self.current_task.votes.keys())
        return [
            participant for participant in self.participants.values()
            if participant.user_id not in voted_user_ids
        ]
    
    def complete_current_task(self) -> bool:
        """Complete current task"""
        if not self.current_task:
            return False
        
        # Save task result to history
        votes_dict = {}
        for vote in self.current_task.votes.values():
            try:
                user_id_str = str(vote.user_id.value if hasattr(vote.user_id, 'value') else vote.user_id)
                vote_value = vote.value.value if hasattr(vote.value, 'value') else vote.value
                votes_dict[user_id_str] = vote_value
            except AttributeError as e:
                logger.error(f"COMPLETE_CURRENT_TASK: Error processing vote: {e}, vote: {vote}, user_id: {vote.user_id}, value: {vote.value}")
                # Fallback to string conversion
                user_id_str = str(vote.user_id)
                vote_value = str(vote.value)
                votes_dict[user_id_str] = vote_value
        
        task_result = {
            'task': self.current_task.text.value,
            'votes': votes_dict,
            'timestamp': datetime.now().isoformat()
        }
        
        self.history.append(task_result)
        self.last_batch.append(task_result)
        
        # Mark task as completed
        self.current_task.status = TaskStatus.COMPLETED
        self.current_task.result = VoteResult.COMPLETED
        
        # Move to next task
        self.current_task_index += 1
        self.updated_at = datetime.now()
        
        return True
    
    def start_voting(self) -> None:
        """Start voting session"""
        self.status = SessionStatus.VOTING
        self.updated_at = datetime.now()
    
    def finish_voting(self) -> None:
        """Finish voting session"""
        self.status = SessionStatus.COMPLETED
        self.active_vote_message_id = None
        self.vote_deadline = None
        self.updated_at = datetime.now()
    
    def pause_session(self, reason: PauseReason) -> None:
        """Pause the session"""
        self.is_paused = True
        self.pause_reason = reason
        self.pause_started_at = datetime.now()
        self.status = SessionStatus.PAUSED
        self.active_vote_message_id = None
        self.vote_deadline = None
        self.updated_at = datetime.now()
    
    def resume_session(self) -> None:
        """Resume the session"""
        self.is_paused = False
        self.pause_reason = None
        self.pause_started_at = None
        self.pause_duration = None
        self.status = SessionStatus.VOTING
        self.updated_at = datetime.now()
    
    def is_batch_complete(self) -> bool:
        """Check if current batch is complete"""
        batch_start = self.current_batch_index * self.batch_size
        batch_end = min(batch_start + self.batch_size, len(self.tasks))
        return self.current_task_index >= batch_end
    
    def get_current_batch_tasks(self) -> List[DomainTask]:
        """Get tasks in current batch"""
        batch_start = self.current_batch_index * self.batch_size
        batch_end = min(batch_start + self.batch_size, len(self.tasks))
        return self.tasks[batch_start:batch_end]
    
    def analyze_batch_for_revoting(self) -> List[int]:
        """Analyze current batch for tasks needing revoting"""
        batch_tasks = self.get_current_batch_tasks()
        tasks_needing_revoting = []
        
        for i, task in enumerate(batch_tasks):
            if task.needs_revoting():
                global_index = self.current_batch_index * self.batch_size + i
                tasks_needing_revoting.append(global_index)
        
        return tasks_needing_revoting
    
    def start_revoting(self, task_indices: List[int]) -> None:
        """Start revoting for specified tasks"""
        self.revoting_status = RevotingStatus.IN_PROGRESS
        self.tasks_needing_revoting = task_indices
        self.revoting_tasks = [self.tasks[i] for i in task_indices]
        self.current_revoting_index = 0
        self.status = SessionStatus.REVOTING
        self.updated_at = datetime.now()
    
    def get_current_revoting_task(self) -> Optional[DomainTask]:
        """Get current revoting task"""
        if (self.revoting_status == RevotingStatus.IN_PROGRESS and 
            self.current_revoting_index < len(self.revoting_tasks)):
            return self.revoting_tasks[self.current_revoting_index]
        return None
    
    def complete_revoting_task(self) -> bool:
        """Complete current revoting task"""
        if not self.get_current_revoting_task():
            return False
        
        # Clear votes for revoting task
        current_task = self.get_current_revoting_task()
        current_task.votes.clear()
        current_task.status = TaskStatus.PENDING
        
        # Move to next revoting task
        self.current_revoting_index += 1
        
        # Check if revoting is complete
        if self.current_revoting_index >= len(self.revoting_tasks):
            self.finish_revoting()
        
        self.updated_at = datetime.now()
        return True
    
    def finish_revoting(self) -> None:
        """Finish revoting process"""
        self.revoting_status = RevotingStatus.COMPLETED
        self.tasks_needing_revoting.clear()
        self.revoting_tasks.clear()
        self.current_revoting_index = 0
        self.status = SessionStatus.VOTING
        self.updated_at = datetime.now()
    
    def add_revoting_vote(self, user_id: UserId, vote_value: VoteValue) -> bool:
        """Add vote during revoting"""
        current_task = self.get_current_revoting_task()
        if not current_task or user_id not in self.participants:
            return False
        
        vote = DomainVote(
            user_id=user_id,
            value=vote_value,
            timestamp=datetime.now()
        )
        
        current_task.add_vote(vote)
        self.updated_at = datetime.now()
        return True
    
    def is_revoting_all_voted(self) -> bool:
        """Check if all participants voted in revoting"""
        current_task = self.get_current_revoting_task()
        if not current_task:
            return False
        return len(current_task.votes) == len(self.participants)
