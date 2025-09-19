# 🚀 Planning Poker Bot - Deployment Guide

Полное руководство по развертыванию Planning Poker Bot на продакшн сервере.

## 📋 Предварительные требования

### Системные требования
- **OS**: Ubuntu 20.04+ / Debian 10+ / CentOS 8+
- **RAM**: Минимум 512MB, рекомендуется 1GB+
- **CPU**: 1 ядро
- **Disk**: 2GB свободного места
- **Python**: 3.9+

### Необходимые данные
- Telegram Bot Token (от @BotFather)
- Jira API Token
- Jira Base URL
- Story Points Field ID (опционально)

## 🛠 Установка на сервере

### 1. Первоначальная настройка сервера

```bash
# Подключитесь к серверу
ssh root@your-server-ip

# Скачайте и запустите скрипт настройки
wget https://raw.githubusercontent.com/your-username/telegram_pb/main/scripts/setup_server.sh
chmod +x setup_server.sh
./setup_server.sh --repo-url=https://github.com/your-username/telegram_pb.git
```

### 2. Настройка конфигурации

```bash
# Перейдите в директорию проекта
cd /opt/planning-poker-bot

# Отредактируйте конфигурацию
nano .env
```

**Обязательные настройки в `.env`:**

```env
# Telegram Bot Token
BOT_TOKEN=your_bot_token_here

# Jira Configuration
JIRA_BASE_URL=https://your-company.atlassian.net
JIRA_EMAIL=your_email@company.com
JIRA_TOKEN=your_jira_api_token_here

# Story Points Field ID (найдите через скрипт)
JIRA_STORY_POINTS_FIELD_ID=customfield_10022

# Admin Configuration
HARD_ADMIN=@your_username

# Groups Configuration
GROUPS_CONFIG=[
  {
    "chat_id": -1001234567890,
    "topic_id": 2,
    "admins": ["@your_username"],
    "timeout": 90,
    "scale": ["1", "2", "3", "5", "8", "13"],
    "is_active": true,
    "jira_email": "your_email@company.com",
    "jira_token": "your_jira_token"
  }
]
```

### 3. Запуск бота

```bash
# Запустите бота
systemctl start planning-poker-bot

# Проверьте статус
systemctl status planning-poker-bot

# Просмотр логов
journalctl -u planning-poker-bot -f
```

## 🔄 Обновление бота

### Быстрое обновление (рекомендуется)

```bash
# На сервере
cd /opt/planning-poker-bot
./scripts/quick_update.sh
```

### Полное обновление

```bash
# На сервере
cd /opt/planning-poker-bot
./scripts/deploy.sh deploy
```

## 📊 Мониторинг и управление

### Основные команды

```bash
# Статус бота
systemctl status planning-poker-bot

# Запуск/остановка/перезапуск
systemctl start planning-poker-bot
systemctl stop planning-poker-bot
systemctl restart planning-poker-bot

# Просмотр логов
journalctl -u planning-poker-bot -f
journalctl -u planning-poker-bot --since "1 hour ago"

# Проверка конфигурации
/opt/planning-poker-bot/scripts/check_config.py
```

### Скрипты управления

```bash
# Полный деплой
./scripts/deploy.sh deploy

# Быстрое обновление
./scripts/quick_update.sh

# Откат к предыдущей версии
./scripts/deploy.sh rollback

# Статус системы
./scripts/deploy.sh status

# Просмотр логов
./scripts/deploy.sh logs
```

## 🔧 Настройка Jira интеграции

### 1. Получение Jira API Token

