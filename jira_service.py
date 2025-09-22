#!/usr/bin/env python3
"""
Сервис для работы с Jira API
"""

import requests
import json
from typing import Dict, Any, Optional, List
from urllib.parse import quote
from config import JIRA_URL, JIRA_USERNAME, JIRA_API_TOKEN, STORY_POINTS_FIELD

class JiraService:
    def __init__(self):
        self.base_url = JIRA_URL
        self.username = JIRA_USERNAME
        self.api_token = JIRA_API_TOKEN
        self.story_points_field = STORY_POINTS_FIELD
        
    def _get_auth(self):
        """Получить данные для аутентификации"""
        return (self.username, self.api_token)
    
    def _make_request(self, method: str, endpoint: str, data: Dict = None) -> Optional[Dict]:
        """Выполнить запрос к Jira API"""
        url = f"{self.base_url}/rest/api/3/{endpoint}"
        auth = self._get_auth()
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json"
        }
        
        try:
            method = method.upper()
            if method == "GET":
                response = requests.get(url, auth=auth, headers=headers)
            elif method == "PUT":
                response = requests.put(url, auth=auth, headers=headers, json=data)
            elif method == "POST":
                response = requests.post(url, auth=auth, headers=headers, json=data)
            else:
                return None
                
            response.raise_for_status()
            
            # Handle responses without body (like 204 No Content)
            if response.status_code == 204 or not response.content:
                return {"success": True}  # Return a success indicator for empty responses

            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"Jira API error: {e}")
            return None
        except ValueError as e:
            # Handle JSON parsing errors for responses that should be JSON but aren't
            print(f"JSON parsing error: {e}")
            return None

    def search_issues(self, jql: str, max_results: int = 50) -> Optional[Dict[str, Any]]:
        """Выполнить поиск задач по произвольному JQL"""
        payload = {
            "jql": jql,
            "startAt": 0,
            "maxResults": max_results,
            "fields": ["summary", self.story_points_field]
        }
        return self._make_request("POST", "search", payload)
    
    def get_issue(self, issue_key: str) -> Optional[Dict]:
        """Получить информацию о задаче"""
        endpoint = f"issue/{issue_key}"
        return self._make_request("GET", endpoint)
    
    def get_issue_summary(self, issue_key: str) -> Optional[str]:
        """Получить название задачи"""
        issue = self.get_issue(issue_key)
        if issue and 'fields' in issue:
            return issue['fields'].get('summary', '')
        return None
    
    def get_issue_url(self, issue_key: str) -> str:
        """Получить ссылку на задачу"""
        return f"{self.base_url}/browse/{issue_key}"
    
    def search_issues(self, jql: str) -> Optional[Dict]:
        """Выполнить поиск задач по JQL запросу"""
        encoded_jql = quote(jql)
        endpoint = f"search/jql?jql={encoded_jql}&fields=summary,{self.story_points_field}"
        return self._make_request("GET", endpoint)
    
    def update_story_points(self, issue_key: str, story_points: int) -> bool:
        """Обновить Story Points для задачи"""
        endpoint = f"issue/{issue_key}"
        data = {
            "fields": {
                self.story_points_field: story_points
            }
        }
        
        result = self._make_request("PUT", endpoint, data)
        return result is not None
    
    def parse_jira_request(self, text: str) -> Optional[List[Dict[str, Any]]]:
        """Обработать произвольный JQL запрос и вернуть список задач"""
        if not text:
            return None

        jql = text.strip()
        if not jql:
            return None

        try:
            search_result = self.search_issues(jql)
            if not search_result or 'issues' not in search_result:
                return None

            issues = []
            for issue in search_result.get('issues', []):
                issue_key = issue.get('key')
                if not issue_key:
                    continue

                fields = issue.get('fields', {})
                summary = fields.get('summary', issue_key)
                story_points = fields.get(self.story_points_field)

                issues.append({
                    'key': issue_key,
                    'summary': summary,
                    'url': self.get_issue_url(issue_key),
                    'story_points': story_points
                })

            return issues or None
        except Exception as e:
            print(f"Error processing Jira request: {e}")
            return None

# Глобальный экземпляр сервиса
jira_service = JiraService()
