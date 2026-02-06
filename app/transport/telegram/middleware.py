"""Middleware for dependency injection."""

from typing import Any, Awaitable, Callable, Dict

from aiogram import BaseMiddleware
from aiogram.types import TelegramObject

from app.providers import DIContainer


class DIMiddleware(BaseMiddleware):
    """Middleware to inject DI container into handler context."""

    def __init__(self, container: DIContainer):
        self.container = container

    async def __call__(
        self,
        handler: Callable[[TelegramObject, Dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: Dict[str, Any],
    ) -> Any:
        """Inject container into handler data."""
        data["container"] = self.container
        try:
            return await handler(event, data)
        except Exception as exc:
            # записываем ошибку в метрики и пробрасываем дальше, чтобы aiogram мог логировать
            try:
                await self.container.metrics.record_event(
                    event="handler_error",
                    status="error",
                    payload={
                        "exception": str(exc),
                        "event_type": type(event).__name__,
                    },
                )
            except Exception:
                pass
            raise
