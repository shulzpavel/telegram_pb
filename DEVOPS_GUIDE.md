# 🔧 DevOps Guide

Инструкция для DevOps по настройке и управлению Planning Poker Bot.

## 📋 Быстрый старт

### 1. Установка на сервер

```bash
# Клонировать репозиторий
git clone <repository-url> /opt/planning-poker-bot
cd /opt/planning-poker-bot

# Создать пользователя для бота
sudo useradd -r -s /bin/false bot
sudo chown -R bot:bot /opt/planning-poker-bot

# Установить зависимости
pip3 install -r requirements.txt

# Настроить конфигурацию
cp env.example .env
# Отредактировать .env файл
```

### 2. Настройка systemd сервиса

```bash
# Скопировать service файл
sudo cp planning-poker-bot.service /etc/systemd/system/

# Перезагрузить systemd
sudo systemctl daemon-reload

# Запустить сервис
sudo systemctl start planning-poker-bot
sudo systemctl enable planning-poker-bot
```

## ⚙️ Конфигурация

### Формат 1: JSON (Рекомендуется)

```bash
# В .env файле
GROUPS_CONFIG='[
  {
    "chat_id": -1002718440199,
    "topic_id": 2,
    "admins": ["@admin1", "@admin2"],
    "timeout": 90,
    "scale": ["1", "2", "3", "5", "8", "13"],
    "is_active": true
  }
]'
```

### Формат 2: Простой через запятые (DevOps friendly)

```bash
# В .env файле
CHAT_IDS=-1002718440199,-1002718440198
TOPIC_IDS=2,1
ADMIN_LISTS=@admin1,@admin2:@admin3
TIMEOUTS=90,120
SCALES=1,2,3,5,8,13:1,2,3,5,8,13,21
```

**Объяснение формата:**
- `CHAT_IDS`: ID чатов через запятую
- `TOPIC_IDS`: ID топиков через запятую
- `ADMIN_LISTS`: Списки админов через `:` (двоеточие), внутри списка через запятую
- `TIMEOUTS`: Таймауты через запятую (опционально)
- `SCALES`: Шкалы голосования через `:` (двоеточие), внутри списка через запятую (опционально)

### Формат 3: Legacy (Обратная совместимость)

```bash
# В .env файле
ALLOWED_CHAT_ID=-1002718440199
ALLOWED_TOPIC_ID=2
HARD_ADMINS=@admin1,@admin2
```

## 🔄 Обновление бота

### Автоматическое обновление

```bash
# Запустить скрипт обновления
/opt/planning-poker-bot/scripts/update.sh
```

### Ручное обновление

```bash
# 1. Создать бэкап
cd /opt/planning-poker-bot
python3 scripts/backup_data.py

# 2. Остановить сервис
sudo systemctl stop planning-poker-bot

# 3. Обновить код
git pull origin main
pip3 install -r requirements.txt

# 4. Запустить сервис
sudo systemctl start planning-poker-bot
```

## 📊 Мониторинг

### Проверка статуса

```bash
# Статус сервиса
sudo systemctl status planning-poker-bot

# Логи сервиса
sudo journalctl -u planning-poker-bot -f

# Логи приложения
tail -f /opt/planning-poker-bot/data/bot.log

# Проверка процесса
ps aux | grep bot.py
```

### Метрики

```bash
# Использование памяти
ps -o pid,ppid,cmd,%mem,%cpu --sort=-%mem | grep bot.py

# Размер данных
du -sh /opt/planning-poker-bot/data/

# Количество активных сессий
grep -c "session" /opt/planning-poker-bot/data/sessions.json
```

## 🔒 Безопасность

### Настройка пользователя

```bash
# Создать пользователя
sudo useradd -r -s /bin/false bot

# Установить права
sudo chown -R bot:bot /opt/planning-poker-bot
sudo chmod 755 /opt/planning-poker-bot
sudo chmod 600 /opt/planning-poker-bot/.env
```

### Firewall

```bash
# Настроить UFW
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### Backup

```bash
# Автоматический бэкап (crontab)
# Добавить в crontab:
0 2 * * * /opt/planning-poker-bot/scripts/backup_data.py

# Ручной бэкап
python3 /opt/planning-poker-bot/scripts/backup_data.py
```

## 🚨 Troubleshooting

### Бот не запускается

```bash
# 1. Проверить логи
sudo journalctl -u planning-poker-bot -n 50

# 2. Проверить конфигурацию
cd /opt/planning-poker-bot
python3 config_parser.py

# 3. Проверить зависимости
pip3 list | grep aiogram

# 4. Проверить права
ls -la /opt/planning-poker-bot/
```

### Потеря данных

```bash
# 1. Проверить бэкапы
ls -la /opt/planning-poker-bot/backups/

# 2. Восстановить из бэкапа
python3 scripts/backup_data.py restore backups/backup_YYYYMMDD_HHMMSS

# 3. Проверить права на файлы
ls -la /opt/planning-poker-bot/data/
```

### Высокое использование ресурсов

```bash
# 1. Проверить логи на ошибки
tail -f /opt/planning-poker-bot/data/bot.log

# 2. Перезапустить сервис
sudo systemctl restart planning-poker-bot

# 3. Проверить количество сессий
grep -c "session" /opt/planning-poker-bot/data/sessions.json
```

## 📈 Масштабирование

### Множественные инстансы

```bash
# Для разных групп можно запустить разные инстансы
# с разными .env файлами

# Инстанс 1
cp .env .env.group1
# Настроить для группы 1
sudo systemctl start planning-poker-bot-group1

# Инстанс 2
cp .env .env.group2
# Настроить для группы 2
sudo systemctl start planning-poker-bot-group2
```

### Load Balancing

```bash
# Использовать nginx для балансировки нагрузки
# если бот работает через webhook
```

## 🔧 Полезные команды

```bash
# Перезапуск сервиса
sudo systemctl restart planning-poker-bot

# Просмотр логов в реальном времени
sudo journalctl -u planning-poker-bot -f

# Проверка конфигурации
python3 /opt/planning-poker-bot/config_parser.py

# Создание бэкапа
python3 /opt/planning-poker-bot/scripts/backup_data.py

# Восстановление из бэкапа
python3 /opt/planning-poker-bot/scripts/backup_data.py restore <backup_path>

# Обновление бота
/opt/planning-poker-bot/scripts/update.sh
```

## 📞 Поддержка

При возникновении проблем:

1. Проверить логи: `sudo journalctl -u planning-poker-bot -f`
2. Проверить конфигурацию: `python3 config_parser.py`
3. Создать issue в репозитории
4. Связаться с командой разработки

---

**Важно**: Всегда создавайте бэкап перед обновлением!
