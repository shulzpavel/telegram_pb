# Grafana Provisioning — схема путей

## Структура файлов

```
grafana/
├── provisioning/           → монтируется в /etc/grafana/provisioning
│   ├── datasources/
│   │   └── postgres.yml    (datasource PostgreSQL)
│   └── dashboards/
│       └── default.yml     (провайдер: path = /var/lib/grafana/dashboards)
│
└── dashboards/             → монтируется в /var/lib/grafana/dashboards
    └── telegram-pb.json    (дашборд)
```

## Docker volumes

| Host путь | Контейнер | Назначение |
|-----------|-----------|------------|
| `./grafana/provisioning` | `/etc/grafana/provisioning` | конфиги провайдеров и datasources |
| `./grafana/dashboards` | `/var/lib/grafana/dashboards` | JSON-файлы дашбордов |
| `grafana-data` (volume) | `/var/lib/grafana` | данные Grafana (БД и т.п.) |

## Проверка на сервере

Перед `docker compose up` убедись, что файлы на месте:

```bash
# Из корня проекта
ls -la grafana/dashboards/telegram-pb.json    # должен быть
ls -la grafana/provisioning/dashboards/default.yml  # должен быть
```

После `docker compose up -d` можно проверить внутри контейнера:

```bash
docker exec telegram-pb-grafana ls -la /var/lib/grafana/dashboards/
docker exec telegram-pb-grafana ls -la /etc/grafana/provisioning/dashboards/
```
