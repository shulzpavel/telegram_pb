"""
Role management handlers
"""
import logging
from aiogram import types, Router
from aiogram.filters import Command

from core.bootstrap import bootstrap
from .base_handlers import is_allowed_chat
from utils import safe_send_message

logger = logging.getLogger(__name__)

router = Router()

# Инициализация сервисов
role_service = bootstrap.get_role_service()
logger.info("ROLE_HANDLERS: Role service initialized successfully")
logger.info("ROLE_HANDLERS: Router created and ready")


@router.message(Command("join"))
async def join_command(msg: types.Message):
    """Команда присоединения с токеном роли"""
    logger.info("ROLE_HANDLERS: JOIN command handler triggered!")
    logger.info(f"JOIN: Received command from user {msg.from_user.id if msg.from_user else 'None'}")
    logger.info(f"JOIN: Message text: {msg.text}")
    logger.info(f"JOIN: Chat ID: {msg.chat.id}, Topic ID: {msg.message_thread_id or 0}")
    
    if not msg.from_user:
        logger.info("JOIN: No user, returning")
        return
    
    chat_id = msg.chat.id
    topic_id = msg.message_thread_id or 0
    
    logger.info(f"JOIN: Chat ID: {chat_id}, Topic ID: {topic_id}")
    
    if not is_allowed_chat(chat_id, topic_id):
        logger.info("JOIN: Chat not allowed, returning")
        return
    
    # Парсим команду: /join token
    if not msg.text:
        await safe_send_message(
            msg.answer,
            "❌ Неверный формат команды. Используйте: `/join token`",
            parse_mode="Markdown"
        )
        return
    
    text_parts = msg.text.split()
    if len(text_parts) < 2:
        await safe_send_message(
            msg.answer,
            "❌ Неверный формат команды. Используйте: `/join token`\n\n"
            "Доступные токены:\n"
            "• `user_token` - роль участника\n"
            "• `lead_token` - роль лида\n"
            "• `admin_token` - роль админа",
            parse_mode="Markdown"
        )
        return
    
    token = text_parts[1]
    username = msg.from_user.username or str(msg.from_user.id)
    
    try:
        # Определяем роль по токену (проверяем стандартные токены)
        from domain.enums import ParticipantRole
        
        role = None
        if token == "user_token":
            role = ParticipantRole.PARTICIPANT
        elif token == "lead_token":
            role = ParticipantRole.LEAD
        elif token == "admin_token":
            role = ParticipantRole.ADMIN
        else:
            # Неизвестный токен
            await safe_send_message(
                msg.answer,
                "❌ Неверный токен. Доступные токены:\n"
                "• `user_token` - роль участника\n"
                "• `lead_token` - роль лида\n"
                "• `admin_token` - роль админа",
                parse_mode="Markdown"
            )
            return
        
        # Устанавливаем роль
        success = role_service.set_user_role_by_username(chat_id, topic_id, username, role)
        
        if success:
            # Добавляем пользователя в сессию
            session_service = bootstrap.get_session_service()
            try:
                session_service.add_participant(chat_id, topic_id, msg.from_user)
                logger.info(f"Added participant {msg.from_user.id} to session {chat_id}_{topic_id}")
            except Exception as e:
                logger.error(f"Error adding participant to session: {e}")
            
            role_emoji = {
                ParticipantRole.PARTICIPANT: "👤",
                ParticipantRole.LEAD: "👑", 
                ParticipantRole.ADMIN: "⚡"
            }.get(role, "❓")
            
            await safe_send_message(
                msg.answer,
                f"{role_emoji} Роль **{role.value}** успешно назначена!\n"
                f"✅ Вы добавлены в сессию планирования",
                parse_mode="Markdown"
            )
        else:
            await safe_send_message(
                msg.answer,
                f"❌ Не удалось назначить роль",
                parse_mode="Markdown"
            )
    except Exception as e:
        logger.error(f"Error setting role: {e}")
        await safe_send_message(
            msg.answer,
            "❌ Произошла ошибка при назначении роли",
            parse_mode="Markdown"
        )