# 🚀 Чек-лист для деплоя Planning Poker Bot

## ✅ **Предварительная проверка**

### 1. Код готов
- [x] Все ошибки линтера исправлены
- [x] Story Points интеграция реализована
- [x] Тесты созданы
- [x] Документация готова
- [x] .gitignore обновлен

### 2. Файлы проекта
- [x] `bot.py` - основной файл бота
- [x] `handlers.py` - обработчики сообщений (1216 строк)
- [x] `config.py` - конфигурация
- [x] `utils.py` - утилиты
- [x] `services/jira_update_service.py` - новый сервис для Jira
- [x] `domain/entities.py` - доменные сущности
- [x] `core/` - архитектурные компоненты

## 🔧 **Настройка на сервере**

### 1. Остановка старого бота
```bash
# На сервере
sudo pkill -f "python.*bot.py"
sudo pkill -f "python3.*bot.py"
sudo systemctl stop planning-poker-bot  # если используется systemd
```

### 2. Обновление кода
```bash
# На сервере
cd /path/to/telegram_pb
git pull origin main
```

### 3. Настройка переменных окружения
Создайте/обновите `.env` файл:
```bash
# Telegram Bot
BOT_TOKEN=your_bot_token_here

# Jira Integration (НОВОЕ!)
JIRA_BASE_URL=https://media-life.atlassian.net
JIRA_EMAIL=your_email@company.com
JIRA_TOKEN=your_jira_api_token_here
JIRA_STORY_POINTS_FIELD_ID=customfield_10022
JIRA_PROJECT_KEY=FLEX

# Groups Configuration
GROUPS_CONFIG=[{"chat_id": -1002718440199, "topic_id": 2, "admins": ["@admin1", "@admin2"], "timeout": 90, "scale": ["1", "2", "3", "5", "8", "13"], "is_active": true}]

# Admin
HARD_ADMIN=@your_admin_username

# Application Settings
DATA_DIR=data
LOG_LEVEL=INFO
CLEANUP_DAYS=7
```

### 4. Установка зависимостей
```bash
# Если нужно обновить зависимости
pip3 install -r requirements.txt
```

## 🧪 **Тестирование (опционально)**

### 1. Тест Story Points интеграции
```bash
# Установите переменные окружения
export JIRA_EMAIL=your_email@company.com
export JIRA_TOKEN=your_jira_api_token_here

# Запустите тест
python3 test_story_points_integration.py
```

### 2. Проверка конфигурации
```bash
python3 scripts/check_config.py
```

## 🚀 **Запуск бота**

### Вариант 1: Простой запуск
```bash
nohup python3 bot.py > bot.log 2>&1 &
```

### Вариант 2: Systemd сервис
```bash
# Копируйте service файл
sudo cp planning-poker-bot.service /etc/systemd/system/

# Перезагрузите systemd
sudo systemctl daemon-reload

# Запустите сервис
sudo systemctl start planning-poker-bot
sudo systemctl enable planning-poker-bot

# Проверьте статус
sudo systemctl status planning-poker-bot
```

### Вариант 3: Docker
```bash
# Соберите образ
docker build -t planning-poker-bot .

# Запустите контейнер
docker-compose up -d
```

## ✅ **Проверка работы**

### 1. Проверка процессов
```bash
ps aux | grep -E "(python|bot)" | grep -v grep
```

### 2. Проверка логов
```bash
tail -f bot.log
```

### 3. Проверка в Telegram
- Отправьте `/start` боту
- Проверьте меню админа (должна быть кнопка "🔄 Обновить Story Points")
- Протестируйте основную функциональность

## 🔄 **Новые возможности**

### Story Points интеграция
- ✅ Кнопка "🔄 Обновить Story Points" в меню админа
- ✅ Автоматическое обновление Story Points в Jira
- ✅ Подробные отчеты об обновлениях
- ✅ Обработка ошибок и логирование

### Как использовать:
1. Завершите голосование по всем задачам
2. Нажмите "🔄 Обновить Story Points" (только для админов)
3. Получите отчет об успешных/неуспешных обновлениях

## 📊 **Мониторинг**

### Логи для отслеживания:
```bash
# Основные логи
tail -f bot.log

# Логи Story Points обновлений
grep "Story Points" bot.log

# Логи ошибок
grep "ERROR" bot.log
```

### Ключевые сообщения в логах:
- `Story Points update completed` - успешное обновление
- `Jira is available` - Jira доступна
- `Successfully updated` - задача обновлена
- `Failed to update` - ошибка обновления

## 🆘 **Устранение проблем**

### Проблема: Бот не запускается
```bash
# Проверьте логи
cat bot.log

# Проверьте переменные окружения
python3 -c "from config import *; print('Config loaded')"

# Проверьте зависимости
pip3 list | grep -E "(aiogram|aiohttp|python-dotenv)"
```

### Проблема: Story Points не обновляются
```bash
# Проверьте Jira учетные данные
python3 -c "
from services.jira_update_service import JiraUpdateService
from config import JIRA_BASE_URL, JIRA_EMAIL, JIRA_TOKEN
service = JiraUpdateService(JIRA_BASE_URL, JIRA_EMAIL, JIRA_TOKEN)
print('Jira service created')
"

# Проверьте права доступа в Jira
# Убедитесь, что пользователь может редактировать задачи
```

### Проблема: Кнопка не появляется
- Убедитесь, что пользователь является админом
- Проверьте конфигурацию группы в `GROUPS_CONFIG`
- Проверьте логи на ошибки

## 📞 **Поддержка**

При возникновении проблем:
1. Проверьте логи в `bot.log`
2. Убедитесь в правильности конфигурации
3. Проверьте права доступа в Jira
4. Обратитесь к администратору

## 🎉 **Готово!**

После выполнения всех шагов ваш Planning Poker Bot с интеграцией Story Points будет готов к работе!

**Новые возможности:**
- 🔄 Автоматическое обновление Story Points в Jira
- 📊 Подробные отчеты об обновлениях
- 🛡️ Безопасность и права доступа
- 📝 Полное логирование операций
