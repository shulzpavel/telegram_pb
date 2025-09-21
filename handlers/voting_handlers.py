"""
Voting handlers
"""
import logging
from aiogram import types, Router, F
from aiogram.types import CallbackQuery

from core.bootstrap import bootstrap
from .base_handlers import is_allowed_chat, is_admin
from utils import safe_send_message, safe_answer_callback, build_vote_keyboard, build_admin_keyboard

logger = logging.getLogger(__name__)

router = Router()

# Инициализация сервисов
session_service = bootstrap.get_session_service()
group_config_service = bootstrap.get_group_config_service()
role_service = bootstrap.get_role_service()
timer_service = bootstrap.get_timer_service()


@router.callback_query(F.data.startswith("vote:"))
async def vote_handler(callback: CallbackQuery):
    """Обработчик голосования"""
    try:
        if not callback.from_user or not callback.message:
            return
        
        user_id = callback.from_user.id
        chat_id = callback.message.chat.id
        topic_id = callback.message.message_thread_id or 0
        
        if not is_allowed_chat(chat_id, topic_id):
            return
        
        # Извлекаем значение голоса
        value = callback.data.split(":", 1)[1]
        logger.info(f"VOTE_HANDLER: User {user_id} voting with value '{value}'")
        
        # Получаем сессию
        session = session_service.get_session(chat_id, topic_id)
        logger.info(f"VOTE_HANDLER: Session participants: {list(session.participants.keys())}")
        logger.info(f"VOTE_HANDLER: Current task votes: {list(session.current_task.votes.keys()) if session.current_task else 'No current task'}")
        
        # Проверяем, может ли пользователь голосовать
        from domain.value_objects import UserId
        user_id_obj = UserId(user_id)
        is_participant = user_id_obj in session.participants
        can_vote = role_service.can_vote(callback.from_user)
        is_user_admin = is_admin(callback.from_user, chat_id, topic_id)
        
        logger.info(f"VOTE_HANDLER: User {user_id} - is_participant: {is_participant}, can_vote: {can_vote}, is_admin: {is_user_admin}")
        
        # Проверяем права на голосование
        if not can_vote:
            logger.warning(f"VOTE_HANDLER: User {user_id} cannot vote (role: {role_service.get_user_role(callback.from_user).value})")
            await safe_answer_callback(callback, "❌ У вас нет прав для голосования.", show_alert=True)
            return
        
        # Если пользователь не участник, но может голосовать (например, lead), добавляем его
        if not is_participant and can_vote:
            logger.info(f"VOTE_HANDLER: Adding voting user {user_id} to participants")
            from domain.entities import DomainParticipant
            from domain.value_objects import Username, FullName
            from domain.enums import ParticipantRole
            
            user_role = role_service.get_user_role(callback.from_user)
            participant = DomainParticipant(
                user_id=user_id_obj,
                username=Username(callback.from_user.username or ""),
                full_name=FullName(callback.from_user.full_name or f"User {user_id}"),
                role=user_role
            )
            session.add_participant(participant)
            session_service.save_session(session)
        
        # Проверяем, голосовал ли уже
        already_voted = user_id_obj in (session.current_task.votes if session.current_task else {})
        logger.info(f"VOTE_HANDLER: User {user_id} already_voted: {already_voted}")
        
        if already_voted:
            await safe_answer_callback(callback, "⚠️ Вы уже проголосовали!", show_alert=True)
            return
        
        # Добавляем голос
        success = session_service.add_vote(chat_id, topic_id, user_id, value)
        
        if success:
            await safe_answer_callback(callback, f"✅ Ваш голос: {value}")
            logger.info(f"VOTE_HANDLER: Vote added successfully for user {user_id}")
            
            # Проверяем, все ли проголосовали
            if session_service.is_all_voted(chat_id, topic_id):
                logger.info(f"VOTE_HANDLER: All participants voted, finishing voting")
                await timer_service.finish_voting(chat_id, topic_id, callback.message)
        else:
            await safe_answer_callback(callback, "❌ Ошибка при добавлении голоса", show_alert=True)
            
    except Exception as e:
        logger.error(f"Error in vote handler: {e}")
        await safe_answer_callback(callback, "❌ Произошла ошибка при голосовании", show_alert=True)


@router.callback_query(F.data == "finish_voting")
async def finish_voting_handler(callback: CallbackQuery):
    """Обработчик завершения голосования"""
    try:
        if not callback.from_user or not callback.message:
            return
        
        chat_id = callback.message.chat.id
        topic_id = callback.message.message_thread_id or 0
        
        if not is_allowed_chat(chat_id, topic_id):
            return
        
        # Проверяем права
        if not is_admin(callback.from_user, chat_id, topic_id):
            await safe_answer_callback(callback, "❌ Только администраторы могут завершать голосование", show_alert=True)
            return
        
        # Завершаем голосование
        await timer_service.finish_voting(chat_id, topic_id, callback.message)
        await safe_answer_callback(callback, "✅ Голосование завершено")
        
    except Exception as e:
        logger.error(f"Error in finish voting handler: {e}")
        await safe_answer_callback(callback, "❌ Произошла ошибка при завершении голосования", show_alert=True)


@router.callback_query(F.data.startswith("timer:"))
async def timer_control_handler(callback: CallbackQuery):
    """Обработчик управления таймером"""
    try:
        if not callback.from_user or not callback.message:
            return
        
        chat_id = callback.message.chat.id
        topic_id = callback.message.message_thread_id or 0
        
        if not is_allowed_chat(chat_id, topic_id):
            return
        
        # Проверяем права администратора
        if not is_admin(callback.from_user, chat_id, topic_id):
            await safe_answer_callback(callback, "❌ Только администраторы могут управлять таймером", show_alert=True)
            return
        
        # Извлекаем действие
        action = callback.data.split(":", 1)[1]
        
        if action == "+30":
            timer_service.extend_timer(chat_id, topic_id, 30)
            await safe_answer_callback(callback, "⏰ Таймер продлен на 30 секунд")
        elif action == "-30":
            timer_service.extend_timer(chat_id, topic_id, -30)
            await safe_answer_callback(callback, "⏰ Таймер сокращен на 30 секунд")
        else:
            await safe_answer_callback(callback, "❌ Неизвестное действие с таймером", show_alert=True)
        
    except Exception as e:
        logger.error(f"Error in timer control handler: {e}")
        await safe_answer_callback(callback, "❌ Произошла ошибка при управлении таймером", show_alert=True)
