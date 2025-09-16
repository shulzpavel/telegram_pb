"""
Jira Update Service for Story Points Integration

This service handles updating Story Points in Jira tasks based on voting results.
"""

import logging
import aiohttp
import asyncio
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class UpdateResult:
    """Result of Story Points update operation"""
    issue_key: str
    success: bool
    story_points: int
    error_message: Optional[str] = None


class JiraUpdateService:
    """Service for updating Story Points in Jira tasks"""
    
    def __init__(self, jira_base_url: str, jira_email: str, jira_token: str, 
                 story_points_field_id: str = "customfield_10022"):
        """
        Initialize Jira Update Service
        
        Args:
            jira_base_url: Base URL of Jira instance
            jira_email: Email for Jira authentication
            jira_token: API token for Jira authentication
            story_points_field_id: ID of Story Points field in Jira
        """
        self.jira_base_url = jira_base_url.rstrip('/')
        self.jira_email = jira_email
        self.jira_token = jira_token
        self.story_points_field_id = story_points_field_id
        self.auth = aiohttp.BasicAuth(jira_email, jira_token)
        
        logger.info(f"JiraUpdateService initialized for {jira_base_url}")
        logger.info(f"Story Points field ID: {story_points_field_id}")
    
    async def is_jira_available(self) -> bool:
        """
        Check if Jira is available and accessible
        
        Returns:
            bool: True if Jira is available, False otherwise
        """
        try:
            async with aiohttp.ClientSession() as session:
                url = f"{self.jira_base_url}/rest/api/3/myself"
                logger.info(f"Checking Jira availability at: {url}")
                
                async with session.get(url, auth=self.auth, timeout=10) as response:
                    response_text = await response.text()
                    
                    if response.status == 200:
                        logger.info("✅ Jira is available and accessible")
                        return True
                    elif response.status == 401:
                        logger.error("❌ Jira authentication failed - check email and token")
                        return False
                    elif response.status == 403:
                        logger.error("❌ Jira access forbidden - check permissions")
                        return False
                    elif response.status == 404:
                        logger.error("❌ Jira endpoint not found - check base URL")
                        return False
                    else:
                        logger.warning(f"❌ Jira returned status {response.status}: {response_text}")
                        return False
                        
        except aiohttp.ClientTimeout:
            logger.error("❌ Jira connection timeout - server may be down")
            return False
        except aiohttp.ClientConnectorError as e:
            logger.error(f"❌ Cannot connect to Jira: {e}")
            return False
        except Exception as e:
            logger.error(f"❌ Failed to check Jira availability: {e}")
            return False
    
    async def update_story_points(self, issue_key: str, story_points: int) -> UpdateResult:
        """
        Update Story Points for a specific Jira issue
        
        Args:
            issue_key: Jira issue key (e.g., "FLEX-123")
            story_points: Story Points value to set
            
        Returns:
            UpdateResult: Result of the update operation
        """
        logger.info(f"Updating Story Points for {issue_key} to {story_points}")
        
        try:
            # Prepare the update payload
            payload = {
                "fields": {
                    self.story_points_field_id: story_points
                }
            }
            
            async with aiohttp.ClientSession() as session:
                url = f"{self.jira_base_url}/rest/api/3/issue/{issue_key}"
                
                async with session.put(
                    url, 
                    json=payload, 
                    auth=self.auth, 
                    timeout=30,
                    headers={"Content-Type": "application/json"}
                ) as response:
                    
                    response_text = await response.text()
                    
                    if response.status == 204:  # No Content - successful update
                        logger.info(f"✅ Successfully updated {issue_key} to {story_points} SP")
                        return UpdateResult(
                            issue_key=issue_key,
                            success=True,
                            story_points=story_points
                        )
                    elif response.status == 400:
                        logger.error(f"❌ Bad request for {issue_key}: {response_text}")
                        return UpdateResult(
                            issue_key=issue_key,
                            success=False,
                            error=f"Bad request: {response_text}"
                        )
                    elif response.status == 401:
                        logger.error(f"❌ Authentication failed for {issue_key}")
                        return UpdateResult(
                            issue_key=issue_key,
                            success=False,
                            error="Authentication failed"
                        )
                    elif response.status == 403:
                        logger.error(f"❌ Permission denied for {issue_key}: {response_text}")
                        return UpdateResult(
                            issue_key=issue_key,
                            success=False,
                            error=f"Permission denied: {response_text}"
                        )
                    elif response.status == 404:
                        logger.error(f"❌ Issue {issue_key} not found")
                        return UpdateResult(
                            issue_key=issue_key,
                            success=False,
                            error="Issue not found"
                        )
                    else:
                        error_text = await response.text()
                        logger.error(f"Failed to update {issue_key}: {response.status} - {error_text}")
                        return UpdateResult(
                            issue_key=issue_key,
                            success=False,
                            story_points=story_points,
                            error_message=f"HTTP {response.status}: {error_text}"
                        )
                        
        except aiohttp.ClientTimeout:
            logger.error(f"❌ Timeout updating {issue_key} - Jira server may be slow")
            return UpdateResult(
                issue_key=issue_key,
                success=False,
                error="Request timeout - Jira server may be slow"
            )
        except aiohttp.ClientConnectorError as e:
            logger.error(f"❌ Cannot connect to Jira for {issue_key}: {e}")
            return UpdateResult(
                issue_key=issue_key,
                success=False,
                error="Cannot connect to Jira server"
            )
        except Exception as e:
            logger.error(f"❌ Unexpected error updating {issue_key}: {e}")
            return UpdateResult(
                issue_key=issue_key,
                success=False,
                error=f"Unexpected error: {str(e)}"
            )
    
    async def update_multiple_story_points(self, updates: List[Tuple[str, int]]) -> List[UpdateResult]:
        """
        Update Story Points for multiple Jira issues
        
        Args:
            updates: List of tuples (issue_key, story_points)
            
        Returns:
            List[UpdateResult]: Results of all update operations
        """
        logger.info(f"Starting batch update of {len(updates)} issues")
        
        # Check Jira availability first
        if not await self.is_jira_available():
            logger.error("Jira is not available, aborting batch update")
            return [
                UpdateResult(
                    issue_key=issue_key,
                    success=False,
                    story_points=story_points,
                    error_message="Jira is not available"
                )
                for issue_key, story_points in updates
            ]
        
        # Process updates with rate limiting
        results = []
        for issue_key, story_points in updates:
            result = await self.update_story_points(issue_key, story_points)
            results.append(result)
            
            # Rate limiting: wait 100ms between requests
            await asyncio.sleep(0.1)
        
        # Log summary
        successful = sum(1 for r in results if r.success)
        failed = len(results) - successful
        logger.info(f"Batch update completed: {successful} successful, {failed} failed")
        
        return results
    
    def generate_update_report(self, results: List[UpdateResult]) -> str:
        """
        Generate a human-readable report of update results
        
        Args:
            results: List of update results
            
        Returns:
            str: Formatted report
        """
        successful = [r for r in results if r.success]
        failed = [r for r in results if not r.success]
        
        report = "🔄 **Обновление Story Points завершено!**\n\n"
        
        if successful:
            report += f"✅ **Успешно обновлено: {len(successful)} задач**\n"
            for result in successful:
                report += f"• {result.issue_key}: {result.story_points} SP\n"
            report += "\n"
        
        if failed:
            report += f"❌ **Ошибки: {len(failed)} задач**\n"
            for result in failed:
                report += f"• {result.issue_key}: {result.error_message}\n"
            report += "\n"
        
        report += f"📊 **Итого: {len(results)} задач обработано**"
        
        return report
