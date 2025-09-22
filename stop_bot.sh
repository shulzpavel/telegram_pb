#!/bin/bash

# Скрипт для остановки Planning Poker бота
echo "🛑 Остановка Planning Poker бота..."

# Останавливаем все процессы бота
pkill -f "python.*bot" 2>/dev/null || true

# Ждем завершения
sleep 2

# Проверяем, что процессы остановлены
if pgrep -f "python.*bot" > /dev/null; then
    echo "⚠️  Некоторые процессы все еще работают. Принудительная остановка..."
    pkill -9 -f "python.*bot" 2>/dev/null || true
    sleep 1
fi

# Финальная проверка
if pgrep -f "python.*bot" > /dev/null; then
    echo "❌ Не удалось остановить все процессы"
    exit 1
else
    echo "✅ Бот успешно остановлен"
fi
