# Настройка Grafana и Alertmanager

## Первый запуск

1. Убедитесь, что в `.env` задан `POSTGRES_DSN` (иначе метрики не пишутся).
2. Запустите стек: `docker compose up -d`
3. Grafana: http://localhost:3000 — логин `admin`, пароль `admin` (или `GRAFANA_ADMIN_PASSWORD` из `.env`)
4. Дашборд **Telegram PB Overview** уже загружен в папку "Telegram PB"

## Что выводится на дашборде

| Панель | Описание |
|--------|----------|
| Events (last 1h) | Количество событий за последний час |
| Errors (last 1h) | Количество ошибок за последний час |
| Events per minute | График событий в минуту |
| Errors per minute | График ошибок в минуту |
| Top actions (last 24h) | Топ событий: vote, menu_click, jql_query, update_jira_sp, handler_error |
| Recent errors | Таблица последних ошибок (ts, event, payload) |

## Настройка алертов (Alertmanager)

Grafana имеет встроенный Alertmanager — **Alerting → Contact points**. Настройка займёт пару минут.

### Шаг 1: Contact point (куда слать алерты)

1. **Alerting** → **Contact points** → **New contact point**
2. Выберите канал:
   - **Email** — укажите почту
   - **Telegram** — нужен бот-токен и chat_id
   - **Slack** — webhook URL
3. Сохраните как `default` или переименуйте.

### Шаг 2: Notification policy

1. **Alerting** → **Notification policies**
2. По умолчанию все алерты идут в `default` contact point. При добавлении контакта укажите его в Default contact point.

### Шаг 3: Создать алерт-правило

1. **Alerting** → **Alert rules** → **New alert rule**
2. **Set a query** — выберите datasource **PostgreSQL**, добавьте запрос:
   ```sql
   SELECT count(*) FROM bot_events 
   WHERE status = 'error' AND ts > now() - interval '5 minutes'
   ```
3. **Set a condition** — Reduce: Last, IS ABOVE 5 (или порог по вкусу)
4. **Set evaluation behavior** — For: 1m
5. **Add annotations** — Summary: `Error spike in bot`
6. Сохранить.

### Примеры правил для первой итерации

| Правило | Запрос | Условие | Для чего |
|---------|--------|---------|----------|
| Error spike | `SELECT count(*) FROM bot_events WHERE status='error' AND ts > now()-interval '5m'` | Last > 5 | Много ошибок |
| Handler errors | `SELECT count(*) FROM bot_events WHERE event='handler_error' AND ts > now()-interval '10m'` | Last > 0 | Ошибки обработчиков |
| No activity (опционально) | `SELECT count(*) FROM bot_events WHERE ts > now()-interval '30m'` | Last < 1 | Бот «молчит» (осторожно: ночь/выходные) |

## Переменные в .env

```env
# Grafana
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=admin
GRAFANA_ROOT_URL=http://localhost:3000

# Postgres (для datasource и метрик)
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=telegram_pb
```

## Дальнейшее развитие

- Панели по голосованиям (vote distribution, skips)
- Панели по Jira (jql_query, update_jira_sp success/error)
- Добавить Prometheus-эндпоинты в сервисы для системных метрик (CPU, память)
- Интеграция с внешним Alertmanager (если нужна маршрутизация)
