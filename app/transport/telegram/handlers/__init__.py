"""Telegram handlers."""

from app.transport.telegram.handlers.commands import router as commands_router
from app.transport.telegram.handlers.callbacks import router as callbacks_router
from app.transport.telegram.handlers.text import router as text_router

__all__ = ["commands_router", "callbacks_router", "text_router"]
