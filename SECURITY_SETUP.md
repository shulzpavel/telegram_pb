# 🔒 Настройка безопасности

## Критические исправления безопасности

### ✅ Исправлено
- **Все секреты вынесены в переменные окружения**
- **Создан `.gitignore` для исключения секретов из VCS**
- **Создан `config.example.py` как шаблон**

### 🚨 Немедленные действия

1. **Создайте `.env` файл** (не коммитьте в git!):
```bash
# Telegram Bot Configuration
BOT_TOKEN=your_actual_bot_token_here
ALLOWED_CHAT_ID=-1003087077812
ALLOWED_TOPIC_ID=

# Role Tokens
USER_TOKEN=user_token
LEAD_TOKEN=lead_token
ADMIN_TOKEN=admin_token

# Admin Users (comma-separated)
HARD_ADMINS=@admin1,@admin2

# Jira Configuration
JIRA_URL=https://your-domain.atlassian.net
JIRA_USERNAME=your-email@domain.com
JIRA_API_TOKEN=your_actual_jira_token_here
STORY_POINTS_FIELD=customfield_10022
```

2. **Удалите старые секреты из git истории**:
```bash
# Очистите историю git от секретов
git filter-branch --force --index-filter \
  'git rm --cached --ignore-unmatch config.py' \
  --prune-empty --tag-name-filter cat -- --all

# Принудительно отправьте изменения
git push origin --force --all
```

3. **Проверьте `.gitignore`**:
```bash
# Убедитесь, что .env файлы исключены
cat .gitignore | grep -E "\.env"
```

### 🔧 Архитектурные исправления

#### ✅ Исправлено
- **Голоса теперь сохраняются для каждой задачи отдельно**
- **Jira ключи хранятся явно в структуре задач**
- **Обновление SP работает для всех Jira задач в банче**
- **Устранена проблема с очисткой голосов**

#### 📊 Новая структура данных
```python
task_data = {
    'text': 'Task description',
    'jira_key': 'FLEX-365',  # или None для обычных задач
    'summary': 'Task summary',
    'url': 'https://domain.com/browse/FLEX-365',
    'votes': {user_id: '5', user_id2: '8'},  # Голоса для этой задачи
    'story_points': None
}
```

### 🧪 Тестирование

Запустите тесты для проверки исправлений:
```bash
python3 test_architecture_fixes.py
python3 test_jira_integration.py
```

### 🚀 Развертывание

1. **Установите переменные окружения** в production
2. **Убедитесь, что `.env` файл не попадает в git**
3. **Проверьте, что все секреты загружаются из окружения**

### ⚠️ Важно

- **Никогда не коммитьте `.env` файлы**
- **Используйте разные токены для dev/prod**
- **Регулярно ротируйте API токены**
- **Мониторьте логи на предмет утечек**
