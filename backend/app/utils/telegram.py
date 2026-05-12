"""Telegram API utilities."""

import asyncio
from typing import Any, Callable

from aiogram.exceptions import TelegramRetryAfter


async def safe_call(func: Callable, *args: Any, **kwargs: Any) -> Any:
    """Safely call Telegram API function with retry on rate limit."""
    try:
        return await func(*args, **kwargs)
    except TelegramRetryAfter as exc:
        await asyncio.sleep(exc.retry_after)
        return await func(*args, **kwargs)

