#!/usr/bin/env python3
"""
Скрипт для проверки и запуска бота
"""

import subprocess
import time
import sys

def kill_all_bots():
    """Остановить все процессы бота"""
    try:
        subprocess.run(["pkill", "-9", "-f", "python.*bot"], check=False)
        time.sleep(2)
        print("✅ Все процессы бота остановлены")
    except Exception as e:
        print(f"⚠️ Ошибка при остановке: {e}")

def check_bot_running():
    """Проверить, запущен ли бот"""
    try:
        result = subprocess.run(["ps", "aux"], capture_output=True, text=True)
        return "python.*bot.py" in result.stdout
    except:
        return False

def start_bot():
    """Запустить бота"""
    try:
        subprocess.Popen(["python3", "bot.py"], 
                        stdout=subprocess.DEVNULL, 
                        stderr=subprocess.DEVNULL)
        time.sleep(3)
        return True
    except Exception as e:
        print(f"❌ Ошибка запуска: {e}")
        return False

if __name__ == "__main__":
    print("🔍 Проверка и запуск бота...")
    
    # Останавливаем все процессы
    kill_all_bots()
    
    # Проверяем, что все остановлено
    if check_bot_running():
        print("⚠️ Все еще есть запущенные процессы")
        kill_all_bots()
        time.sleep(2)
    
    # Запускаем бота
    if start_bot():
        print("✅ Бот запущен успешно!")
        print("📋 Готов к тестированию в группе -1003087077812")
    else:
        print("❌ Не удалось запустить бота")
        sys.exit(1)
