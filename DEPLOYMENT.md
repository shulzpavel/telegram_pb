# 🚀 Deployment Guide

Инструкция по развертыванию Planning Poker Bot на продакшн сервере.

## 📋 Предварительные требования

- Python 3.9+
- Git
- Docker (опционально)
- Nginx (для reverse proxy, опционально)

## 🔄 Обновление существующего бота

### 1. Остановка текущего бота

```bash
# Найти процесс бота
ps aux | grep "python.*bot.py"

# Остановить бота (замените PID на реальный)
kill -TERM <PID>

# Или принудительно
pkill -f "python.*bot.py"

# Проверить, что процесс остановлен
ps aux | grep "python.*bot.py"
```

### 2. Создание бэкапа данных

```bash
# Перейти в директорию бота
cd /path/to/telegram_pb

# Создать бэкап
python3 scripts/backup_data.py

# Или вручную
cp -r data/ data_backup_$(date +%Y%m%d_%H%M%S)/
```

### 3. Обновление кода

```bash
# Получить последние изменения
git pull origin main

# Установить зависимости
pip3 install -r requirements.txt

# Проверить конфигурацию
cp env.example .env
# Отредактировать .env файл
```

### 4. Запуск обновленного бота

```bash
# Запуск в фоне
nohup python3 bot.py > bot.log 2>&1 &

# Или с systemd (рекомендуется)
sudo systemctl start planning-poker-bot
sudo systemctl enable planning-poker-bot
```

## 🐳 Docker Deployment

### 1. Сборка образа

```bash
docker build -t planning-poker-bot .
```

### 2. Запуск контейнера

```bash
# С монтированием данных
docker run -d \
  --name planning-poker-bot \
  --restart unless-stopped \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/.env:/app/.env \
  planning-poker-bot

# Или с docker-compose
docker-compose up -d
```

## 🔧 Systemd Service

Создайте файл `/etc/systemd/system/planning-poker-bot.service`:

```ini
[Unit]
Description=Planning Poker Bot
After=network.target

[Service]
Type=simple
User=bot
WorkingDirectory=/opt/planning-poker-bot
ExecStart=/usr/bin/python3 bot.py
Restart=always
RestartSec=10
Environment=PYTHONPATH=/opt/planning-poker-bot

[Install]
WantedBy=multi-user.target
```

Команды для управления:

```bash
# Перезагрузить конфигурацию
sudo systemctl daemon-reload

# Запустить сервис
sudo systemctl start planning-poker-bot

# Остановить сервис
sudo systemctl stop planning-poker-bot

# Перезапустить сервис
sudo systemctl restart planning-poker-bot

# Проверить статус
sudo systemctl status planning-poker-bot

# Включить автозапуск
sudo systemctl enable planning-poker-bot

# Посмотреть логи
sudo journalctl -u planning-poker-bot -f
```

## 📊 Мониторинг

### Логи

```bash
# Логи приложения
tail -f data/bot.log

# Логи systemd
sudo journalctl -u planning-poker-bot -f

# Логи Docker
docker logs -f planning-poker-bot
```

### Проверка здоровья

```bash
# Проверить процесс
ps aux | grep bot.py

# Проверить порты (если используется)
netstat -tlnp | grep :8080

# Проверить использование ресурсов
top -p $(pgrep -f bot.py)
```

## 🔒 Безопасность

### 1. Настройка пользователя

```bash
# Создать пользователя для бота
sudo useradd -r -s /bin/false bot

# Установить права
sudo chown -R bot:bot /opt/planning-poker-bot
sudo chmod 755 /opt/planning-poker-bot
```

### 2. Firewall

```bash
# Открыть только необходимые порты
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### 3. SSL/TLS (если нужен webhook)

```bash
# Установить certbot
sudo apt install certbot

# Получить сертификат
sudo certbot certonly --standalone -d yourdomain.com
```

## 🔄 Автоматическое обновление

Создайте скрипт `/opt/planning-poker-bot/update.sh`:

```bash
#!/bin/bash
set -e

cd /opt/planning-poker-bot

# Создать бэкап
python3 scripts/backup_data.py

# Остановить сервис
sudo systemctl stop planning-poker-bot

# Обновить код
git pull origin main

# Установить зависимости
pip3 install -r requirements.txt

# Запустить сервис
sudo systemctl start planning-poker-bot

echo "Bot updated successfully!"
```

Сделать исполняемым:

```bash
chmod +x /opt/planning-poker-bot/update.sh
```

## 🚨 Troubleshooting

### Бот не запускается

1. Проверить логи: `sudo journalctl -u planning-poker-bot -n 50`
2. Проверить конфигурацию: `python3 -c "import config; print('Config OK')"`
3. Проверить зависимости: `pip3 list | grep aiogram`

### Потеря данных

1. Восстановить из бэкапа: `python3 scripts/backup_data.py restore backups/backup_YYYYMMDD_HHMMSS`
2. Проверить права на файлы: `ls -la data/`

### Высокое использование ресурсов

1. Проверить логи на ошибки
2. Перезапустить сервис: `sudo systemctl restart planning-poker-bot`
3. Проверить количество активных сессий

## 📞 Поддержка

При возникновении проблем:

1. Проверить логи
2. Создать issue в репозитории
3. Связаться с командой разработки

---

**Важно**: Всегда создавайте бэкап перед обновлением!
