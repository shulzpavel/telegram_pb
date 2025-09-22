#!/bin/bash

# Скрипт для безопасного запуска Planning Poker бота
echo "🚀 Запуск Planning Poker бота с Jira интеграцией..."

# Останавливаем все существующие процессы бота
echo "🛑 Остановка существующих процессов..."
pkill -f "python.*bot" 2>/dev/null || true

# Ждем завершения процессов
sleep 2

# Проверяем, что процессы остановлены
if pgrep -f "python.*bot" > /dev/null; then
    echo "❌ Не удалось остановить все процессы. Попробуйте:"
    echo "   pkill -9 -f 'python.*bot'"
    exit 1
fi

echo "✅ Все процессы остановлены"

# Запускаем бота
echo "🤖 Запуск бота..."
python3 bot.py &

# Ждем запуска
sleep 3

# Проверяем, что бот запустился
if pgrep -f "python.*bot.py" > /dev/null; then
    echo "✅ Бот успешно запущен!"
    echo "📋 Готов к тестированию в группе -1003087077812"
    echo ""
    echo "🧪 Для тестирования:"
    echo "   1. /start"
    echo "   2. /join lead_token"
    echo "   3. Отправьте: key=FLEX-365"
    echo ""
    echo "🛑 Для остановки: pkill -f 'python.*bot'"
else
    echo "❌ Не удалось запустить бота"
    exit 1
fi
