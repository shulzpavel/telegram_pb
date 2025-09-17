# 🔧 Настройка Story Points

## Как работает

Бот теперь работает максимально просто:
- **Любые проекты**: Бот обрабатывает задачи из любых проектов
- **Единое поле**: Использует одно поле Story Points для всех проектов
- **Автоматическая проверка**: Если поле существует - обновит, если нет - покажет ошибку

## Настройка

### 1. Настройте переменные окружения

Добавьте в ваш `.env` файл:

```bash
# Story Points Configuration
JIRA_STORY_POINTS_FIELD_ID=customfield_10022
```

### 2. Перезапустите бота

```bash
sudo systemctl restart planning-poker-bot
```

## Результат

После настройки:
- ✅ Задачи с полем Story Points будут обновлены
- ❌ Задачи без поля Story Points покажут ошибку в отчете
- 📊 В отчете будет показано, какие задачи обновлены, а какие не удалось

## Пример отчета

```
🔄 Обновление Story Points завершено!

✅ Успешно обновлено: 2 задач
• FLEX-123: 13 SP
• FLEX-124: 8 SP

❌ Ошибки: 3 задач
• IBO2-1322: Field 'customfield_10022' cannot be set. It is not on the appropriate screen, or unknown.
• IBO2-1280: Field 'customfield_10022' cannot be set. It is not on the appropriate screen, or unknown.
• IBO2-1176: Field 'customfield_10022' cannot be set. It is not on the appropriate screen, or unknown.

📊 Итого: 5 задач обработано
```

## Преимущества

- 🎯 **Простота**: Одна настройка для всех проектов
- 🔄 **Универсальность**: Работает с любыми проектами
- 📊 **Прозрачность**: Показывает реальные ошибки Jira
- 🚀 **Без ограничений**: Не нужно настраивать списки проектов
