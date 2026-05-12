"""Telegram adapter for Notifier interface."""

import logging
from typing import Any, Optional

from aiogram import Bot
from aiogram.types import FSInputFile, InlineKeyboardMarkup

from app.ports.notifier import Notifier

logger = logging.getLogger(__name__)


class TelegramNotifier(Notifier):
    """Telegram implementation of Notifier."""

    def __init__(self, bot: Bot):
        self.bot = bot

    async def send_message(
        self,
        chat_id: int,
        text: str,
        reply_markup: Optional[Any] = None,
        parse_mode: Optional[str] = None,
        disable_web_page_preview: bool = False,
        message_thread_id: Optional[int] = None,
    ) -> Optional[Any]:
        """Send text message. message_thread_id: topic/thread for forum groups."""
        try:
            kwargs = dict(
                chat_id=chat_id,
                text=text,
                reply_markup=reply_markup,
                parse_mode=parse_mode,
                disable_web_page_preview=disable_web_page_preview,
            )
            if message_thread_id is not None:
                kwargs["message_thread_id"] = message_thread_id
            return await self.bot.send_message(**kwargs)
        except Exception as exc:
            logger.warning("Telegram send_message failed: chat_id=%s thread_id=%s error=%s", chat_id, message_thread_id, exc)
            return None

    async def edit_message(
        self,
        chat_id: int,
        message_id: int,
        text: str,
        reply_markup: Optional[Any] = None,
        disable_web_page_preview: bool = False,
    ) -> Optional[Any]:
        """Edit existing message."""
        try:
            return await self.bot.edit_message_text(
                chat_id=chat_id,
                message_id=message_id,
                text=text,
                reply_markup=reply_markup,
                disable_web_page_preview=disable_web_page_preview,
            )
        except Exception as exc:
            logger.warning("Telegram edit_message failed: chat_id=%s message_id=%s error=%s", chat_id, message_id, exc)
            return None

    async def delete_message(self, chat_id: int, message_id: int) -> bool:
        """Delete message."""
        try:
            await self.bot.delete_message(chat_id=chat_id, message_id=message_id)
            return True
        except Exception as exc:
            logger.warning("Telegram delete_message failed: chat_id=%s message_id=%s error=%s", chat_id, message_id, exc)
            return False

    async def send_document(
        self,
        chat_id: int,
        document: Any,
        caption: Optional[str] = None,
        reply_markup: Optional[Any] = None,
        message_thread_id: Optional[int] = None,
    ) -> Optional[Any]:
        """Send document. message_thread_id: topic/thread for forum groups."""
        try:
            kwargs = dict(
                chat_id=chat_id,
                document=document,
                caption=caption,
                reply_markup=reply_markup,
            )
            if message_thread_id is not None:
                kwargs["message_thread_id"] = message_thread_id
            return await self.bot.send_document(**kwargs)
        except Exception as exc:
            logger.warning("Telegram send_document failed: chat_id=%s thread_id=%s error=%s", chat_id, message_thread_id, exc)
            return None

    async def answer_callback(
        self,
        callback_query_id: str,
        text: Optional[str] = None,
        show_alert: bool = False,
    ) -> bool:
        """Answer callback query."""
        try:
            await self.bot.answer_callback_query(
                callback_query_id=callback_query_id,
                text=text,
                show_alert=show_alert,
            )
            return True
        except Exception as exc:
            logger.warning("Telegram answer_callback failed: callback_query_id=%s error=%s", callback_query_id, exc)
            return False
