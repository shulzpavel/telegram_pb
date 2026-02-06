# Микросервисная архитектура

## Обзор

Приложение построено на микросервисной архитектуре с четким разделением ответственности между сервисами.

## Архитектура

### Сервисы

1. **Jira Service** (порт 8001)
   - Управление взаимодействием с Jira API
   - Кеширование запросов (TTL: 5 минут)
   - Retry логика для надежности
   - Health checks и metrics

2. **Voting Service** (порт 8002)
   - Управление сессиями Planning Poker
   - Хранение состояния (Redis/Postgres/File)
   - Бизнес-логика голосования
   - Health checks и metrics

3. **Telegram Gateway** (без порта, polling)
   - Тонкий клиент к Voting Service
   - Обработка Telegram событий (aiogram)
   - HTTP клиенты к микросервисам

## Конфигурация

### Переменные окружения (обязательные)

```bash
# URLs микросервисов (обязательно)
JIRA_SERVICE_URL=http://localhost:8001
VOTING_SERVICE_URL=http://localhost:8002

# Redis (для Voting Service)
REDIS_URL=redis://localhost:6379/0

# Postgres (для Voting Service и метрик)
POSTGRES_DSN=postgresql://user:password@localhost:5432/dbname
```

## Запуск

### Docker Compose

```bash
# Запустить все сервисы
docker-compose up -d

# Проверить статус
docker-compose ps

# Логи
docker-compose logs -f jira-service
docker-compose logs -f voting-service
docker-compose logs -f gateway
```

### Kubernetes

```bash
# Создать namespace
kubectl apply -f k8s/namespace.yaml

# Создать secrets (см. k8s/secrets.example.yaml)
kubectl create secret generic jira-secrets --from-literal=...
kubectl create secret generic postgres-secrets --from-literal=...
kubectl create secret generic telegram-secrets --from-literal=...

# Применить конфигурации
kubectl apply -f k8s/configmaps.yaml
kubectl apply -f k8s/redis.yaml
kubectl apply -f k8s/postgres.yaml
kubectl apply -f k8s/jira-service.yaml
kubectl apply -f k8s/voting-service.yaml
kubectl apply -f k8s/gateway.yaml

# Проверить статус
kubectl get pods -n telegram-pb
```

## API Endpoints

### Jira Service

- `GET /health/` - Health check
- `GET /health/ready` - Readiness check
- `GET /health/live` - Liveness check
- `GET /metrics/` - Metrics
- `POST /api/v1/search` - Поиск задач по JQL
- `POST /api/v1/parse` - Парсинг JQL или ключей задач
- `GET /api/v1/issue/{issue_key}` - Получить задачу
- `PUT /api/v1/issue/{issue_key}/story-points` - Обновить Story Points

### Voting Service

- `GET /health/` - Health check
- `GET /health/ready` - Readiness check
- `GET /health/live` - Liveness check
- `GET /metrics/` - Metrics
- `GET /api/v1/session` - Получить сессию
- `POST /api/v1/session` - Сохранить сессию
- `POST /api/v1/tasks/add` - Добавить задачи
- `POST /api/v1/vote` - Проголосовать
- `POST /api/v1/batch/start` - Начать батч
- `POST /api/v1/batch/finish` - Завершить батч

## Развертывание

1. Запустить все сервисы (через Docker Compose или Kubernetes)
2. Проверить работу через health checks
3. Gateway автоматически подключится к сервисам при запуске

## Мониторинг

Все сервисы предоставляют:
- `/health/` - базовый health check
- `/health/ready` - готовность принимать трафик
- `/health/live` - проверка живости процесса
- `/metrics/` - метрики (в разработке)

## Масштабирование

- **Jira Service**: можно масштабировать горизонтально (stateless)
- **Voting Service**: требует shared storage (Redis/Postgres)
- **Gateway**: можно запускать несколько инстансов (polling безопасен)

## Безопасность

- Используйте секреты для токенов и паролей
- Настройте CORS для production
- Используйте TLS для межсервисного общения
- Ограничьте доступ к health/metrics endpoints
