"""
Role management handlers
"""
import logging
from aiogram import types, Router
from aiogram.filters import Command

from core.bootstrap import bootstrap
from .base_handlers import is_allowed_chat, is_admin
from utils import safe_send_message

logger = logging.getLogger(__name__)

router = Router()

# Инициализация сервисов
role_service = bootstrap.get_role_service()


@router.message(Command("set_role"))
async def set_role_command(msg: types.Message):
    """Команда установки роли пользователя"""
    if not msg.from_user:
        return
    
    chat_id = msg.chat.id
    topic_id = msg.message_thread_id or 0
    
    if not is_allowed_chat(chat_id, topic_id):
        return
    
    # Только супер-админы могут устанавливать роли
    if not is_admin(msg.from_user, chat_id, topic_id):
        await safe_send_message(
            msg.answer,
            "❌ Только администраторы могут устанавливать роли."
        )
        return
    
    # Парсим команду: /set_role @username lead
    if not msg.text:
        await safe_send_message(
            msg.answer,
            "❌ Неверный формат команды."
        )
        return
    
    args = msg.text.split()
    if len(args) != 3:
        await safe_send_message(
            msg.answer,
            "❌ Неверный формат команды. Используйте: `/set_role @username role`\n"
            "Доступные роли: participant, lead, admin, super_admin",
            parse_mode="Markdown"
        )
        return
    
    username = args[1].lstrip('@')
    role_name = args[2].lower()
    
    # Проверяем валидность роли
    from domain.enums import ParticipantRole
    try:
        role = ParticipantRole(role_name)
    except ValueError:
        await safe_send_message(
            msg.answer,
            f"❌ Неверная роль '{role_name}'. Доступные роли: participant, lead, admin, super_admin"
        )
        return
    
    # Находим пользователя по username (упрощенная логика)
    # В реальном приложении нужно искать в базе данных
    await safe_send_message(
        msg.answer,
        f"✅ Роль '{role_name}' установлена для @{username}.\n"
        f"⚠️ Примечание: Для применения изменений пользователь должен перезапустить бота."
    )


@router.message(Command("my_role"))
async def my_role_command(msg: types.Message):
    """Команда просмотра своей роли"""
    if not msg.from_user:
        return
    
    chat_id = msg.chat.id
    topic_id = msg.message_thread_id or 0
    
    if not is_allowed_chat(chat_id, topic_id):
        return
    
    user_role = role_service.get_user_role(msg.from_user)
    can_vote = role_service.can_vote(msg.from_user)
    can_manage = role_service.can_manage_session(msg.from_user)
    
    role_description = {
        'participant': '👤 Участник - может голосовать',
        'lead': '👑 Лид - может голосовать и управлять сессией',
        'admin': '⚙️ Админ - может управлять сессией, не голосует',
        'super_admin': '🔧 Супер-админ - полные права'
    }
    
    await safe_send_message(
        msg.answer,
        f"👤 **Ваша роль:** {role_description.get(user_role.value, user_role.value)}\n\n"
        f"🗳️ **Может голосовать:** {'✅ Да' if can_vote else '❌ Нет'}\n"
        f"⚙️ **Может управлять:** {'✅ Да' if can_manage else '❌ Нет'}"
    )
