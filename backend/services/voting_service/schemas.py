"""Shared Pydantic schemas for task management APIs."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class TaskInput(BaseModel):
    summary: str = Field(min_length=1, max_length=500)
    jira_key: Optional[str] = Field(default=None, max_length=64)
    url: Optional[str] = Field(default=None, max_length=1000)
    story_points: Optional[int] = Field(default=None, ge=0, le=1000)


class TaskCreateRequest(TaskInput):
    expected_version: Optional[int] = Field(default=None, ge=0)


class TaskBulkCreateRequest(BaseModel):
    tasks: list[TaskInput] = Field(min_length=1, max_length=500)
    expected_version: Optional[int] = Field(default=None, ge=0)


class TaskUpdateRequest(TaskInput):
    expected_version: Optional[int] = Field(default=None, ge=0)


class TaskMoveRequest(BaseModel):
    target_index: int = Field(ge=0)
    expected_version: Optional[int] = Field(default=None, ge=0)


class TaskReorderRequest(BaseModel):
    ordered_task_ids: list[str] = Field(min_length=1, max_length=5000)
    expected_version: Optional[int] = Field(default=None, ge=0)


class JiraPreviewRequest(BaseModel):
    jql: str = Field(min_length=1, max_length=5000)
    max_results: int = Field(default=500, ge=1, le=1000)


class JiraImportRequest(JiraPreviewRequest):
    selected_keys: list[str] = Field(default_factory=list, max_length=1000)
    expected_version: Optional[int] = Field(default=None, ge=0)


class FinalEstimateRequest(BaseModel):
    value: int = Field(ge=0, le=1000)
