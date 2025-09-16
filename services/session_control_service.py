"""
Session control service for pause and revoting functionality
"""
import logging
from typing import List, Optional, Dict, Any
from datetime import datetime

from core.interfaces import ISessionService, IMessageService
from domain.entities import DomainSession, DomainTask
from domain.value_objects import ChatId, TopicId, UserId, VoteValue
from domain.enums import SessionStatus, PauseReason, RevotingStatus
from core.exceptions import ValidationError, SessionNotFoundError

logger = logging.getLogger(__name__)


class SessionControlService:
    """Service for managing session pauses and revoting"""
    
    def __init__(self, session_service: ISessionService, message_service: IMessageService):
        self._session_service = session_service
        self._message_service = message_service
    
    def check_batch_completion(self, chat_id: int, topic_id: int) -> bool:
        """Check if current batch is complete and handle accordingly"""
        try:
            session = self._session_service.get_session(chat_id, topic_id)
            
            if not session.is_batch_complete():
                return False
            
            # Analyze batch for revoting needs
            tasks_needing_revoting = session.analyze_batch_for_revoting()
            
            if tasks_needing_revoting:
                # Start revoting process
                session.start_revoting(tasks_needing_revoting)
                self._session_service.save_session(session)
                
                logger.info(f"Started revoting for {len(tasks_needing_revoting)} tasks in {chat_id}_{topic_id}")
                return True
            else:
                # Pause for admin decision
                session.pause_session(PauseReason.BATCH_COMPLETED)
                self._session_service.save_session(session)
                
                logger.info(f"Paused session after batch completion in {chat_id}_{topic_id}")
                return True
                
        except Exception as e:
            logger.error(f"Error checking batch completion: {e}")
            return False
    
    def pause_session(self, chat_id: int, topic_id: int, reason: PauseReason = PauseReason.ADMIN_REQUEST) -> bool:
        """Pause the session"""
        try:
            session = self._session_service.get_session(chat_id, topic_id)
            
            # If already paused, return True (success)
            if session.status == SessionStatus.PAUSED:
                logger.info(f"Session {chat_id}_{topic_id} is already paused")
                return True
            
            if session.status not in [SessionStatus.VOTING, SessionStatus.REVOTING]:
                logger.warning(f"Cannot pause session in status {session.status}")
                return False
            
            session.pause_session(reason)
            self._session_service.save_session(session)
            
            logger.info(f"Paused session {chat_id}_{topic_id} with reason {reason.value}")
            return True
            
        except Exception as e:
            logger.error(f"Error pausing session: {e}")
            return False
    
    def resume_session(self, chat_id: int, topic_id: int) -> bool:
        """Resume the session"""
        try:
            session = self._session_service.get_session(chat_id, topic_id)
            
            if session.status != SessionStatus.PAUSED:
                logger.warning(f"Session {chat_id}_{topic_id} is not paused")
                return False
            
            session.resume_session()
            self._session_service.save_session(session)
            
            logger.info(f"Resumed session {chat_id}_{topic_id}")
            return True
            
        except Exception as e:
            logger.error(f"Error resuming session: {e}")
            return False
    
    def start_revoting(self, chat_id: int, topic_id: int, task_indices: List[int]) -> bool:
        """Start revoting for specified tasks"""
        try:
            session = self._session_service.get_session(chat_id, topic_id)
            
            if not task_indices:
                logger.warning("No tasks specified for revoting")
                return False
            
            # Validate task indices
            for index in task_indices:
                if index < 0 or index >= len(session.tasks):
                    raise ValidationError(f"Invalid task index: {index}")
            
            session.start_revoting(task_indices)
            self._session_service.save_session(session)
            
            logger.info(f"Started revoting for {len(task_indices)} tasks in {chat_id}_{topic_id}")
            return True
            
        except Exception as e:
            logger.error(f"Error starting revoting: {e}")
            return False
    
    def add_revoting_vote(self, chat_id: int, topic_id: int, user_id: int, vote_value: str) -> bool:
        """Add vote during revoting"""
        try:
            session = self._session_service.get_session(chat_id, topic_id)
            
            if session.revoting_status != RevotingStatus.IN_PROGRESS:
                logger.warning(f"Revoting not in progress for {chat_id}_{topic_id}")
                return False
            
            vote_value_obj = VoteValue(vote_value)
            success = session.add_revoting_vote(UserId(user_id), vote_value_obj)
            
            if success:
                self._session_service.save_session(session)
                logger.info(f"Added revoting vote {vote_value} from user {user_id}")
            
            return success
            
        except Exception as e:
            logger.error(f"Error adding revoting vote: {e}")
            return False
    
    def complete_revoting_task(self, chat_id: int, topic_id: int) -> bool:
        """Complete current revoting task"""
        try:
            session = self._session_service.get_session(chat_id, topic_id)
            
            if session.revoting_status != RevotingStatus.IN_PROGRESS:
                logger.warning(f"Revoting not in progress for {chat_id}_{topic_id}")
                return False
            
            success = session.complete_revoting_task()
            
            if success:
                self._session_service.save_session(session)
                logger.info(f"Completed revoting task in {chat_id}_{topic_id}")
            
            return success
            
        except Exception as e:
            logger.error(f"Error completing revoting task: {e}")
            return False
    
    def get_revoting_status(self, chat_id: int, topic_id: int) -> Dict[str, Any]:
        """Get revoting status information"""
        try:
            session = self._session_service.get_session(chat_id, topic_id)
            
            return {
                'status': session.revoting_status.value,
                'tasks_count': len(session.tasks_needing_revoting),
                'current_index': session.current_revoting_index,
                'is_in_progress': session.revoting_status == RevotingStatus.IN_PROGRESS,
                'current_task': session.get_current_revoting_task().text.value if session.get_current_revoting_task() else None
            }
            
        except Exception as e:
            logger.error(f"Error getting revoting status: {e}")
            return {}
    
    def get_pause_status(self, chat_id: int, topic_id: int) -> Dict[str, Any]:
        """Get pause status information"""
        try:
            session = self._session_service.get_session(chat_id, topic_id)
            
            return {
                'is_paused': session.is_paused,
                'reason': session.pause_reason.value if session.pause_reason else None,
                'started_at': session.pause_started_at.isoformat() if session.pause_started_at else None,
                'duration': session.pause_duration.value if session.pause_duration else None
            }
            
        except Exception as e:
            logger.error(f"Error getting pause status: {e}")
            return {}
    
    def analyze_session_for_revoting(self, chat_id: int, topic_id: int) -> List[Dict[str, Any]]:
        """Analyze entire session for tasks needing revoting"""
        try:
            session = self._session_service.get_session(chat_id, topic_id)
            
            tasks_needing_revoting = []
            
            for i, task in enumerate(session.tasks):
                if task.needs_revoting():
                    discrepancy = task.get_vote_discrepancy()
                    tasks_needing_revoting.append({
                        'index': i,
                        'text': task.text.value,
                        'min_vote': discrepancy.min_vote if discrepancy else None,
                        'max_vote': discrepancy.max_vote if discrepancy else None,
                        'discrepancy_ratio': discrepancy.discrepancy_ratio if discrepancy else None
                    })
            
            return tasks_needing_revoting
            
        except Exception as e:
            logger.error(f"Error analyzing session for revoting: {e}")
            return []
    
    def get_batch_progress(self, chat_id: int, topic_id: int) -> Dict[str, Any]:
        """Get current batch progress information"""
        try:
            session = self._session_service.get_session(chat_id, topic_id)
            
            batch_tasks = session.get_current_batch_tasks()
            completed_tasks = sum(1 for task in batch_tasks if task.is_completed())
            
            # Calculate average estimate for completed tasks
            total_estimates = 0
            estimate_count = 0
            for task in batch_tasks:
                if task.is_completed():
                    max_vote = task.get_max_vote()
                    if max_vote:
                        try:
                            # Handle different types of max_vote
                            logger.info(f"GET_BATCH_PROGRESS: max_vote type: {type(max_vote)}, value: {max_vote}")
                            
                            # Extract vote value safely
                            if isinstance(max_vote, str):
                                vote_value = max_vote
                            elif hasattr(max_vote, 'value'):
                                if hasattr(max_vote.value, 'value'):
                                    vote_value = max_vote.value.value
                                else:
                                    vote_value = max_vote.value
                            else:
                                vote_value = str(max_vote)
                            
                            # Ensure vote_value is a string before converting to float
                            if not isinstance(vote_value, str):
                                vote_value = str(vote_value)
                            
                            logger.info(f"GET_BATCH_PROGRESS: extracted vote_value: {vote_value}, type: {type(vote_value)}")
                            total_estimates += float(vote_value)
                            estimate_count += 1
                        except (ValueError, TypeError, AttributeError) as e:
                            logger.error(f"GET_BATCH_PROGRESS: Error processing vote: {e}, max_vote: {max_vote}, type: {type(max_vote)}")
                            pass
            
            average_estimate = total_estimates / estimate_count if estimate_count > 0 else 0
            
            # Calculate batch duration
            batch_duration = "N/A"
            if session.last_batch:
                # Calculate time from first to last task in batch
                try:
                    from datetime import datetime
                    timestamps = []
                    for task_data in session.last_batch:
                        if 'timestamp' in task_data:
                            timestamps.append(datetime.fromisoformat(task_data['timestamp']))
                    
                    if len(timestamps) >= 2:
                        duration = max(timestamps) - min(timestamps)
                        hours, remainder = divmod(duration.total_seconds(), 3600)
                        minutes, seconds = divmod(remainder, 60)
                        if hours > 0:
                            batch_duration = f"{int(hours)}ч {int(minutes)}м"
                        else:
                            batch_duration = f"{int(minutes)}м {int(seconds)}с"
                except Exception as e:
                    logger.warning(f"Error calculating batch duration: {e}")
            
            return {
                'current_batch': session.current_batch_index + 1,
                'total_batches': (len(session.tasks) + session.batch_size - 1) // session.batch_size,
                'batch_size': session.batch_size,
                'completed_in_batch': completed_tasks,
                'total_in_batch': len(batch_tasks),
                'is_batch_complete': session.is_batch_complete(),
                'current_task_index': session.current_task_index,
                'total_tasks': len(session.tasks),
                'average_estimate': f"{average_estimate:.1f}" if average_estimate > 0 else "N/A",
                'batch_duration': batch_duration
            }
            
        except Exception as e:
            logger.error(f"Error getting batch progress: {e}")
            return {}
    
    def is_revoting_all_voted(self, chat_id: int, topic_id: int) -> bool:
        """Check if all participants voted in revoting"""
        try:
            session = self._session_service.get_session(chat_id, topic_id)
            return session.is_revoting_all_voted()
        except Exception as e:
            logger.error(f"Error checking revoting votes: {e}")
            return False
