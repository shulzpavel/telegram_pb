"""Use case for updating Jira story points."""

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
            
            if await self.jira_client.update_story_points(task.jira_key, story_points):
                task.story_points = story_points
                updated += 1
            else:
                if skip_errors:
                    failed.append(task.jira_key)
                else:
                    failed.append(task.jira_key)
        
        if updated > 0:
            await self.session_repo.save_session(session)
        
        return updated, failed, skipped
