#!/usr/bin/env python3
"""
Тест подключения к боту
"""

import asyncio
from aiogram import Bot
from config import BOT_TOKEN

async def test_bot_connection():
    """Тест подключения к боту"""
    try:
        bot = Bot(token=BOT_TOKEN)
        
        # Получаем информацию о боте
        bot_info = await bot.get_me()
        print(f"✅ Бот подключен: @{bot_info.username} (ID: {bot_info.id})")
        
        # Проверяем, что бот может получать обновления
        updates = await bot.get_updates(limit=1)
        print(f"✅ Бот может получать обновления (последних: {len(updates)})")
        
        await bot.session.close()
        return True
        
    except Exception as e:
        print(f"❌ Ошибка подключения: {e}")
        return False

if __name__ == "__main__":
    print("🧪 Тестирование подключения к боту...")
    result = asyncio.run(test_bot_connection())
    if result:
        print("🎉 Бот готов к работе!")
    else:
        print("💥 Проблема с подключением!")
