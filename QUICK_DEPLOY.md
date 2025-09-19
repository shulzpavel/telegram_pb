# ⚡ Быстрый деплой Planning Poker Bot

## 🚀 Для разработчика (локально)

### 1. Подготовка к пушу

```bash
# Проверьте статус
git status

# Добавьте все изменения
git add .

# Закоммитьте изменения
git commit -m "Deploy: готов к продакшену"

# Запушьте на GitHub
git push origin main
```

### 2. Автоматический деплой (альтернатива)

```bash
# Используйте скрипт для автоматического пуша
./scripts/github_deploy.sh
```

## 🖥 На сервере

### 1. Первоначальная настройка (только один раз)

```bash
# Подключитесь к серверу
ssh root@your-server-ip

# Скачайте и запустите скрипт настройки
wget https://raw.githubusercontent.com/your-username/telegram_pb/main/scripts/setup_server.sh
chmod +x setup_server.sh
./setup_server.sh --repo-url=https://github.com/your-username/telegram_pb.git

# Настройте .env файл
nano /opt/planning-poker-bot/.env

# Запустите бота
systemctl start planning-poker-bot
```

### 2. Обновление бота (после каждого пуша)

```bash
# На сервере выполните:
cd /opt/planning-poker-bot
./scripts/quick_update.sh
```

## 📋 Чек-лист деплоя

### Перед пушем:
- [ ] Все тесты пройдены
- [ ] Конфигурация проверена
- [ ] Секретные данные не попали в git
- [ ] Код готов к продакшену

### На сервере:
- [ ] Сервер настроен
- [ ] .env файл сконфигурирован
- [ ] Бот запущен
- [ ] Логи проверены
- [ ] Функциональность протестирована

## 🔧 Команды для управления

```bash
# Статус бота
systemctl status planning-poker-bot

# Запуск/остановка/перезапуск
systemctl start planning-poker-bot
systemctl stop planning-poker-bot
systemctl restart planning-poker-bot

# Просмотр логов
journalctl -u planning-poker-bot -f

# Быстрое обновление
cd /opt/planning-poker-bot
./scripts/quick_update.sh

# Полный деплой
./scripts/deploy.sh deploy

# Откат
./scripts/deploy.sh rollback
```

## 🚨 Устранение неполадок

### Бот не запускается:
```bash
# Проверьте логи
journalctl -u planning-poker-bot -n 50

# Проверьте конфигурацию
python3 scripts/check_config.py

# Проверьте права доступа
ls -la /opt/planning-poker-bot/
```

### Проблемы с обновлением:
```bash
# Принудительное обновление
./scripts/quick_update.sh --force

# Полный деплой
./scripts/deploy.sh deploy
```

## 📞 Поддержка

При возникновении проблем:
1. Проверьте логи: `journalctl -u planning-poker-bot -f`
2. Проверьте конфигурацию: `python3 scripts/check_config.py`
3. Перезапустите бота: `systemctl restart planning-poker-bot`

---

**Готово!** Ваш бот обновлен и работает! 🎉
