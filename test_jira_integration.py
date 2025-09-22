#!/usr/bin/env python3
"""Тесты для Jira интеграции"""

from unittest.mock import Mock, patch
from jira_service import JiraService

def test_jira_service_initialization():
    """Тест инициализации Jira сервиса"""
    service = JiraService()
    assert service.base_url == "https://media-life.atlassian.net"
    assert service.username == "pe_shults@betboom.org"
    assert service.story_points_field == "customfield_10022"

def test_parse_jira_request():
    """Тест парсинга произвольного JQL запроса"""
    service = JiraService()

    mock_response = {
        "issues": [
            {
                "key": "FLEX-365",
                "fields": {
                    "summary": "Test Task Summary",
                    service.story_points_field: 8
                }
            },
            {
                "key": "FLEX-366",
                "fields": {
                    "summary": "Another Task",
                    service.story_points_field: None
                }
            }
        ]
    }

    with patch.object(service, 'search_issues') as mock_search:
        mock_search.return_value = mock_response

        result = service.parse_jira_request('key IN ("FLEX-365", "FLEX-366")')

        assert result is not None
        assert isinstance(result, list)
        assert len(result) == 2

        first = result[0]
        assert first['key'] == "FLEX-365"
        assert first['summary'] == "Test Task Summary"
        assert first['story_points'] == 8
        assert first['url'].endswith("/FLEX-365")

    with patch.object(service, 'search_issues') as mock_search_empty:
        mock_search_empty.return_value = {"issues": []}
        result = service.parse_jira_request('project = FLEX AND statusCategory = "To Do"')
        assert result is None

    result = service.parse_jira_request("")
    assert result is None


@patch.object(JiraService, '_make_request')
def test_search_issues(mock_request):
    """Тест формирования payload для search"""
    mock_request.return_value = {"issues": []}
    service = JiraService()

    jql = 'key IN ("FLEX-362", "FLEX-363")'
    result = service.search_issues(jql, max_results=10)

    assert result == {"issues": []}
    mock_request.assert_called_once()

    method, endpoint, payload = mock_request.call_args[0]
    assert method == "POST"
    assert endpoint == "search"
    assert payload["jql"] == jql
    assert payload["maxResults"] == 10
    assert service.story_points_field in payload["fields"]
    assert mock_request.call_args.kwargs.get("api_versions") == ["3"]

def test_get_issue_url():
    """Тест генерации URL задачи"""
    service = JiraService()
    url = service.get_issue_url("FLEX-365")
    assert url == "https://your-domain.atlassian.net/browse/FLEX-365"

@patch('requests.put')
def test_update_story_points(mock_put):
    """Тест обновления Story Points"""
    service = JiraService()
    
    # Мокаем успешный ответ (204 No Content без тела)
    mock_response = Mock()
    mock_response.raise_for_status.return_value = None
    mock_response.status_code = 204
    mock_response.content = b''  # Пустое тело ответа
    mock_put.return_value = mock_response
    
    result = service.update_story_points("FLEX-365", 5)
    assert result is True
    
    # Проверяем, что запрос был сделан с правильными параметрами
    mock_put.assert_called_once()
    call_args = mock_put.call_args
    assert "FLEX-365" in call_args[0][0]  # URL содержит ключ задачи
    assert call_args[1]['json']['fields']['customfield_10022'] == 5

if __name__ == "__main__":
    print("🧪 Запуск тестов Jira интеграции...")
    
    try:
        test_jira_service_initialization()
        print("✅ Тест инициализации прошел")
        
        test_parse_jira_request()
        print("✅ Тест парсинга запроса прошел")
        
        test_get_issue_url()
        print("✅ Тест генерации URL прошел")
        
        test_update_story_points()
        print("✅ Тест обновления SP прошел")
        
        print("\n🎉 Все тесты Jira интеграции прошли успешно!")
        
    except Exception as e:
        print(f"❌ Ошибка в тестах: {e}")
        raise
