#!/usr/bin/env python3
"""
Сервис для работы с Jira API
"""

import requests
import json
from typing import Dict, Any, Optional
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
            if method.upper() == "GET":
                response = requests.get(url, auth=auth, headers=headers)
            elif method.upper() == "PUT":
                response = requests.put(url, auth=auth, headers=headers, json=data)
            else:
                return None
                
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"Jira API error: {e}")
            return None
    
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
    
    def parse_jira_request(self, text: str) -> Optional[Dict[str, str]]:
        """Парсить запрос из Jira (например: key=FLEX-365)"""
        if not text or 'key=' not in text:
            return None
            
        try:
            # Ищем key= в тексте
            key_start = text.find('key=') + 4
            key_end = text.find(' ', key_start)
            if key_end == -1:
                key_end = len(text)
            
            issue_key = text[key_start:key_end].strip()
            if not issue_key:
                return None
                
            # Получаем информацию о задаче
            summary = self.get_issue_summary(issue_key)
            url = self.get_issue_url(issue_key)
            
            if summary:
                return {
                    'key': issue_key,
                    'summary': summary,
                    'url': url
                }
        except Exception as e:
            print(f"Error parsing Jira request: {e}")
            
        return None

# Глобальный экземпляр сервиса
jira_service = JiraService()
