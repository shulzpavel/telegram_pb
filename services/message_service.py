"""
Message service implementation
"""
import logging
from typing import Optional
from aiogram import types
from aiogram.exceptions import TelegramBadRequest

from core.interfaces import IMessageService

logger = logging.getLogger(__name__)


class MessageService(IMessageService):
    """Service for safe message handling"""
    
    async def send_message(
        self, 
        message_func, 
        text: str, 
        reply_markup=None,
        parse_mode=None,
        **kwargs
    ) -> Optional[types.Message]:
        """Send message safely"""
        try:
            return await message_func(
                text=text,
                reply_markup=reply_markup,
                parse_mode=parse_mode,
                **kwargs
            )
        except TelegramBadRequest as e:
            logger.error(f"Failed to send message: {e}")
            return None
        except Exception as e:
            logger.error(f"Unexpected error sending message: {e}")
            return None
    
    async def edit_message(
        self, 
        bot, 
        chat_id: int, 
        message_id: int, 
        text: str, 
        reply_markup=None,
        **kwargs
    ) -> bool:
        """Edit message safely"""
        try:
            await bot.edit_message_text(
                chat_id=chat_id,
                message_id=message_id,
                text=text,
                reply_markup=reply_markup,
                **kwargs
            )
            return True
        except TelegramBadRequest as e:
            logger.error(f"Failed to edit message: {e}")
            return False
        except Exception as e:
            logger.error(f"Unexpected error editing message: {e}")
            return False
    
    async def answer_callback(
        self, 
        callback_query, 
        text: str, 
        show_alert: bool = False
    ) -> None:
        """Answer callback safely"""
        try:
            await callback_query.answer(text=text, show_alert=show_alert)
        except TelegramBadRequest as e:
            logger.error(f"Failed to answer callback: {e}")
        except Exception as e:
            logger.error(f"Unexpected error answering callback: {e}")
    
    async def delete_message(self, bot, chat_id: int, message_id: int) -> bool:
        """Delete message safely"""
        try:
            await bot.delete_message(chat_id=chat_id, message_id=message_id)
            return True
        except TelegramBadRequest as e:
            logger.error(f"Failed to delete message: {e}")
            return False
        except Exception as e:
            logger.error(f"Unexpected error deleting message: {e}")
            return False
