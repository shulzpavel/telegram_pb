#!/usr/bin/env python3
"""
Скрипт для определения ID поля Story Points в Jira проектах
"""

import os
import sys
import json
import asyncio
import aiohttp
from typing import Dict, Any

# Добавляем корневую директорию в путь
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import JIRA_BASE_URL, JIRA_EMAIL, JIRA_TOKEN

async def get_issue_editmeta(issue_key: str) -> Dict[str, Any]:
    """Получить метаданные для редактирования задачи"""
    url = f"{JIRA_BASE_URL}/rest/api/3/issue/{issue_key}/editmeta"
    auth = aiohttp.BasicAuth(JIRA_EMAIL, JIRA_TOKEN)
    
    async with aiohttp.ClientSession() as session:
        async with session.get(url, auth=auth) as response:
            if response.status == 200:
                return await response.json()
            else:
                print(f"❌ Ошибка получения метаданных для {issue_key}: {response.status}")
                return {}

async def find_story_points_fields(issue_key: str) -> None:
    """Найти поля Story Points в задаче"""
    print(f"🔍 Анализируем задачу: {issue_key}")
    
    editmeta = await get_issue_editmeta(issue_key)
    if not editmeta:
        return
    
    fields = editmeta.get('fields', {})
    story_points_fields = []
    
    for field_id, field_info in fields.items():
        field_name = field_info.get('name', '').lower()
        field_type = field_info.get('schema', {}).get('type', '')
        
        # Ищем поля, связанные со Story Points
        if any(keyword in field_name for keyword in ['story', 'point', 'estimate', 'effort']):
            story_points_fields.append({
                'id': field_id,
                'name': field_info.get('name', ''),
                'type': field_type,
                'required': field_info.get('required', False),
                'allowed_values': field_info.get('allowedValues', [])
            })
    
    if story_points_fields:
        print(f"✅ Найдены поля Story Points для {issue_key}:")
        for field in story_points_fields:
            print(f"  📋 {field['id']}: {field['name']} ({field['type']})")
            if field['required']:
                print(f"     ⚠️  Обязательное поле")
    else:
        print(f"❌ Поля Story Points не найдены для {issue_key}")
    
    return story_points_fields

async def main():
    """Основная функция"""
    print("🔍 Поиск полей Story Points в Jira проектах")
    print("=" * 50)
    
    if not JIRA_EMAIL or not JIRA_TOKEN:
        print("❌ Ошибка: Не настроены JIRA_EMAIL и JIRA_TOKEN")
        return
    
    # Тестовые задачи для разных проектов
    test_issues = [
        "FLEX-1",    # Проект FLEX
        "IBO2-1323", # Проект IBO2
        "ICT-1",     # Проект ICT
        "HEHE-1",    # Проект HEHE
    ]
    
    project_fields = {}
    
    for issue_key in test_issues:
        fields = await find_story_points_fields(issue_key)
        if fields:
            project_key = issue_key.split('-')[0]
            project_fields[project_key] = fields[0]['id']  # Берем первое найденное поле
    
    print("\n" + "=" * 50)
    print("📋 Рекомендуемая конфигурация:")
    print("=" * 50)
    
    if project_fields:
        mapping_json = json.dumps(project_fields, indent=2)
        print("JIRA_PROJECT_FIELD_MAPPING=" + mapping_json)
    else:
        print("JIRA_PROJECT_FIELD_MAPPING={}")
    
    print("\n💡 Добавьте эту строку в ваш .env файл")

if __name__ == "__main__":
    asyncio.run(main())
