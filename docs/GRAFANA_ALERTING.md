# Алертинг и обогащение метрик

## Что добавлено

### 1. Service health checks (без спама)
Gateway раз в **5 минут** проверяет voting-service и jira-service, пишет в `bot_events`:
- `event=service_health`, `status=ok` — сервис доступен
- `event=service_health`, `status=error` — таймаут или ошибка подключения

В `payload`: `service`, `error`, `latency_ms`.

### 2. Новые панели на дашборде
- **Services down (15m)** — сколько раз сервисы падали за 15 мин
- **Service health failures** — график сбоев
- **Last health per service** — последняя проверка по каждому сервису

Перезагрузи дашборд: Dashboards → Telegram PB Overview → обновить или переимпортировать `docs/grafana-dashboard-telegram-pb.json`.

---

## Код для алертов (Grafana Alert rules)

**Datasource:** PostgreSQL. Вставь SQL в Query, условие: **Reduce Last** → **IS ABOVE** N.

### A — Сервис недоступен

```sql
SELECT count(*) as value
FROM bot_events
WHERE event = 'service_health'
  AND status = 'error'
  AND ts > now() - interval '10 minutes'
```

**Condition:** Last IS ABOVE `0`

---

### B — Всплеск ошибок

```sql
SELECT count(*) as value
FROM bot_events
WHERE status = 'error'
  AND ts > now() - interval '5 minutes'
```

**Condition:** Last IS ABOVE `5`

---

### C — Handler errors

```sql
SELECT count(*) as value
FROM bot_events
WHERE event = 'handler_error'
  AND ts > now() - interval '10 minutes'
```

**Condition:** Last IS ABOVE `0`

---

## Дальнейшее обогащение (без спама)

Можно добавить позже:
- **vote_distribution** — распределение оценок (1, 2, 3, 5, 8, 13, skip)
- **update_jira_sp** success/error — отдельная панель
- **latency** в `handler_error` — если вызывается внешний сервис, писать `payload.service`
- **Redis/Postgres** health — отдельный checker для инфраструктуры

Правило: писать события только по факту (действие пользователя, ошибка, смена статуса), не чаще 1 раза в минуту на метрику.
