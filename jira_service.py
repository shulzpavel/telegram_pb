#!/usr/bin/env python3
"""Работа с Jira API."""

import re
from typing import Any, Dict, Iterable, List, Optional

import requests
from urllib.parse import quote

from config import JIRA_API_TOKEN, JIRA_URL, JIRA_USERNAME, STORY_POINTS_FIELD


class JiraService:
    def __init__(self) -> None:
        self.base_url = JIRA_URL
        self.username = JIRA_USERNAME
        self.api_token = JIRA_API_TOKEN
        self.story_points_field = STORY_POINTS_FIELD
        self._key_pattern = re.compile(r"\b([A-Z][A-Z0-9]+-\d+)\b")

    def _make_request(
        self,
        method: str,
        endpoint: str,
        data: Optional[Dict[str, Any]] = None,
        api_versions: Optional[Iterable[str]] = None,
    ) -> Optional[Dict[str, Any]]:
        """Выполнить HTTP-запрос к Jira, пробуя несколько версий API."""
        headers = {"Accept": "application/json", "Content-Type": "application/json"}
        auth = (self.username, self.api_token)
        method = method.upper()
        versions = list(api_versions or ["3"])

        for version in versions:
            url = f"{self.base_url}/rest/api/{version}/{endpoint}"
            try:
                if method == "GET":
                    response = requests.get(url, auth=auth, headers=headers)
                elif method == "PUT":
                    response = requests.put(url, auth=auth, headers=headers, json=data)
                elif method == "POST":
                    response = requests.post(url, auth=auth, headers=headers, json=data)
                else:
                    return None

                response.raise_for_status()

                if not response.encoding:
                    response.encoding = response.apparent_encoding or "utf-8"

                if response.status_code == 204 or not response.content:
                    return {"success": True}

                return response.json()
            except requests.exceptions.HTTPError as error:
                status = getattr(error.response, "status_code", None)
                # Если API-версия недоступна (например, 410), пробуем следующую
                if status in {301, 302, 303, 307, 308, 404, 410} and version != versions[-1]:
                    continue
                print(f"Jira API error: {error}")
            except requests.exceptions.RequestException as error:
                print(f"Jira API error: {error}")
                break
            except ValueError as error:
                print(f"JSON parsing error: {error!r}")
                continue

        return None

    def search_issues(self, jql: str, max_results: int = 50) -> Optional[Dict[str, Any]]:
        """Выполнить поиск задач по произвольному JQL."""
        search_payload = {
            "jql": jql,
            "startAt": 0,
            "maxResults": max_results,
            "fields": ["summary", self.story_points_field],
        }

        search_result = self._make_request("POST", "search", search_payload, api_versions=["3"])
        if search_result is not None and "issues" in search_result:
            return search_result

        # Atlassian jql/search API (возвращает ограниченный набор полей)
        jql_payload = {
            "queries": [
                {
                    "query": jql,
                    "startAt": 0,
                    "maxResults": max_results,
                    "fields": ["summary", self.story_points_field],
                }
            ]
        }
        jql_result = self._make_request("POST", "jql/search", jql_payload, api_versions=["3"])
        if jql_result and "queries" in jql_result:
            aggregated: List[Dict[str, Any]] = []
            for query_payload in jql_result.get("queries", []):
                for entry in query_payload.get("results", []):
                    issue = entry.get("issue")
                    if not issue:
                        continue
                    key = issue.get("key")
                    if not key:
                        continue
                    fields = issue.get("fields", {})
                    aggregated.append(
                        {
                            "key": key,
                            "fields": {
                                "summary": fields.get("summary"),
                                self.story_points_field: fields.get(self.story_points_field),
                            },
                        }
                    )
            if aggregated:
                return {"issues": aggregated}

        # Fallback для старых Jira: GET с параметрами
        encoded_jql = quote(jql)
        endpoint = (
            f"search?jql={encoded_jql}&startAt=0&maxResults={max_results}"
            f"&fields=summary,{self.story_points_field}"
        )
        return self._make_request("GET", endpoint, api_versions=["3"])

    def get_issue_url(self, issue_key: str) -> str:
        return f"{self.base_url}/browse/{issue_key}"

    def update_story_points(self, issue_key: str, story_points: int) -> bool:
        payload = {"fields": {self.story_points_field: story_points}}
        result = self._make_request("PUT", f"issue/{issue_key}", payload, api_versions=["3", "2"])
        return result is not None

    def parse_jira_request(self, text: str) -> Optional[List[Dict[str, Any]]]:
        """Вернуть список задач по JQL."""
        if not text:
            return None

        jql = text.strip()
        if not jql:
            return None

        try:
            response = self.search_issues(jql)
            if not response or "issues" not in response:
                raise ValueError("No issues from search")

            issues: List[Dict[str, Any]] = []
            for issue in response.get("issues", []):
                issue_key = issue.get("key")
                if not issue_key:
                    continue

                fields = issue.get("fields", {})
                summary = fields.get("summary", issue_key)
                raw_story_points = fields.get(self.story_points_field)
                story_points = raw_story_points if isinstance(raw_story_points, (int, float)) else 0

                issues.append(
                    {
                        "key": issue_key,
                        "summary": summary,
                        "url": self.get_issue_url(issue_key),
                        "story_points": story_points,
                    }
                )

            return issues or None
        except Exception as error:
            print(f"Error processing Jira request: {error}")
            fallback_issues: List[Dict[str, Any]] = []
            for key in self._key_pattern.findall(text):
                details = self._fetch_issue_by_key(key)
                if details:
                    fallback_issues.append(details)
            return fallback_issues or None

    def _fetch_issue_by_key(self, issue_key: str) -> Optional[Dict[str, Any]]:
        issue = self._make_request("GET", f"issue/{issue_key}", api_versions=["3", "2"])
        if not issue:
            return None

        fields = issue.get("fields", {})
        summary = fields.get("summary", issue_key)
        raw_story_points = fields.get(self.story_points_field)
        story_points = raw_story_points if isinstance(raw_story_points, (int, float)) else 0

        return {
            "key": issue_key,
            "summary": summary,
            "url": self.get_issue_url(issue_key),
            "story_points": story_points,
        }


jira_service = JiraService()
