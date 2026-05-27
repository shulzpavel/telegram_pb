"""Tests for task queue management use cases."""

from pathlib import Path

import pytest

from app.adapters.session_file import FileSessionRepository
from app.domain.session import Session
from app.domain.task import Task
from app.usecases.manage_tasks import (
    AddManualTasksUseCase,
    DeleteTaskUseCase,
    MoveTaskUseCase,
    ReorderTasksUseCase,
    TaskQueueError,
    UpdateTaskUseCase,
)


def temp_repo(name: str) -> tuple[FileSessionRepository, Path]:
    path = Path(f"/tmp/{name}.json")
    if path.exists():
        path.unlink()
    return FileSessionRepository(path), path


class TestTaskIdentity:
    def test_task_serialization_preserves_stable_id_and_source(self):
        task = Task(jira_key="PROJ-1", summary="Build", source="jira")

        loaded = Task.from_dict(task.to_dict())

        assert loaded.task_id == task.task_id
        assert loaded.source == "jira"
        assert loaded.created_at == task.created_at

    def test_legacy_task_gets_deterministic_id(self):
        payload = {"jira_key": "OLD-1", "summary": "Legacy"}

        first = Task.from_dict(payload)
        second = Task.from_dict(payload)

        assert first.task_id == second.task_id
        assert first.source == "jira"


class TestTaskQueueManagement:
    @pytest.mark.asyncio
    async def test_add_manual_tasks_bumps_version(self):
        # ``AddManualTasksUseCase`` still accepts a list (used by both the
        # single-task endpoint and the Jira import path), but the legacy
        # "bulk paste" HTTP route has been removed — see the matching
        # frontend cleanup in ManagerPage / SessionsPage. This test
        # exercises the underlying use case directly.
        repo, path = temp_repo("test_add_manual_tasks")
        try:
            await repo.save_session(Session(chat_id=1, topic_id=None))
            use_case = AddManualTasksUseCase(repo)

            result = await use_case.execute(
                1,
                None,
                [
                    {"summary": "Manual 1"},
                    {"summary": "Manual 2", "jira_key": "PROJ-2"},
                ],
                expected_version=0,
            )

            session = await repo.get_session(1, None)
            assert result.session.tasks_version == 1
            assert len(session.tasks_queue) == 2
            assert session.tasks_queue[0].source == "manual"
            assert session.tasks_queue[1].jira_key == "PROJ-2"
        finally:
            if path.exists():
                path.unlink()

    @pytest.mark.asyncio
    async def test_update_rejects_stale_version(self):
        repo, path = temp_repo("test_update_rejects_stale_version")
        try:
            session = Session(chat_id=1, topic_id=None)
            task = Task(summary="Old")
            session.tasks_queue = [task]
            session.tasks_version = 2
            await repo.save_session(session)

            use_case = UpdateTaskUseCase(repo)

            with pytest.raises(TaskQueueError) as exc:
                await use_case.execute(1, None, task.task_id, "New", expected_version=1)

            assert exc.value.status_code == 409
        finally:
            if path.exists():
                path.unlink()

    @pytest.mark.asyncio
    async def test_delete_preserves_current_task_by_id(self):
        repo, path = temp_repo("test_delete_preserves_current_task_by_id")
        try:
            task1 = Task(summary="One")
            task2 = Task(summary="Two")
            task3 = Task(summary="Three")
            session = Session(chat_id=1, topic_id=None, tasks_queue=[task1, task2, task3], current_task_index=1)
            await repo.save_session(session)

            use_case = DeleteTaskUseCase(repo)
            await use_case.execute(1, None, task1.task_id, expected_version=0)

            updated = await repo.get_session(1, None)
            assert updated.current_task.task_id == task2.task_id
            assert updated.current_task_index == 0
            assert [task.summary for task in updated.tasks_queue] == ["Two", "Three"]
        finally:
            if path.exists():
                path.unlink()

    @pytest.mark.asyncio
    async def test_cannot_delete_or_move_current_task_while_active(self):
        repo, path = temp_repo("test_current_task_locked")
        try:
            task = Task(summary="Current")
            session = Session(
                chat_id=1,
                topic_id=None,
                tasks_queue=[task, Task(summary="Next")],
                current_task_index=0,
                current_batch_started_at="2026-01-01T00:00:00",
            )
            await repo.save_session(session)

            with pytest.raises(TaskQueueError):
                await DeleteTaskUseCase(repo).execute(1, None, task.task_id, expected_version=0)

            with pytest.raises(TaskQueueError):
                await MoveTaskUseCase(repo).execute(1, None, task.task_id, 1, expected_version=0)
        finally:
            if path.exists():
                path.unlink()

    @pytest.mark.asyncio
    async def test_move_preserves_current_task_by_id(self):
        repo, path = temp_repo("test_move_preserves_current_task_by_id")
        try:
            task1 = Task(summary="One")
            task2 = Task(summary="Two")
            task3 = Task(summary="Three")
            session = Session(chat_id=1, topic_id=None, tasks_queue=[task1, task2, task3], current_task_index=1)
            await repo.save_session(session)

            await MoveTaskUseCase(repo).execute(1, None, task3.task_id, 0, expected_version=0)

            updated = await repo.get_session(1, None)
            assert [task.summary for task in updated.tasks_queue] == ["Three", "One", "Two"]
            assert updated.current_task.task_id == task2.task_id
            assert updated.current_task_index == 2
        finally:
            if path.exists():
                path.unlink()

    @pytest.mark.asyncio
    async def test_reorder_preserves_current_task_by_id(self):
        repo, path = temp_repo("test_reorder_preserves_current_task_by_id")
        try:
            task1 = Task(summary="One")
            task2 = Task(summary="Two")
            task3 = Task(summary="Three")
            session = Session(chat_id=1, topic_id=None, tasks_queue=[task1, task2, task3], current_task_index=1)
            await repo.save_session(session)

            await ReorderTasksUseCase(repo).execute(
                1,
                None,
                [task3.task_id, task1.task_id, task2.task_id],
                expected_version=0,
            )

            updated = await repo.get_session(1, None)
            assert [task.summary for task in updated.tasks_queue] == ["Three", "One", "Two"]
            assert updated.current_task.task_id == task2.task_id
            assert updated.current_task_index == 2
        finally:
            if path.exists():
                path.unlink()

    @pytest.mark.asyncio
    async def test_reorder_rejects_moving_current_task_while_active(self):
        repo, path = temp_repo("test_reorder_rejects_current_task_move")
        try:
            task1 = Task(summary="One")
            task2 = Task(summary="Two")
            session = Session(
                chat_id=1,
                topic_id=None,
                tasks_queue=[task1, task2],
                current_task_index=0,
                current_batch_started_at="2026-01-01T00:00:00",
            )
            await repo.save_session(session)

            with pytest.raises(TaskQueueError) as exc:
                await ReorderTasksUseCase(repo).execute(1, None, [task2.task_id, task1.task_id], expected_version=0)

            assert exc.value.status_code == 409
        finally:
            if path.exists():
                path.unlink()
