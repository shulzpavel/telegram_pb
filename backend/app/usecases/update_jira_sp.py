"""Use case for updating Jira story points."""

import asyncio
import os
from typing import List, Optional, Tuple

from app.domain.session import Session
from app.ports.jira_client import JiraClient
from app.ports.session_repository import SessionRepository
from app.usecases.show_results import VotingPolicy


class UpdateJiraStoryPointsUseCase:
    """Use case for updating story points in Jira."""

    def __init__(self, jira_client: JiraClient, session_repo: SessionRepository):
        self.jira_client = jira_client
        self.session_repo = session_repo
        self.policy = VotingPolicy()

    async def execute(
        self,
        chat_id: int,
        topic_id: Optional[int],
        skip_errors: bool = False,
    ) -> Tuple[int, List[str], List[str]]:
        """Update story points in Jira for last batch tasks.
        
        Returns:
            Tuple of (updated_count, failed_keys, skipped_reasons)
        """
        session = await self.session_repo.get_session(chat_id, topic_id)
        
        if not session.last_batch:
            return 0, [], []
        
        updated = 0
        failed: List[str] = []
        skipped: List[str] = []
        pending_updates = []
        
        for task in session.last_batch:
            if not task.jira_key:
                skipped.append(f"{task.jira_key or 'Без ключа'}: нет ключа Jira")
                continue
            
            if not task.votes:
                if skip_errors:
                    skipped.append(f"{task.jira_key}: нет голосов")
                    continue
                failed.append(task.jira_key)
                continue
            
            story_points = self.policy.get_max_vote(task.votes)
            if story_points == 0:
                if skip_errors:
                    skipped.append(f"{task.jira_key}: нет валидных голосов")
                    continue
                failed.append(task.jira_key)
                continue
            
            pending_updates.append((task, task.jira_key, story_points))

        if skip_errors:
            concurrency = max(1, int(os.getenv("JIRA_UPDATE_CONCURRENCY", "5")))
            semaphore = asyncio.Semaphore(concurrency)

            async def update_one(jira_key: str, story_points: int) -> tuple[str, bool]:
                async with semaphore:
                    return jira_key, await self.jira_client.update_story_points(jira_key, story_points)

            results = await asyncio.gather(
                *(update_one(jira_key, story_points) for _, jira_key, story_points in pending_updates)
            )
            result_by_key = dict(results)
            for task, jira_key, story_points in pending_updates:
                if result_by_key.get(jira_key):
                    task.story_points = story_points
                    updated += 1
                else:
                    failed.append(jira_key)
        else:
            for task, jira_key, story_points in pending_updates:
                if await self.jira_client.update_story_points(jira_key, story_points):
                    task.story_points = story_points
                    updated += 1
                else:
                    failed.append(jira_key)
                    break

        if updated:
            await self.session_repo.save_session(session)
        
        return updated, failed, skipped
