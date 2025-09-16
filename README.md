# 🎯 Planning Poker Bot

Профессиональный Telegram бот для проведения Planning Poker сессий с поддержкой множественных групп и топиков.

## ✨ Особенности

- 🎲 **Planning Poker** - классическая методика оценки задач
- 👥 **Множественные группы** - поддержка нескольких чатов одновременно
- 🧵 **Топики** - изолированные сессии в рамках одной группы
- 🔗 **Jira интеграция** - автоматические ссылки на задачи
- 📊 **Статистика** - детальные отчеты по голосованиям
- ⏱️ **Таймеры** - автоматическое завершение голосований
- 🎯 **JQL запросы** - импорт задач из Jira

## 🚀 Быстрый старт

### Установка

```bash
# Клонируем репозиторий
git clone <repository-url>
cd telegram_pb

# Устанавливаем зависимости
pip install -r requirements.txt

# Настраиваем переменные окружения
cp env.example .env
# Отредактируйте .env файл с вашими настройками
```

### Настройка

Создайте файл `.env` на основе `env.example`:

```env
# Telegram Bot
BOT_TOKEN=your_bot_token_here

# Jira Integration
JIRA_BASE_URL=https://your-domain.atlassian.net
JIRA_EMAIL=your-email@domain.com
JIRA_TOKEN=your_jira_api_token

# Admin Configuration
HARD_ADMIN=@your_username
```

### Запуск

```bash
python bot.py
```

## 🏗️ Архитектура

Проект построен на принципах **Clean Architecture** с четким разделением слоев:

```
├── core/           # Ядро приложения (DI, интерфейсы)
├── domain/         # Доменная логика (сущности, value objects)
├── services/       # Бизнес-логика (сервисы)
├── repositories/   # Слой данных (репозитории)
├── handlers/       # Обработчики Telegram событий
└── models.py       # Модели данных
```

### Основные компоненты

- **SessionService** - управление сессиями голосования
- **TimerService** - управление таймерами и уведомлениями
- **GroupConfigService** - конфигурация групп
- **MessageService** - отправка сообщений
- **FileParserService** - парсинг задач

## 🎮 Использование

### Команды бота

- `/start` - запуск бота
- `/menu` - главное меню
- `/help` - справка

### Основной workflow

1. **Создание сессии**: Админ создает новую сессию голосования
2. **Добавление участников**: Участники присоединяются к сессии
3. **Импорт задач**: Загрузка задач через JQL или текстом
4. **Голосование**: Участники оценивают задачи по шкале Фибоначчи
5. **Результаты**: Автоматическая генерация отчетов

### Поддерживаемые форматы задач

- **JQL запросы**: `project = FLEX AND status = 'To Do'`
- **Текстовый формат**: `FLEX-123 - Описание задачи`

## 🔧 Разработка

### Структура проекта

```
telegram_pb/
├── bot.py                 # Точка входа
├── config.py             # Конфигурация
├── handlers.py           # Обработчики команд
├── utils.py              # Утилиты
├── models.py             # Модели данных
├── requirements.txt      # Зависимости
├── docker-compose.yml    # Docker конфигурация
├── Dockerfile           # Docker образ
├── core/                # Ядро приложения
│   ├── bootstrap.py     # DI контейнер
│   ├── container.py     # Контейнер зависимостей
│   ├── interfaces.py    # Интерфейсы
│   └── exceptions.py    # Исключения
├── domain/              # Доменная логика
│   ├── entities.py      # Сущности
│   ├── value_objects.py # Value objects
│   └── enums.py         # Перечисления
├── services/            # Сервисы
│   ├── session_service.py
│   ├── timer_service.py
│   ├── group_config_service.py
│   └── message_service.py
├── repositories/        # Репозитории
│   ├── session_repository.py
│   ├── group_config_repository.py
│   └── token_repository.py
└── tests/              # Тесты
    ├── test_core.py
    ├── test_domain.py
    └── test_models.py
```

### Запуск тестов

```bash
# Все тесты
python -m pytest tests/

# Конкретный тест
python -m pytest tests/test_core.py -v

# С покрытием
python -m pytest tests/ --cov=. --cov-report=html
```

### Docker

```bash
# Сборка образа
docker build -t planning-poker-bot .

# Запуск с docker-compose
docker-compose up -d

# Просмотр логов
docker-compose logs -f
```

## 📊 Мониторинг

Бот ведет подробные логи в файле `data/bot.log`:

- Старт/остановка бота
- Создание сессий
- Голосования участников
- Ошибки и исключения

## 🤝 Вклад в проект

1. Fork репозитория
2. Создайте feature branch (`git checkout -b feature/amazing-feature`)
3. Commit изменения (`git commit -m 'Add amazing feature'`)
4. Push в branch (`git push origin feature/amazing-feature`)
5. Откройте Pull Request

### Стандарты кода

- **PEP 8** - стиль кода Python
- **Type hints** - аннотации типов
- **Docstrings** - документация функций
- **Clean Architecture** - архитектурные принципы

## 📝 Лицензия

Этот проект лицензирован под MIT License - см. файл [LICENSE](LICENSE) для деталей.

## 🆘 Поддержка

Если у вас есть вопросы или проблемы:

1. Проверьте [Issues](https://github.com/your-repo/issues)
2. Создайте новый Issue с подробным описанием
3. Приложите логи и конфигурацию (без токенов!)

## 🎯 Roadmap

- [ ] Web интерфейс для администрирования
- [ ] Интеграция с другими системами (Slack, Teams)
- [ ] Расширенная аналитика и метрики
- [ ] Поддержка кастомных шкал оценки
- [ ] Экспорт результатов в различные форматы

---

**Сделано с ❤️ для эффективного планирования**