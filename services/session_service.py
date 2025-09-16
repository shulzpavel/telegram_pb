"""
Session service implementation
"""
import logging
from typing import List, Optional
from aiogram import types

from core.interfaces import ISessionService, ISessionRepository
from domain.entities import DomainSession, DomainParticipant, DomainTask
from domain.value_objects import ChatId, TopicId, UserId, TaskText, VoteValue, Username, FullName
from domain.enums import ParticipantRole, SessionStatus, TaskStatus
from models import Session  # For backward compatibility

logger = logging.getLogger(__name__)


class SessionService(ISessionService):
    """Service for session management"""
    
    def __init__(self, session_repository: ISessionRepository):
        self._repository = session_repository
    
    def get_session(self, chat_id: int, topic_id: int) -> DomainSession:
        """Get session"""
        return self._repository.get_session(chat_id, topic_id)
    
    def save_session(self, session: DomainSession) -> None:
        """Save session"""
        self._repository.save_session(session)
    
    def add_participant(self, chat_id: int, topic_id: int, user: types.User) -> bool:
        """Add participant"""
        try:
            session = self.get_session(chat_id, topic_id)
            
            participant = DomainParticipant(
                user_id=UserId(user.id),
                username=Username(user.username or ""),
                full_name=FullName(user.full_name or f"User {user.id}"),
                role=ParticipantRole.PARTICIPANT
            )
            
            session.add_participant(participant)
            self.save_session(session)
            
            logger.info(f"Added participant {user.id} to session {chat_id}_{topic_id}")
            return True
            
        except Exception as e:
            logger.error(f"Error adding participant: {e}")
            return False
    
    def remove_participant(self, chat_id: int, topic_id: int, user_id: int) -> Optional[DomainParticipant]:
        """Remove participant"""
        try:
            session = self.get_session(chat_id, topic_id)
            participant = session.remove_participant(UserId(user_id))
            
            if participant:
                self.save_session(session)
                logger.info(f"Removed participant {user_id} from session {chat_id}_{topic_id}")
            
            return participant
            
        except Exception as e:
            logger.error(f"Error removing participant: {e}")
            return None
    
    def start_voting_session(self, chat_id: int, topic_id: int, tasks: List[str]) -> bool:
        """Start voting session"""
        try:
            session = self.get_session(chat_id, topic_id)
            
            # Convert tasks to domain objects
            domain_tasks = []
            for i, task_text in enumerate(tasks):
                task = DomainTask(
                    text=TaskText(task_text),
                    index=i
                )
                domain_tasks.append(task)
            
            # Set up session
            session.tasks = domain_tasks
            session.current_task_index = 0
            session.current_batch_index = 0
            session.status = SessionStatus.VOTING
            session.history = []
            session.last_batch = []
            
            self.save_session(session)
            
            logger.info(f"Started voting session with {len(tasks)} tasks in {chat_id}_{topic_id}")
            return True
            
        except Exception as e:
            logger.error(f"Error starting voting session: {e}")
            return False
    
    def add_vote(self, chat_id: int, topic_id: int, user_id: int, value: str) -> bool:
        """Add vote"""
        try:
            logger.info(f"ADD_VOTE: Starting - user_id={user_id}, value='{value}', chat_id={chat_id}, topic_id={topic_id}")
            session = self.get_session(chat_id, topic_id)
            
            logger.info(f"ADD_VOTE: Session status: {session.status}")
            logger.info(f"ADD_VOTE: Session participants: {list(session.participants.keys())}")
            logger.info(f"ADD_VOTE: Current task: {session.current_task.text.value if session.current_task else 'None'}")
            logger.info(f"ADD_VOTE: Current task votes: {list(session.current_task.votes.keys()) if session.current_task else 'No current task'}")
            
            # Check if user is participant
            user_id_obj = UserId(user_id)
            if user_id_obj not in session.participants:
                logger.warning(f"ADD_VOTE: User {user_id} is not a participant in session {chat_id}_{topic_id}")
                logger.warning(f"ADD_VOTE: Available participants: {[p.value for p in session.participants.keys()]}")
                return False
            
            # Check if voting is active
            if session.status != SessionStatus.VOTING:
                logger.warning(f"ADD_VOTE: Voting is not active in session {chat_id}_{topic_id}, status: {session.status}")
                return False
            
            # Add vote
            vote_value = VoteValue(value)
            logger.info(f"ADD_VOTE: Creating vote - user_id_obj={user_id_obj}, vote_value={vote_value}")
            success = session.add_vote(user_id_obj, vote_value)
            
            logger.info(f"ADD_VOTE: Vote add result: {success}")
            if success:
                self.save_session(session)
                logger.info(f"ADD_VOTE: Successfully added vote {value} from user {user_id} in session {chat_id}_{topic_id}")
                logger.info(f"ADD_VOTE: Updated task votes: {list(session.current_task.votes.keys()) if session.current_task else 'No current task'}")
            else:
                logger.warning(f"ADD_VOTE: Failed to add vote from user {user_id}")
            
            return success
            
        except Exception as e:
            logger.error(f"ADD_VOTE: Error adding vote: {e}")
            import traceback
            logger.error(f"ADD_VOTE: Traceback: {traceback.format_exc()}")
            return False
    
    def is_all_voted(self, chat_id: int, topic_id: int) -> bool:
        """Check if all voted"""
        try:
            session = self.get_session(chat_id, topic_id)
            result = session.is_all_voted()
            logger.info(f"IS_ALL_VOTED: chat_id={chat_id}, topic_id={topic_id}, result={result}")
            logger.info(f"IS_ALL_VOTED: Participants count: {len(session.participants)}")
            logger.info(f"IS_ALL_VOTED: Votes count: {len(session.current_task.votes) if session.current_task else 0}")
            return result
        except Exception as e:
            logger.error(f"IS_ALL_VOTED: Error checking if all voted: {e}")
            return False
    
    def complete_current_task(self, chat_id: int, topic_id: int) -> bool:
        """Complete current task"""
        try:
            session = self.get_session(chat_id, topic_id)
            success = session.complete_current_task()
            
            if success:
                self.save_session(session)
                logger.info(f"Completed current task in session {chat_id}_{topic_id}")
            
            return success
            
        except Exception as e:
            logger.error(f"Error completing current task: {e}")
            return False
    
    def get_current_task(self, chat_id: int, topic_id: int) -> Optional[DomainTask]:
        """Get current task"""
        try:
            session = self.get_session(chat_id, topic_id)
            return session.current_task
        except Exception as e:
            logger.error(f"Error getting current task: {e}")
            return None
    
    def get_not_voted_participants(self, chat_id: int, topic_id: int) -> List[DomainParticipant]:
        """Get participants who haven't voted"""
        try:
            session = self.get_session(chat_id, topic_id)
            return session.get_not_voted_participants()
        except Exception as e:
            logger.error(f"Error getting not voted participants: {e}")
            return []
    
    def finish_voting_session(self, chat_id: int, topic_id: int) -> None:
        """Finish voting session"""
        try:
            session = self.get_session(chat_id, topic_id)
            session.finish_voting()
            self.save_session(session)
            
            logger.info(f"Finished voting session {chat_id}_{topic_id}")
            
        except Exception as e:
            logger.error(f"Error finishing voting session: {e}")
    
    def get_current_batch_info(self, chat_id: int, topic_id: int) -> tuple:
        """Get current batch information"""
        try:
            session = self.get_session(chat_id, topic_id)
            current_batch = session.current_batch_index + 1
            total_batches = (len(session.tasks) + session.batch_size - 1) // session.batch_size
            return current_batch, total_batches
        except Exception as e:
            logger.error(f"Error getting current batch info: {e}")
            return 1, 1
    
    def get_total_all_tasks_count(self, chat_id: int, topic_id: int) -> int:
        """Get total number of tasks"""
        try:
            session = self.get_session(chat_id, topic_id)
            return len(session.tasks)
        except Exception as e:
            logger.error(f"Error getting total tasks count: {e}")
            return 0

    def get_session_stats(self, chat_id: int, topic_id: int) -> dict:
        """Get session statistics"""
        try:
            session = self.get_session(chat_id, topic_id)
            
            total_tasks = len(session.tasks)
            completed_tasks = len([t for t in session.tasks if t.is_completed()])
            total_participants = len(session.participants)
            
            # Calculate total story points
            total_sp = 0
            for task in session.tasks:
                if task.is_completed():
                    max_vote = task.get_max_vote()
                    if max_vote:
                        try:
                            total_sp += float(max_vote.value)
                        except ValueError:
                            pass
            
            return {
                'total_tasks': total_tasks,
                'completed_tasks': completed_tasks,
                'total_participants': total_participants,
                'total_story_points': total_sp,
                'status': session.status.value,
                'current_task_index': session.current_task_index
            }
            
        except Exception as e:
            logger.error(f"Error getting session stats: {e}")
            return {}