1. Зайдите в [Atlassian Account Settings](https://id.atlassian.com/manage-profile/security/api-tokens)
2. Создайте новый API Token
3. Скопируйте токен в конфигурацию

### 2. Поиск Story Points Field ID

```bash
# Запустите скрипт поиска
cd /opt/planning-poker-bot
python3 scripts/find_story_points_field.py
```

### 3. Настройка групп

Добавьте конфигурацию для каждой группы в `GROUPS_CONFIG`:

```json
[
  {
    "chat_id": -1001234567890,
    "topic_id": 2,
    "admins": ["@admin1", "@admin2"],
    "timeout": 90,
    "scale": ["1", "2", "3", "5", "8", "13"],
    "is_active": true,
    "jira_email": "group1@company.com",
    "jira_token": "group1_token"
  }
]
```

## 🛡 Безопасность

### Firewall настройки

```bash
# Проверьте статус firewall
ufw status

# Разрешите только необходимые порты
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
```

### Fail2ban

```bash
# Проверьте статус fail2ban
systemctl status fail2ban

# Просмотр заблокированных IP
fail2ban-client status sshd
```

### Резервное копирование

```bash
# Создание бэкапа
/opt/planning-poker-bot/scripts/backup_data.py

# Автоматические бэкапы (добавьте в crontab)
0 2 * * * /opt/planning-poker-bot/scripts/backup_data.py
```

## 📈 Мониторинг производительности

### Логи

```bash
# Основные логи
tail -f /var/log/planning-poker-bot/bot.log

# Системные логи
journalctl -u planning-poker-bot -f

# Логи с фильтрацией
journalctl -u planning-poker-bot --since "1 hour ago" | grep ERROR
```

### Мониторинг ресурсов

```bash
# Использование памяти
htop

# Дисковое пространство
df -h

# Статус сервисов
systemctl status planning-poker-bot
```

## 🚨 Устранение неполадок

### Бот не запускается

```bash
# Проверьте логи
journalctl -u planning-poker-bot -n 50

# Проверьте конфигурацию
python3 scripts/check_config.py

# Проверьте права доступа
ls -la /opt/planning-poker-bot/
```

### Проблемы с Jira

```bash
# Проверьте подключение к Jira
python3 -c "
import requests
import os
from dotenv import load_dotenv
load_dotenv()
response = requests.get(f'{os.getenv(\"JIRA_BASE_URL\")}/rest/api/3/myself', 
    auth=(os.getenv('JIRA_EMAIL'), os.getenv('JIRA_TOKEN')))
print(f'Status: {response.status_code}')
"
```

### Откат к предыдущей версии

```bash
# Откат
./scripts/deploy.sh rollback

# Или ручной откат
systemctl stop planning-poker-bot
cd /opt/planning-poker-bot
git reset --hard HEAD~1
systemctl start planning-poker-bot
```

## 📞 Поддержка

### Полезные команды

```bash
# Проверка конфигурации
python3 scripts/check_config.py

# Тестирование подключения
python3 scripts/test_connection.py

# Просмотр активных сессий
python3 -c "
import json
with open('data/sessions.json', 'r') as f:
    sessions = json.load(f)
    print(f'Active sessions: {len(sessions)}')
"
```

### Логи для диагностики

```bash
# Соберите логи для поддержки
journalctl -u planning-poker-bot --since "24 hours ago" > bot_logs.txt
cat /var/log/planning-poker-bot/bot.log > app_logs.txt
```

## 🔄 Автоматизация

### Crontab для автоматических задач

```bash
# Добавьте в crontab
crontab -e

# Автоматические бэкапы (каждый день в 2:00)
0 2 * * * /opt/planning-poker-bot/scripts/backup_data.py

# Проверка здоровья бота (каждые 5 минут)
*/5 * * * * /usr/local/bin/check-planning-poker-bot.sh

# Очистка старых логов (еженедельно)
0 3 * * 0 find /var/log/planning-poker-bot -name "*.log" -mtime +30 -delete
```

## ✅ Чек-лист деплоя

- [ ] Сервер настроен и обновлен
- [ ] Python 3.9+ установлен
- [ ] Репозиторий склонирован
- [ ] Виртуальное окружение создано
- [ ] Зависимости установлены
- [ ] Конфигурация `.env` настроена
- [ ] Jira токены настроены
- [ ] Группы сконфигурированы
- [ ] Systemd сервис настроен
- [ ] Firewall настроен
- [ ] Fail2ban настроен
- [ ] Логирование настроено
- [ ] Мониторинг настроен
- [ ] Резервное копирование настроено
- [ ] Бот запущен и работает
- [ ] Тестирование функциональности

---

**Готово!** Ваш Planning Poker Bot развернут и готов к работе! 🎉
