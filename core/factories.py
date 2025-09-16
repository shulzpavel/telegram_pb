"""
Factory classes for object creation
"""
from typing import List, Optional, Dict, Any
from datetime import datetime
from aiogram import types

from domain.entities import (
    DomainSession, DomainParticipant, DomainTask, DomainVote, DomainGroupConfig
)
from domain.value_objects import (
    ChatId, TopicId, UserId, TaskText, VoteValue, Username, FullName, 
    TimeoutSeconds, Token
)
from domain.enums import ParticipantRole, SessionStatus, TaskStatus, VoteResult
from core.validators import (
    ParticipantValidator, TaskValidator, VoteValidator, GroupConfigValidator
)
from core.exceptions import ValidationError


class ParticipantFactory:
    """Factory for creating participants"""
    
    @staticmethod
    def from_telegram_user(user: types.User, is_admin: bool = False) -> DomainParticipant:
        """Create participant from Telegram user"""
        try:
            validator = ParticipantValidator(
                user_id=user.id,
                username=user.username or "",
                full_name=user.full_name or f"User {user.id}",
                is_admin=is_admin
            )
            
            return DomainParticipant(
                user_id=UserId(validator.user_id),
                username=Username(validator.username),
                full_name=FullName(validator.full_name),
                role=ParticipantRole.ADMIN if is_admin else ParticipantRole.PARTICIPANT
            )
        except Exception as e:
            raise ValidationError(f"Invalid participant data: {e}")
    
    @staticmethod
    def from_dict(data: Dict[str, Any]) -> DomainParticipant:
        """Create participant from dictionary"""
        try:
            validator = ParticipantValidator(**data)
            
            return DomainParticipant(
                user_id=UserId(validator.user_id),
                username=Username(validator.username),
                full_name=FullName(validator.full_name),
                role=ParticipantRole.ADMIN if validator.is_admin else ParticipantRole.PARTICIPANT
            )
        except Exception as e:
            raise ValidationError(f"Invalid participant data: {e}")


class TaskFactory:
    """Factory for creating tasks"""
    
    @staticmethod
    def from_text(text: str, index: int = 0) -> DomainTask:
        """Create task from text"""
        try:
            validator = TaskValidator(text=text, index=index)
            
            return DomainTask(
                text=TaskText(validator.text),
                index=validator.index
            )
        except Exception as e:
            raise ValidationError(f"Invalid task data: {e}")
    
    @staticmethod
    def from_list(task_texts: List[str]) -> List[DomainTask]:
        """Create tasks from list of texts"""
        tasks = []
        for i, text in enumerate(task_texts):
            tasks.append(TaskFactory.from_text(text, i))
        return tasks
    
    @staticmethod
    def from_dict(data: Dict[str, Any]) -> DomainTask:
        """Create task from dictionary"""
        try:
            validator = TaskValidator(**data)
            
            task = DomainTask(
                text=TaskText(validator.text),
                index=validator.index
            )
            
            # Add votes if present
            if 'votes' in data:
                for user_id_str, vote_data in data['votes'].items():
                    vote = VoteFactory.from_dict(vote_data)
                    task.votes[UserId(int(user_id_str))] = vote
            
            return task
        except Exception as e:
            raise ValidationError(f"Invalid task data: {e}")


class VoteFactory:
    """Factory for creating votes"""
    
    @staticmethod
    def create(user_id: int, value: str, timestamp: Optional[datetime] = None) -> DomainVote:
        """Create vote"""
        try:
            validator = VoteValidator(
                user_id=user_id,
                value=value,
                timestamp=(timestamp or datetime.now()).isoformat()
            )
            
            return DomainVote(
                user_id=UserId(validator.user_id),
                value=VoteValue(validator.value),
                timestamp=datetime.fromisoformat(validator.timestamp)
            )
        except Exception as e:
            raise ValidationError(f"Invalid vote data: {e}")
    
    @staticmethod
    def from_dict(data: Dict[str, Any]) -> DomainVote:
        """Create vote from dictionary"""
        try:
            validator = VoteValidator(**data)
            
            return DomainVote(
                user_id=UserId(validator.user_id),
                value=VoteValue(validator.value),
                timestamp=datetime.fromisoformat(validator.timestamp)
            )
        except Exception as e:
            raise ValidationError(f"Invalid vote data: {e}")


