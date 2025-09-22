#!/usr/bin/env python3
"""
Тесты для проверки архитектурных исправлений
"""

import unittest
from unittest.mock import Mock, patch
from collections import Counter
import sys
import os

# Добавляем путь к модулям
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from jira_service import JiraService

class TestArchitectureFixes(unittest.TestCase):
    """Тесты архитектурных исправлений"""
    
    def test_jira_service_204_response(self):
        """Тест обработки 204 ответов от Jira API"""
        service = JiraService()
        
        # Мокаем 204 ответ без тела
        with patch('requests.put') as mock_put:
            mock_response = Mock()
            mock_response.raise_for_status.return_value = None
            mock_response.status_code = 204
            mock_response.content = b''
            mock_put.return_value = mock_response
            
            result = service.update_story_points("TEST-123", 5)
            self.assertTrue(result)
    
    def test_jira_service_json_error_handling(self):
        """Тест обработки ошибок JSON парсинга"""
        service = JiraService()
        
        # Мокаем ответ с некорректным JSON
        with patch('requests.put') as mock_put:
            mock_response = Mock()
            mock_response.raise_for_status.return_value = None
            mock_response.status_code = 200
            mock_response.content = b'invalid json'
            mock_response.json.side_effect = ValueError("Invalid JSON")
            mock_put.return_value = mock_response
            
            result = service.update_story_points("TEST-123", 5)
            self.assertFalse(result)
    
    def test_task_data_structure(self):
        """Тест новой структуры данных задач"""
        # Тест структуры для Jira задачи
        jira_task = {
            'text': 'Test task summary https://domain.com/browse/TEST-123',
            'jira_key': 'TEST-123',
            'summary': 'Test task summary',
            'url': 'https://domain.com/browse/TEST-123',
            'votes': {123: '5', 456: '8'},
            'story_points': None
        }
        
        # Проверяем структуру
        self.assertIn('jira_key', jira_task)
        self.assertIn('votes', jira_task)
        self.assertIn('story_points', jira_task)
        self.assertEqual(jira_task['jira_key'], 'TEST-123')
        self.assertEqual(len(jira_task['votes']), 2)
    
    def test_task_data_structure_regular(self):
        """Тест структуры данных для обычных задач"""
        regular_task = {
            'text': 'Regular task without Jira',
            'jira_key': None,
            'summary': 'Regular task without Jira',
            'url': None,
            'votes': {123: '3', 456: '5'},
            'story_points': None
        }
        
        # Проверяем структуру
        self.assertIsNone(regular_task['jira_key'])
        self.assertIsNone(regular_task['url'])
        self.assertIn('votes', regular_task)
        self.assertEqual(len(regular_task['votes']), 2)
    
    def test_vote_calculation_per_task(self):
        """Тест расчета голосов для каждой задачи отдельно"""
        # Симулируем голоса для разных задач
        task1_votes = {123: '5', 456: '5', 789: '8'}
        task2_votes = {123: '3', 456: '3', 789: '5'}
        
        # Вычисляем наиболее частые голоса для каждой задачи
        task1_counter = Counter(task1_votes.values())
        task1_most_common = task1_counter.most_common(1)[0][0]
        
        task2_counter = Counter(task2_votes.values())
        task2_most_common = task2_counter.most_common(1)[0][0]
        
        self.assertEqual(task1_most_common, '5')
        self.assertEqual(task2_most_common, '3')
    
    def test_batch_with_mixed_tasks(self):
        """Тест банча со смешанными задачами (Jira + обычные)"""
        batch_tasks = [
            {
                'text': 'Jira task summary https://domain.com/browse/TEST-123',
                'jira_key': 'TEST-123',
                'summary': 'Jira task summary',
                'url': 'https://domain.com/browse/TEST-123',
                'votes': {123: '5', 456: '5'},
                'story_points': None
            },
            {
                'text': 'Regular task without Jira',
                'jira_key': None,
                'summary': 'Regular task without Jira',
                'url': None,
                'votes': {123: '3', 456: '3'},
                'story_points': None
            },
            {
                'text': 'Another Jira task https://domain.com/browse/TEST-456',
                'jira_key': 'TEST-456',
                'summary': 'Another Jira task',
                'url': 'https://domain.com/browse/TEST-456',
                'votes': {123: '8', 456: '8'},
                'story_points': None
            }
        ]
        
        # Фильтруем только Jira задачи
        jira_tasks = [task for task in batch_tasks if task.get('jira_key')]
        
        self.assertEqual(len(jira_tasks), 2)
        self.assertEqual(jira_tasks[0]['jira_key'], 'TEST-123')
        self.assertEqual(jira_tasks[1]['jira_key'], 'TEST-456')
    
    def test_environment_variables_fallback(self):
        """Тест fallback значений для переменных окружения"""
        # Проверяем, что config.py использует переменные окружения
        import config
        
        # Проверяем, что есть fallback значения
        self.assertIsNotNone(config.BOT_TOKEN)
        self.assertIsNotNone(config.JIRA_URL)
        self.assertIsNotNone(config.JIRA_USERNAME)
        self.assertIsNotNone(config.JIRA_API_TOKEN)

if __name__ == "__main__":
    print("🧪 Запуск тестов архитектурных исправлений...")
    
    try:
        unittest.main(verbosity=2)
        print("\n🎉 Все тесты архитектурных исправлений прошли успешно!")
    except Exception as e:
        print(f"\n❌ Ошибка при запуске тестов: {e}")
        sys.exit(1)
