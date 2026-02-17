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

## Настройка алертов в Grafana

### Шаг 1: Contact point
**Alerting** → **Contact points** → **New contact point**  
Укажи Email или Telegram (токен бота + chat_id) и сохрани.

### Шаг 2: Создать правила

**Alerting** → **Alert rules** → **New alert rule**

| Правило | Запрос (PostgreSQL) | Условие | Для чего |
|---------|---------------------|---------|----------|
| **Сервис недоступен** | `SELECT count(*) FROM bot_events WHERE event='service_health' AND status='error' AND ts > now() - interval '10 minutes'` | Last > 0 | Voting/Jira падали |
| **Всплеск ошибок** | `SELECT count(*) FROM bot_events WHERE status='error' AND ts > now() - interval '5 minutes'` | Last > 5 | Много handler_error |
| **Handler errors** | `SELECT count(*) FROM bot_events WHERE event='handler_error' AND ts > now() - interval '10 minutes'` | Last > 0 | Ошибки в боте |
| **Бот молчит** (осторожно) | `SELECT count(*) FROM bot_events WHERE ts > now() - interval '1 hour'` | Last < 1 | Нет событий час (может сработать ночью) |

Для каждого правила:
1. **Set a query** — Datasource: PostgreSQL, вставь SQL
2. **Set a condition** — Reduce: Last, IS ABOVE N (или IS BELOW для «бот молчит»)
3. **Set evaluation** — Evaluate every: 1m, For: 2m
4. **Add annotations** — Summary: краткое описание
5. Сохранить

---

## Дальнейшее обогащение (без спама)

Можно добавить позже:
- **vote_distribution** — распределение оценок (1, 2, 3, 5, 8, 13, skip)
- **update_jira_sp** success/error — отдельная панель
- **latency** в `handler_error` — если вызывается внешний сервис, писать `payload.service`
- **Redis/Postgres** health — отдельный checker для инфраструктуры

Правило: писать события только по факту (действие пользователя, ошибка, смена статуса), не чаще 1 раза в минуту на метрику.
