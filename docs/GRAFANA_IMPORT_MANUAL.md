# Ручной импорт дашборда Grafana

Если дашборд не появляется автоматически, импортируй его вручную (займёт 1 минуту):

## Шаги

1. Открой Grafana: http://твой-сервер:3000
2. Войди (admin / admin)
3. Меню слева → **Dashboards** → **New** → **Import**
4. Нажми **Upload JSON file**
5. Выбери файл `docs/grafana-dashboard-telegram-pb.json` (скачай с сервера или из репо)
6. Нажми **Load**
7. В поле **PostgreSQL** выбери datasource **PostgreSQL** (если есть)
8. Нажми **Import**

Дашборд появится в папке General.

## Альтернатива — вставить JSON

1. Dashboards → New → Import
2. Вставь содержимое файла `docs/grafana-dashboard-telegram-pb.json` в поле **Import via panel json**
3. Load → выбери PostgreSQL → Import
