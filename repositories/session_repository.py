"""
Session repository implementation
"""
import json
import os
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import logging

from core.interfaces import ISessionRepository
from domain.entities import DomainSession, DomainParticipant
from domain.value_objects import ChatId, TopicId, SessionKey, UserId, Username, FullName
from domain.enums import SessionStatus

logger = logging.getLogger(__name__)


class SessionRepository(ISessionRepository):
    """Repository for session management"""
    
    def __init__(self, data_dir: str = "data"):
        self.data_dir = data_dir
        self.sessions_file = os.path.join(data_dir, "sessions.json")
        self._ensure_data_dir()
    
    def _ensure_data_dir(self) -> None:
        """Ensure data directory exists"""
        os.makedirs(self.data_dir, exist_ok=True)
    
    def _load_sessions(self) -> Dict[str, Dict[str, Any]]:
        """Load sessions from file"""
        try:
            if os.path.exists(self.sessions_file):
                with open(self.sessions_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
        except Exception as e:
            logger.error(f"Error loading sessions: {e}")
        return {}
    
    def _save_sessions(self, sessions: Dict[str, Dict[str, Any]]) -> None:
        """Save sessions to file"""
        try:
            with open(self.sessions_file, 'w', encoding='utf-8') as f:
                json.dump(sessions, f, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.error(f"Error saving sessions: {e}")
            raise
    
    def _convert_to_domain(self, data: Dict[str, Any]) -> DomainSession:
        """Convert storage data to domain entity"""
        from domain.value_objects import Username, FullName, TaskText, TimeoutSeconds, UserId, VoteValue
        from domain.entities import DomainParticipant, DomainTask, DomainVote
        from domain.enums import ParticipantRole, TaskStatus, VoteResult
        
        chat_id = ChatId(data['chat_id'])
        topic_id = TopicId(data['topic_id'])
        
        # Convert participants
        participants = {}
        for user_id_str, participant_data in data.get('participants', {}).items():
            user_id = UserId(int(user_id_str))
            participant = DomainParticipant(
                user_id=user_id,
                username=Username(participant_data.get('username', '')),
                full_name=FullName(participant_data.get('full_name', f'User {user_id.value}')),
                role=ParticipantRole.ADMIN if participant_data.get('is_admin', False) else ParticipantRole.PARTICIPANT
            )
            participants[user_id] = participant
        
        # Convert tasks
        tasks = []
        for task_data in data.get('tasks', []):
            task = DomainTask(
                text=TaskText(task_data['text']),
                index=task_data['index'],
                result=VoteResult(task_data.get('result', 'pending')),
                status=TaskStatus.COMPLETED if task_data.get('result') == 'completed' else TaskStatus.PENDING
            )
            
            # Convert votes
            for user_id_str, vote_data in task_data.get('votes', {}).items():
                uid = UserId(int(user_id_str))
                vote = DomainVote(
                    user_id=uid,
                    value=VoteValue(vote_data['value']),
                    timestamp=datetime.fromisoformat(vote_data['timestamp'])
                )
                task.votes[uid] = vote
            
            tasks.append(task)
        
        # Create domain session
        session = DomainSession(
            chat_id=chat_id,
            topic_id=topic_id,
            batch_size=data.get('batch_size', 10)
        )
        
        # Set all other fields manually
        session.participants = participants
        session.tasks = tasks
        session.current_task_index = data.get('current_task_index', 0)
        session.current_batch_index = data.get('current_batch_index', 0)
        session.history = data.get('history', [])
        session.last_batch = data.get('last_batch', [])
        session.status = SessionStatus(data.get('status', 'idle'))
        session.active_vote_message_id = data.get('active_vote_message_id')
        session.vote_deadline = datetime.fromisoformat(data['vote_deadline']) if data.get('vote_deadline') else None
        session.default_timeout = TimeoutSeconds(data.get('default_timeout', 90))
        session.scale = data.get('scale', ['1', '2', '3', '5', '8', '13'])
        session.created_at = datetime.fromisoformat(data.get('created_at', datetime.now().isoformat()))
        session.updated_at = datetime.fromisoformat(data.get('updated_at', datetime.now().isoformat()))
        
        return session
    
    def _convert_votes_dict(self, votes: dict) -> dict:
        """Convert votes dictionary safely"""
        votes_dict = {}
        for user_id, vote in votes.items():
            try:
                user_id_str = str(user_id.value if hasattr(user_id, 'value') else user_id)
                user_id_value = user_id.value if hasattr(user_id, 'value') else user_id
                vote_value = vote.value.value if hasattr(vote.value, 'value') else vote.value
                
                votes_dict[user_id_str] = {
                    'user_id': user_id_value,
                    'value': vote_value,
                    'timestamp': vote.timestamp.isoformat()
                }
            except AttributeError as e:
                logger.error(f"CONVERT_VOTES_DICT: Error processing vote: {e}, user_id: {user_id}, vote: {vote}")
                # Fallback to string conversion
                user_id_str = str(user_id)
                votes_dict[user_id_str] = {
                    'user_id': user_id,
                    'value': str(vote.value),
                    'timestamp': vote.timestamp.isoformat()
                }
        return votes_dict
    
    def _convert_from_domain(self, session: DomainSession) -> Dict[str, Any]:
        """Convert domain entity to storage data"""
        return {
            'chat_id': session.chat_id.value,
            'topic_id': session.topic_id.value,
            'participants': {
                str(user_id.value if hasattr(user_id, 'value') else user_id): {
                    'user_id': user_id.value if hasattr(user_id, 'value') else user_id,
                    'username': participant.username.value,
                    'full_name': participant.full_name.value,
                    'is_admin': participant.is_admin()
                }
                for user_id, participant in session.participants.items()
            },
            'tasks': [
                {
                    'text': task.text.value,
                    'index': task.index,
                    'votes': self._convert_votes_dict(task.votes),
                    'result': task.result.value,
                    'deadline': task.deadline.isoformat() if task.deadline else None
                }
                for task in session.tasks
            ],
            'current_task_index': session.current_task_index,
            'current_batch_index': session.current_batch_index,
            'batch_size': session.batch_size,
            'history': session.history,
            'last_batch': session.last_batch,
            'status': session.status.value,
            'active_vote_message_id': session.active_vote_message_id,
            'vote_deadline': session.vote_deadline.isoformat() if session.vote_deadline else None,
            'default_timeout': session.default_timeout.value,
            'scale': session.scale,
            'created_at': session.created_at.isoformat(),
            'updated_at': session.updated_at.isoformat()
        }
    
    def get_session(self, chat_id: int, topic_id: int) -> DomainSession:
        """Get or create session"""
        sessions = self._load_sessions()
        session_key = f"{chat_id}_{topic_id}"
        
        if session_key in sessions:
            return self._convert_to_domain(sessions[session_key])
        
        # Create new session
        new_session = DomainSession(
            chat_id=ChatId(chat_id),
            topic_id=TopicId(topic_id)
        )
        
        self.save_session(new_session)
        return new_session
    
    def save_session(self, session: DomainSession) -> None:
        """Save session"""
        sessions = self._load_sessions()
        session_key = session.session_key.value
        sessions[session_key] = self._convert_from_domain(session)
        self._save_sessions(sessions)
        logger.debug(f"Saved session: {session_key}")
    
    def get_today_history(self, chat_id: int, topic_id: int) -> List[Dict[str, Any]]:
        """Get history for today"""
        session = self.get_session(chat_id, topic_id)
        today = datetime.now().date()
        
        today_history = []
        for task in session.history:
            task_date = datetime.fromisoformat(task['timestamp']).date()
            if task_date == today:
                today_history.append(task)
        
        return today_history
    
    def cleanup_old_sessions(self, days: int = 7) -> None:
        """Cleanup old sessions"""
        sessions = self._load_sessions()
        cutoff_date = datetime.now() - timedelta(days=days)
        
        sessions_to_remove = []
        for session_key, session_data in sessions.items():
            try:
                updated_at = datetime.fromisoformat(session_data.get('updated_at', ''))
                if updated_at < cutoff_date:
                    sessions_to_remove.append(session_key)
            except (ValueError, KeyError):
                # Remove sessions with invalid dates
                sessions_to_remove.append(session_key)
        
        for session_key in sessions_to_remove:
            del sessions[session_key]
            logger.info(f"Removed old session: {session_key}")
        
        if sessions_to_remove:
            self._save_sessions(sessions)
