#!/usr/bin/env python3
"""
Тесты для Jira интеграции
"""

import pytest
from unittest.mock import Mock, patch
from jira_service import JiraService

def test_jira_service_initialization():
    """Тест инициализации Jira сервиса"""
    service = JiraService()
    assert service.base_url == "https://media-life.atlassian.net"
    assert service.username == "pe_shults@betboom.org"
    assert service.story_points_field == "customfield_10022"

def test_parse_jira_request():
    """Тест парсинга запроса из Jira"""
    service = JiraService()
    
    # Тест с валидным запросом
    with patch.object(service, 'get_issue_summary') as mock_summary:
        mock_summary.return_value = "Test Task Summary"
        
        result = service.parse_jira_request("key=FLEX-365")
        assert result is not None
        assert result['key'] == "FLEX-365"
        assert result['summary'] == "Test Task Summary"
        assert "FLEX-365" in result['url']
    
    # Тест с невалидным запросом
    result = service.parse_jira_request("invalid request")
    assert result is None
    
    # Тест с пустым запросом
    result = service.parse_jira_request("")
    assert result is None

def test_get_issue_url():
    """Тест генерации URL задачи"""
    service = JiraService()
    url = service.get_issue_url("FLEX-365")
    assert url == "https://media-life.atlassian.net/browse/FLEX-365"

@patch('requests.put')
def test_update_story_points(mock_put):
    """Тест обновления Story Points"""
    service = JiraService()
    
    # Мокаем успешный ответ
    mock_response = Mock()
    mock_response.raise_for_status.return_value = None
    mock_response.json.return_value = {"success": True}
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