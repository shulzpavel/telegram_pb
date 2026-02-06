# Настройка микросервисной архитектуры

## Что было добавлено

### 1. Jira Service (`services/jira-service/`)
- FastAPI сервис для работы с Jira API
- Кеширование запросов (TTL: 5 минут)
- Health checks и metrics endpoints
- Dockerfile и requirements.txt

### 2. Voting Service (`services/voting-service/`)
- FastAPI сервис для управления сессиями и голосованием
- Поддержка Redis и Postgres хранилищ
- Health checks и metrics endpoints
- Dockerfile и requirements.txt

### 3. HTTP Адаптеры (`app/adapters/`)
- `jira_service_client.py` - HTTP клиент к Jira Service
- `voting_service_client.py` - HTTP клиент к Voting Service

### 4. Конфигурация
- Обновлен `config.py` - URLs сервисов теперь обязательны
- Обновлен `app/providers.py` - всегда использует HTTP клиенты к микросервисам
- Обновлен `env.example` с обязательными переменными для микросервисов

### 5. Деплой
- `docker-compose.yml` - для локальной разработки
- `k8s/` - Kubernetes манифесты для production
- Dockerfile для каждого сервиса

### 6. Документация
- `docs/MICROSERVICES.md` - подробная документация по архитектуре
- Обновлен `README.md` с разделом о микросервисах

## Как использовать

### Запуск через Docker Compose (рекомендуется)

```bash
# Запустить все сервисы
docker-compose up -d

# Проверить статус
docker-compose ps

# Логи
docker-compose logs -f gateway
```

### Запуск вручную

1. Запустите сервисы:
```bash
# Jira Service
python -m services.jira_service.main &

# Voting Service
python -m services.voting_service.main &

# Gateway (проверит доступность сервисов перед запуском)
python run.py
```

2. Убедитесь, что переменные окружения настроены:
```bash
export JIRA_SERVICE_URL=http://localhost:8001
export VOTING_SERVICE_URL=http://localhost:8002
```

## Проверка работы

```bash
# Health checks
curl http://localhost:8001/health/
curl http://localhost:8002/health/

# Метрики
curl http://localhost:8001/metrics/
curl http://localhost:8002/metrics/
```

## Развертывание

Приложение использует микросервисную архитектуру по умолчанию. Все сервисы должны быть запущены перед запуском gateway.

1. Запустите все сервисы (через Docker Compose или Kubernetes)
2. Gateway автоматически проверит доступность сервисов при запуске
3. Проверьте health checks для мониторинга

## Известные ограничения

1. **Синхронные методы в HTTP клиентах**: При использовании HTTP клиентов в синхронном контексте (когда event loop уже запущен) могут возникнуть проблемы. Рекомендуется использовать асинхронные методы или убедиться, что event loop не запущен.

2. **Voting Service API**: Текущая реализация API упрощена и требует доработки для полной поддержки всех use cases через HTTP.

3. **Метрики**: Endpoints `/metrics/` пока возвращают заглушки и требуют реализации реального сбора метрик.

## Следующие шаги

1. Реализовать полный набор API endpoints в Voting Service
2. Добавить retry логику в HTTP клиенты
3. Реализовать сбор реальных метрик
4. Добавить мониторинг и алертинг
5. Настроить TLS для межсервисного общения
6. Добавить rate limiting
