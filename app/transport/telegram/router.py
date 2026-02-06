"""Router setup for Telegram handlers."""

from aiogram import Dispatcher

from app.providers import DIContainer
from app.transport.telegram.handlers import callbacks_router, commands_router, text_router
from app.transport.telegram.middleware import DIMiddleware


def setup_routers(dp: Dispatcher, container: DIContainer) -> None:
    """Setup routers with DI middleware."""
    dp.message.middleware(DIMiddleware(container))
    dp.callback_query.middleware(DIMiddleware(container))
    
    dp.include_router(commands_router)
    dp.include_router(callbacks_router)
    dp.include_router(text_router)
