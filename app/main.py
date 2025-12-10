#!/usr/bin/env python3
"""Main application entry point."""

import argparse
import asyncio

from dotenv import load_dotenv

load_dotenv()

from aiogram import Bot, Dispatcher
from aiogram.exceptions import TelegramConflictError
from aiogram.fsm.storage.memory import MemoryStorage

from app.handlers import commands
from config import BOT_TOKEN, STATE_FILE
from app.services.session_service import SessionService


async def main(use_polling: bool = True) -> None:
    """Main application function."""
    if not BOT_TOKEN:
        raise RuntimeError("BOT_TOKEN не задан. Укажите его в переменных окружения.")

    bot = Bot(token=BOT_TOKEN, parse_mode="HTML")
    dp = Dispatcher(storage=MemoryStorage())

    # Include routers
    from app.handlers import callbacks, commands, text

    dp.include_router(commands.router)
    dp.include_router(callbacks.router)
    dp.include_router(text.router)

    # Cleanup on shutdown
    import atexit
    from jira_service import jira_service
    atexit.register(lambda: asyncio.run(jira_service._close_session()) if jira_service._session else None)

    if use_polling:
        print("✅ Bot is polling. Waiting for messages...")
        try:
            await dp.start_polling(bot, allowed_updates=dp.resolve_used_update_types())
        except TelegramConflictError as e:
            print(f"⚠️  Конфликт: другой экземпляр бота уже запущен")
            print(f"   Ошибка: {e}")
            print(f"   Бот не может работать, пока другой экземпляр активен")
            print(f"   Остановите другой экземпляр или используйте --no-poll")
            raise
    else:
        print("✅ Bot launched without polling (assumed secondary instance). Staying idle...")
        await asyncio.Future()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Planning Poker bot")
    parser.add_argument(
        "--no-poll",
        action="store_true",
        help="Не запускать polling (полезно при дублирующем инстансе под supervisord/systemd)",
    )
    args = parser.parse_args()
    asyncio.run(main(use_polling=not args.no_poll))

