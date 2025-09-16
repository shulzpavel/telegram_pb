"""
Tests for session control functionality (pause and revoting)
"""
import pytest
from unittest.mock import Mock, AsyncMock
from datetime import datetime

from services.session_control_service import SessionControlService
from domain.entities import DomainSession, DomainTask, DomainParticipant, DomainVote
from domain.value_objects import ChatId, TopicId, UserId, TaskText, VoteValue
from domain.enums import SessionStatus, PauseReason, RevotingStatus, TaskStatus


class TestSessionControlService:
    """Tests for SessionControlService"""
    
    @pytest.fixture
    def mock_session_service(self):
        """Mock session service"""
        return Mock()
    
    @pytest.fixture
    def mock_message_service(self):
        """Mock message service"""
        return Mock()
    
    @pytest.fixture
    def session_control_service(self, mock_session_service, mock_message_service):
        """Session control service instance"""
        return SessionControlService(mock_session_service, mock_message_service)
    
    @pytest.fixture
    def sample_session(self):
        """Sample session for testing"""
        session = DomainSession(
            chat_id=ChatId(-1001234567890),
            topic_id=TopicId(123)
        )
        
        # Add participants
        participant1 = DomainParticipant(
            user_id=UserId(123),
            username="user1",
            full_name="User One"
        )
        participant2 = DomainParticipant(
            user_id=UserId(456),
            username="user2",
            full_name="User Two"
        )
        
        session.add_participant(participant1)
        session.add_participant(participant2)
        
        # Add tasks
        for i in range(15):  # 15 tasks for testing batches
            task = DomainTask(
                text=TaskText(f"Task {i+1}"),
                index=i
            )
            session.tasks.append(task)
        
        session.all_tasks = session.tasks.copy()
        session.batch_size = 10
        
        return session
    
    def test_check_batch_completion_no_revoting_needed(self, session_control_service, mock_session_service, sample_session):
        """Test batch completion when no revoting is needed"""
        # Setup
        sample_session.current_task_index = 10  # End of first batch
        sample_session.current_batch_index = 0
        mock_session_service.get_session.return_value = sample_session
        mock_session_service.save_session.return_value = None
        
        # Test
        result = session_control_service.check_batch_completion(-1001234567890, 123)
        
        # Assertions
        assert result is True
        assert sample_session.is_paused is True
        assert sample_session.pause_reason == PauseReason.BATCH_COMPLETED
        mock_session_service.save_session.assert_called_once()
    
    def test_check_batch_completion_with_revoting_needed(self, session_control_service, mock_session_service, sample_session):
        """Test batch completion when revoting is needed"""
        # Setup - create tasks with significant discrepancies
        for i in range(10):
            task = sample_session.tasks[i]
            # Add votes with significant discrepancy
            vote1 = DomainVote(
                user_id=UserId(123),
                value=VoteValue("2"),
                timestamp=datetime.now()
            )
            vote2 = DomainVote(
                user_id=UserId(456),
                value=VoteValue("13"),
                timestamp=datetime.now()
            )
            task.add_vote(vote1)
            task.add_vote(vote2)
        
        sample_session.current_task_index = 10  # End of first batch
        sample_session.current_batch_index = 0
        mock_session_service.get_session.return_value = sample_session
        mock_session_service.save_session.return_value = None
        
        # Test
        result = session_control_service.check_batch_completion(-1001234567890, 123)
        
        # Assertions
        assert result is True
        assert sample_session.revoting_status == RevotingStatus.IN_PROGRESS
        assert len(sample_session.tasks_needing_revoting) > 0
        mock_session_service.save_session.assert_called_once()
    
    def test_pause_session(self, session_control_service, mock_session_service, sample_session):
        """Test pausing session"""
        # Setup
        sample_session.status = SessionStatus.VOTING
        mock_session_service.get_session.return_value = sample_session
        mock_session_service.save_session.return_value = None
        
        # Test
        result = session_control_service.pause_session(-1001234567890, 123, PauseReason.ADMIN_REQUEST)
        
        # Assertions
        assert result is True
        assert sample_session.is_paused is True
        assert sample_session.pause_reason == PauseReason.ADMIN_REQUEST
        assert sample_session.status == SessionStatus.PAUSED
        mock_session_service.save_session.assert_called_once()
    
    def test_resume_session(self, session_control_service, mock_session_service, sample_session):
        """Test resuming session"""
        # Setup
        sample_session.is_paused = True
        sample_session.pause_reason = PauseReason.BATCH_COMPLETED
        sample_session.status = SessionStatus.PAUSED
        mock_session_service.get_session.return_value = sample_session
        mock_session_service.save_session.return_value = None
        
        # Test
        result = session_control_service.resume_session(-1001234567890, 123)
        
        # Assertions
        assert result is True
        assert sample_session.is_paused is False
        assert sample_session.pause_reason is None
        assert sample_session.status == SessionStatus.VOTING
        mock_session_service.save_session.assert_called_once()
    
    def test_start_revoting(self, session_control_service, mock_session_service, sample_session):
        """Test starting revoting"""
        # Setup
        task_indices = [0, 1, 2]
        mock_session_service.get_session.return_value = sample_session
        mock_session_service.save_session.return_value = None
        
        # Test
        result = session_control_service.start_revoting(-1001234567890, 123, task_indices)
        
        # Assertions
        assert result is True
        assert sample_session.revoting_status == RevotingStatus.IN_PROGRESS
        assert sample_session.tasks_needing_revoting == task_indices
        assert len(sample_session.revoting_tasks) == len(task_indices)
        assert sample_session.status == SessionStatus.REVOTING
        mock_session_service.save_session.assert_called_once()
    
    def test_add_revoting_vote(self, session_control_service, mock_session_service, sample_session):
        """Test adding vote during revoting"""
        # Setup
        sample_session.revoting_status = RevotingStatus.IN_PROGRESS
        sample_session.tasks_needing_revoting = [0]
        sample_session.revoting_tasks = [sample_session.tasks[0]]
        sample_session.current_revoting_index = 0
        sample_session.status = SessionStatus.REVOTING
        
        mock_session_service.get_session.return_value = sample_session
        mock_session_service.save_session.return_value = None
        
        # Test
        result = session_control_service.add_revoting_vote(-1001234567890, 123, 123, "5")
        
        # Assertions
        assert result is True
        current_task = sample_session.get_current_revoting_task()
        assert current_task is not None
        assert len(current_task.votes) == 1
        mock_session_service.save_session.assert_called_once()
    
    def test_complete_revoting_task(self, session_control_service, mock_session_service, sample_session):
        """Test completing revoting task"""
        # Setup
        sample_session.revoting_status = RevotingStatus.IN_PROGRESS
        sample_session.tasks_needing_revoting = [0, 1]
        sample_session.revoting_tasks = [sample_session.tasks[0], sample_session.tasks[1]]
        sample_session.current_revoting_index = 0
        sample_session.status = SessionStatus.REVOTING
        
        mock_session_service.get_session.return_value = sample_session
        mock_session_service.save_session.return_value = None
        
        # Test
        result = session_control_service.complete_revoting_task(-1001234567890, 123)
        
        # Assertions
        assert result is True
        assert sample_session.current_revoting_index == 1
        mock_session_service.save_session.assert_called_once()
    
    def test_get_revoting_status(self, session_control_service, mock_session_service, sample_session):
        """Test getting revoting status"""
        # Setup
        sample_session.revoting_status = RevotingStatus.IN_PROGRESS
        sample_session.tasks_needing_revoting = [0, 1]
        sample_session.current_revoting_index = 0
        sample_session.revoting_tasks = [sample_session.tasks[0], sample_session.tasks[1]]
        
        mock_session_service.get_session.return_value = sample_session
        
        # Test
        status = session_control_service.get_revoting_status(-1001234567890, 123)
        
        # Assertions
        assert status['status'] == 'in_progress'
        assert status['tasks_count'] == 2
        assert status['current_index'] == 0
        assert status['is_in_progress'] is True
    
    def test_get_pause_status(self, session_control_service, mock_session_service, sample_session):
        """Test getting pause status"""
        # Setup
        sample_session.is_paused = True
        sample_session.pause_reason = PauseReason.BATCH_COMPLETED
        sample_session.pause_started_at = datetime.now()
        
        mock_session_service.get_session.return_value = sample_session
        
        # Test
        status = session_control_service.get_pause_status(-1001234567890, 123)
        
        # Assertions
        assert status['is_paused'] is True
        assert status['reason'] == 'batch_completed'
        assert status['started_at'] is not None
    
    def test_analyze_session_for_revoting(self, session_control_service, mock_session_service, sample_session):
        """Test analyzing session for revoting needs"""
        # Setup - create tasks with discrepancies
        for i in range(3):
            task = sample_session.tasks[i]
            vote1 = DomainVote(
                user_id=UserId(123),
                value=VoteValue("2"),
                timestamp=datetime.now()
            )
            vote2 = DomainVote(
                user_id=UserId(456),
                value=VoteValue("13"),
                timestamp=datetime.now()
            )
            task.add_vote(vote1)
            task.add_vote(vote2)
        
        mock_session_service.get_session.return_value = sample_session
        
        # Test
        tasks_needing_revoting = session_control_service.analyze_session_for_revoting(-1001234567890, 123)
        
        # Assertions
        assert len(tasks_needing_revoting) == 3
        for task_info in tasks_needing_revoting:
            assert 'index' in task_info
            assert 'text' in task_info
            assert 'discrepancy_ratio' in task_info
            assert task_info['discrepancy_ratio'] > 3.0
    
    def test_get_batch_progress(self, session_control_service, mock_session_service, sample_session):
        """Test getting batch progress"""
        # Setup
        sample_session.current_batch_index = 0
        sample_session.current_task_index = 5
        sample_session.batch_size = 10
        
        # Mark some tasks as completed
        for i in range(5):
            sample_session.tasks[i].status = TaskStatus.COMPLETED
        
        mock_session_service.get_session.return_value = sample_session
        
        # Test
        progress = session_control_service.get_batch_progress(-1001234567890, 123)
        
        # Assertions
        assert progress['current_batch'] == 1
        assert progress['total_batches'] == 2
        assert progress['batch_size'] == 10
        assert progress['completed_in_batch'] == 5
        assert progress['total_in_batch'] == 10
        assert progress['current_task_index'] == 5
        assert progress['total_tasks'] == 15
    
    def test_is_revoting_all_voted(self, session_control_service, mock_session_service, sample_session):
        """Test checking if all participants voted in revoting"""
        # Setup
        sample_session.revoting_status = RevotingStatus.IN_PROGRESS
        sample_session.tasks_needing_revoting = [0]
        sample_session.revoting_tasks = [sample_session.tasks[0]]
        sample_session.current_revoting_index = 0
        
        # Add votes from both participants
        vote1 = DomainVote(
            user_id=UserId(123),
            value=VoteValue("5"),
            timestamp=datetime.now()
        )
        vote2 = DomainVote(
            user_id=UserId(456),
            value=VoteValue("8"),
            timestamp=datetime.now()
        )
        sample_session.tasks[0].add_vote(vote1)
        sample_session.tasks[0].add_vote(vote2)
        
        mock_session_service.get_session.return_value = sample_session
        
        # Test
        result = session_control_service.is_revoting_all_voted(-1001234567890, 123)
        
        # Assertions
        assert result is True
