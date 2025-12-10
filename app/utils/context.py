"""Context extraction utilities."""

from typing import Optional, Tuple, Union

from aiogram import types


def extract_context(entity: Union[types.Message, types.CallbackQuery]) -> Tuple[int, Optional[int]]:
    """Extract chat_id and topic_id from message or callback."""
    message = entity.message if isinstance(entity, types.CallbackQuery) else entity
    return message.chat.id, getattr(message, "message_thread_id", None)

