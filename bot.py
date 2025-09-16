"""
Planning Poker Bot - Main Entry Point

Professional Telegram bot for conducting Planning Poker sessions
with multi-group and multi-topic support.
"""

import asyncio
import logging
from typing import NoReturn

from aiogram import Bot, Dispatcher
from aiogram.fsm.storage.memory import MemoryStorage

from config import BOT_TOKEN, DATA_DIR, LOG_LEVEL, GROUPS_CONFIG
from handlers import router
from handlers_modules.session_control_handlers import router as session_control_router
from core.bootstrap import bootstrap

# Configure logging
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(f'{DATA_DIR}/bot.log'),
        logging.StreamHandler()
    ]
)

logger = logging.getLogger(__name__)


async def main() -> None:
    """Main bot startup function."""
    logger.info("🚀 Planning Poker Bot starting...")
    
    if not BOT_TOKEN:
        logger.error("❌ BOT_TOKEN not configured!")
        return
    
    # Initialize bot and dispatcher
    bot = Bot(token=BOT_TOKEN, parse_mode="HTML")
    dp = Dispatcher(storage=MemoryStorage())
    dp.include_router(router)
    dp.include_router(session_control_router)
    
    # Initialize group configurations
    group_config_service = bootstrap.get_group_config_service()
    for group_config in GROUPS_CONFIG:
        group_config_service.create_group_config(
            chat_id=group_config['chat_id'],
            topic_id=group_config['topic_id'],
            admins=group_config['admins'],
            timeout=group_config.get('timeout', 90),
            scale=group_config.get('scale', ['1', '2', '3', '5', '8', '13']),
            is_active=group_config.get('is_active', True)
        )
        logger.info(f"✅ Configured group {group_config['chat_id']}_{group_config['topic_id']}")
    
    logger.info("✅ Bot is polling. Waiting for messages...")
    try:
        await dp.start_polling(bot)
    except Exception as e:
        logger.error(f"❌ Bot startup error: {e}")
    finally:
        await bot.session.close()


if __name__ == "__main__":
    asyncio.run(main())