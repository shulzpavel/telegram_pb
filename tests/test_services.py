"""Tests for services."""

import pytest

from app.models.participant import Participant
from app.models.session import Session
from app.models.task import Task
from app.services.task_service import TaskService
from app.services.voting_service import VotingService
from config import UserRole


class TestVotingService:
    """Tests for VotingService."""

    def test_count_votes(self):
        """Test vote counting."""
        votes = {1: "5", 2: "8", 3: "5"}
        assert VotingService.count_votes(votes) == 3

    def test_get_most_common_vote(self):
        """Test getting most common vote."""
        votes = {1: "5", 2: "8", 3: "5", 4: "5"}
        assert VotingService.get_most_common_vote(votes) == 5

    def test_calculate_average_vote(self):
        """Test calculating average vote."""
        votes = {1: "5", 2: "8", 3: "3"}
        avg = VotingService.calculate_average_vote(votes)
        assert abs(avg - 5.33) < 0.1

    def test_all_voters_voted(self):
        """Test checking if all voters voted."""
        session = Session(chat_id=123, topic_id=456)
        task = Task(summary="Test")
        session.tasks_queue.append(task)
        session.current_task_index = 0

        participant1 = Participant(user_id=1, name="User1", role=UserRole.PARTICIPANT)
        participant2 = Participant(user_id=2, name="User2", role=UserRole.PARTICIPANT)
        session.participants[1] = participant1
        session.participants[2] = participant2

        assert VotingService.all_voters_voted(session) is False

        task.votes[1] = "5"
        assert VotingService.all_voters_voted(session) is False

        task.votes[2] = "8"
        assert VotingService.all_voters_voted(session) is True

    def test_complete_task(self):
        """Test completing a task."""
        session = Session(chat_id=123, topic_id=456)
        task = Task(summary="Test")
        session.tasks_queue.append(task)
        session.current_task_index = 0

        VotingService.complete_task(session)
        assert session.current_task.completed_at is not None

    def test_finish_batch(self):
        """Test finishing a batch."""
        session = Session(chat_id=123, topic_id=456)
        task1 = Task(summary="Task 1")
        task2 = Task(summary="Task 2")
        session.tasks_queue = [task1, task2]

        completed = VotingService.finish_batch(session)
        assert len(completed) == 2
        assert len(session.tasks_queue) == 0
        assert len(session.last_batch) == 2
        assert len(session.history) == 2
        assert session.batch_completed is True


class TestTaskService:
    """Tests for TaskService."""

    def test_prepare_task_from_jira(self):
        """Test preparing task from Jira issue."""
        issue = {
            "key": "TEST-1",
            "summary": "Test task",
            "url": "https://test.com/TEST-1",
            "story_points": 5,
        }
        task = TaskService.prepare_task_from_jira(issue)
        assert task.jira_key == "TEST-1"
        assert task.summary == "Test task"
        assert task.story_points == 5

    def test_start_voting_session(self):
        """Test starting voting session."""
        session = Session(chat_id=123, topic_id=456)
        task = Task(summary="Test")
        session.tasks_queue.append(task)

        result = TaskService.start_voting_session(session)
        assert result is True
        assert session.current_task_index == 0
        assert session.batch_completed is False

    def test_start_voting_session_empty(self):
        """Test starting voting session with no tasks."""
        session = Session(chat_id=123, topic_id=456)
        result = TaskService.start_voting_session(session)
        assert result is False

    def test_move_to_next_task(self):
        """Test moving to next task."""
        session = Session(chat_id=123, topic_id=456)
        task1 = Task(summary="Task 1")
        task2 = Task(summary="Task 2")
        session.tasks_queue = [task1, task2]
        session.current_task_index = 0

        next_task = TaskService.move_to_next_task(session)
        assert session.current_task_index == 1
        assert next_task == task2

