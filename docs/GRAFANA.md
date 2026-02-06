# Grafana дашборды для Telegram Planning Poker Bot

## Источник данных
- **PostgreSQL** — таблица `bot_events`, создаётся автоматически адаптером `PostgresMetricsRepository` при наличии `POSTGRES_DSN`.
- В Grafana добавьте Data Source `PostgreSQL` и укажите ту же DSN/учётку, что использует бот.

## Предлагаемые дашборды

### 1) Общий обзор (Bot Overview)
- **Panels:**
  - *Events per minute* (bar/line): `SELECT $__timeGroup(ts, '1m') AS time, count(*) AS events FROM bot_events GROUP BY time ORDER BY time;`
  - *Errors per minute* (bar): `status = 'error'`.
  - *Top actions* (table): `SELECT event, count(*) AS cnt FROM bot_events WHERE $__timeFilter(ts) GROUP BY event ORDER BY cnt DESC LIMIT 10;`
  - *Unique chats* (stat): `SELECT count(DISTINCT chat_id) FROM bot_events WHERE $__timeFilter(ts);`
  - *Unique users* (stat): `SELECT count(DISTINCT user_id) FROM bot_events WHERE $__timeFilter(ts);`

### 2) Голосование (Voting)
- *Votes count by task index* (needs_payload.value):
  ```sql
  SELECT $__time(ts) AS time, payload->>'value' AS vote, count(*)
  FROM bot_events
  WHERE event = 'vote' AND $__timeFilter(ts)
  GROUP BY time, vote
  ORDER BY time;
  ```
- *Vote distribution* (pie): `event='vote'` grouped by `payload->>'value'`.
- *Skips share* (stat): `sum(case when payload->>'value'='skip' then 1 else 0 end) / count(*)`.

### 3) Jira интеграции
- *JQL queries per minute*: `event='jql_query'`.
- *Jira SP updates* success/error:
  ```sql
  SELECT $__timeGroup(ts, '1m') AS time,
         sum(case when status='ok' then 1 else 0 end) AS ok,
         sum(case when status='error' then 1 else 0 end) AS error
  FROM bot_events
  WHERE event IN ('update_jira_sp', 'update_jira_sp_skip_errors') AND $__timeFilter(ts)
  GROUP BY time ORDER BY time;
  ```

### 4) Доступность
- *Handler errors* (event='handler_error', status='error') over time.
- *Last event time per chat* (table): latest `ts` by `chat_id` — помогает увидеть «мертвые» чаты.

## Алёрты (примерные правила)
- **Error rate spike:** если `errors per minute > 5` в течение 5 минут.
- **Jira update failures:** если `status='error'` для `event like 'update_jira_sp%'` больше N за 10 минут.
- **No events:** если `count(*) == 0` за последние 10 минут — сигнал о падении бота или источника.

## Импорт/экспорт
- Создайте дашборды вручную или экспортируйте JSON из Grafana после сборки панелей. Храните JSON экспорты рядом с этим файлом при необходимости.
