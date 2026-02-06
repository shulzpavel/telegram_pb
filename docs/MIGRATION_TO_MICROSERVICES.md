# Миграция на полностью микросервисную архитектуру

## Что изменилось

### Убрана поддержка монолитного режима

Приложение теперь **всегда** работает в микросервисном режиме. Все компоненты разделены на отдельные сервисы:

1. **Jira Service** - управление Jira API
2. **Voting Service** - управление сессиями и голосованием  
3. **Telegram Gateway** - обработка Telegram событий

### Изменения в коде

#### `app/providers.py`
- Убрана проверка `USE_MICROSERVICES`
- Всегда используются HTTP клиенты (`JiraServiceHttpClient`, `VotingServiceHttpClient`)
- Убраны прямые адаптеры (`JiraHttpClient`, `FileSessionRepository`) из основного пути

#### `config.py`
- Убрана переменная `USE_MICROSERVICES`
- `JIRA_SERVICE_URL` и `VOTING_SERVICE_URL` теперь обязательны
- Legacy переменные (`JIRA_URL`, `JIRA_USERNAME`, etc.) используются только Jira Service

#### `run.py`
- Добавлена проверка доступности микросервисов при запуске
- Gateway не запустится, если сервисы недоступны
- Выводит понятные сообщения об ошибках

#### `services/voting-service/api.py`
- Доработаны все endpoints для реальной работы с репозиторием
- Поддержка async и sync методов репозитория

### Изменения в конфигурации

#### `docker-compose.yml`
- Убрана переменная `USE_MICROSERVICES=true` из gateway
- Добавлены health checks для зависимостей
- Gateway ждет готовности сервисов перед запуском

#### `k8s/gateway.yaml`
- Убрана переменная `USE_MICROSERVICES`

#### `env.example`
- Убрана переменная `USE_MICROSERVICES`
- `JIRA_SERVICE_URL` и `VOTING_SERVICE_URL` обязательны

### Изменения в документации

- Обновлен `README.md` - убраны упоминания монолита
- Обновлен `docs/MICROSERVICES.md` - убраны упоминания монолита
- Обновлен `docs/MICROSERVICES_SETUP.md` - акцент на микросервисы

## Как запустить

### Docker Compose (рекомендуется)

```bash
docker-compose up -d
```

### Вручную

```bash
# 1. Запустить Jira Service
python -m services.jira_service.main &

# 2. Запустить Voting Service
python -m services.voting_service.main &

# 3. Запустить Gateway (проверит доступность сервисов)
python run.py
```

## Проверка

Gateway автоматически проверит доступность сервисов при запуске:

```bash
✅ Jira Service is available at http://localhost:8001
✅ Voting Service is available at http://localhost:8002
```

Если сервисы недоступны, gateway не запустится и выведет инструкции.

## Обратная совместимость

**Внимание**: Старый монолитный режим больше не поддерживается. Если у вас была конфигурация с `USE_MICROSERVICES=false`, необходимо:

1. Запустить микросервисы
2. Убрать `USE_MICROSERVICES` из `.env`
3. Убедиться, что `JIRA_SERVICE_URL` и `VOTING_SERVICE_URL` указаны

## Преимущества

1. **Масштабируемость** - каждый сервис можно масштабировать независимо
2. **Надежность** - сбой одного сервиса не влияет на другие
3. **Разделение ответственности** - четкие границы между компонентами
4. **Тестируемость** - каждый сервис можно тестировать отдельно
5. **Деплой** - независимое развертывание сервисов

## Известные ограничения

1. **Синхронные методы**: Use cases используют синхронные методы репозитория, но HTTP клиенты асинхронные. Это решается через обертки в `VotingServiceHttpClient`, но может потребовать доработки для edge cases.

2. **Зависимости**: Gateway требует запущенных сервисов. Используйте Docker Compose или оркестратор (Kubernetes) для управления зависимостями.

3. **Метрики**: Endpoints `/metrics/` пока возвращают заглушки и требуют реализации реального сбора метрик.