class SessionFactory:
    """Factory for creating sessions"""
    
    @staticmethod
    def create(chat_id: int, topic_id: int, **kwargs) -> DomainSession:
        """Create new session"""
        try:
            session = DomainSession(
                chat_id=ChatId(chat_id),
                topic_id=TopicId(topic_id),
                **kwargs
            )
            return session
        except Exception as e:
            raise ValidationError(f"Invalid session data: {e}")
    
    @staticmethod
    def from_dict(data: Dict[str, Any]) -> DomainSession:
        """Create session from dictionary"""
        try:
            # Create base session
            session = DomainSession(
                chat_id=ChatId(data['chat_id']),
                topic_id=TopicId(data['topic_id']),
                current_task_index=data.get('current_task_index', 0),
                current_batch_index=data.get('current_batch_index', 0),
                batch_size=data.get('batch_size', 10),
                history=data.get('history', []),
                last_batch=data.get('last_batch', []),
                status=SessionStatus(data.get('status', 'idle')),
                active_vote_message_id=data.get('active_vote_message_id'),
                vote_deadline=datetime.fromisoformat(data['vote_deadline']) if data.get('vote_deadline') else None,
                default_timeout=TimeoutSeconds(data.get('default_timeout', 90)),
                scale=data.get('scale', ['1', '2', '3', '5', '8', '13']),
                created_at=datetime.fromisoformat(data.get('created_at', datetime.now().isoformat())),
                updated_at=datetime.fromisoformat(data.get('updated_at', datetime.now().isoformat()))
            )
            
            # Add participants
            for user_id_str, participant_data in data.get('participants', {}).items():
                participant = ParticipantFactory.from_dict(participant_data)
                session.participants[UserId(int(user_id_str))] = participant
            
            # Add tasks
            for task_data in data.get('tasks', []):
                task = TaskFactory.from_dict(task_data)
                session.tasks.append(task)
            
            return session
        except Exception as e:
            raise ValidationError(f"Invalid session data: {e}")


class GroupConfigFactory:
    """Factory for creating group configurations"""
    
    @staticmethod
    def create(chat_id: int, topic_id: int, **kwargs) -> DomainGroupConfig:
        """Create group configuration"""
        try:
            validator = GroupConfigValidator(
                chat_id=chat_id,
                topic_id=topic_id,
                **kwargs
            )
            
            return DomainGroupConfig(
                chat_id=ChatId(validator.chat_id),
                topic_id=TopicId(validator.topic_id),
                admins=[Username(admin) for admin in validator.admins],
                timeout=TimeoutSeconds(validator.timeout),
                scale=validator.scale,
                is_active=validator.is_active
            )
        except Exception as e:
            raise ValidationError(f"Invalid group config data: {e}")
    
    @staticmethod
    def from_dict(data: Dict[str, Any]) -> DomainGroupConfig:
        """Create group configuration from dictionary"""
        try:
            validator = GroupConfigValidator(**data)
            
            return DomainGroupConfig(
                chat_id=ChatId(validator.chat_id),
                topic_id=TopicId(validator.topic_id),
                admins=[Username(admin) for admin in validator.admins],
                timeout=TimeoutSeconds(validator.timeout),
                scale=validator.scale,
                is_active=validator.is_active
            )
        except Exception as e:
            raise ValidationError(f"Invalid group config data: {e}")


class MessageFactory:
    """Factory for creating formatted messages"""
    
    @staticmethod
    def create_voting_message(
        task_text: str, 
        participants: List[DomainParticipant],
        current_index: int,
        total_tasks: int,
        remaining_time: Optional[int] = None
    ) -> str:
        """Create voting message"""
        progress = f"({current_index + 1}/{total_tasks})"
        
        message = f"🗳️ **ГОЛОСОВАНИЕ** {progress}\n\n"
        message += f"📝 **Задача:** {task_text}\n\n"
        
        if remaining_time:
            minutes = remaining_time // 60
            seconds = remaining_time % 60
            message += f"⏰ **Осталось:** {minutes:02d}:{seconds:02d}\n\n"
        
        message += f"👥 **Участники:** {len(participants)}\n"
        
        return message
    
    @staticmethod
    def create_results_message(
        task_text: str,
        votes: Dict[UserId, DomainVote],
        participants: Dict[UserId, DomainParticipant]
    ) -> str:
        """Create results message"""
        message = f"📊 **РЕЗУЛЬТАТЫ ГОЛОСОВАНИЯ**\n\n"
        message += f"📝 **Задача:** {task_text}\n\n"
        
        if not votes:
            message += "❌ Голосов не было\n"
            return message
        
        # Show individual votes
        message += "🗳️ **Голоса:**\n"
        for user_id, vote in votes.items():
            participant = participants.get(user_id)
            name = participant.full_name.value if participant else f"User {user_id.value}"
            message += f"• {name}: **{vote.value.value}**\n"
        
        # Calculate and show result
        numeric_votes = []
        for vote in votes.values():
            try:
                numeric_votes.append(float(vote.value.value))
            except ValueError:
                continue
        
        if numeric_votes:
            max_vote = max(numeric_votes)
            message += f"\n🎯 **Результат:** {max_vote}"
        
        return message
