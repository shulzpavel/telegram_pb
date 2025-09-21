"""
Admin handlers
"""
import logging
from aiogram import types, Router, F
from aiogram.types import CallbackQuery

from core.bootstrap import bootstrap
from .base_handlers import is_allowed_chat, is_admin
from utils import safe_send_message, safe_answer_callback

logger = logging.getLogger(__name__)

router = Router()

# Инициализация сервисов
session_service = bootstrap.get_session_service()
group_config_service = bootstrap.get_group_config_service()


@router.callback_query(F.data == "admin:update_story_points")
async def handle_update_story_points(callback: CallbackQuery):
    """Обработчик обновления Story Points"""
    try:
        logger.info(f"ADMIN_UPDATE_SP: User {callback.from_user.id if callback.from_user else 'unknown'} clicked update SP")
        
        if not callback.from_user or not callback.message:
            logger.error("ADMIN_UPDATE_SP: Missing callback data")
            return
        
        chat_id = callback.message.chat.id
        topic_id = callback.message.message_thread_id or 0
        
        if not is_allowed_chat(chat_id, topic_id):
            return
        
        # Проверяем права администратора
        if not is_admin(callback.from_user, chat_id, topic_id):
            await safe_answer_callback(callback, "❌ Только администраторы могут обновлять Story Points", show_alert=True)
            return
        
        # Получаем конфигурацию группы
        group_config = group_config_service.get_group_config(chat_id, topic_id or 0)
        if not group_config:
            await safe_answer_callback(callback, "❌ Конфигурация группы не найдена", show_alert=True)
            return
        
        # Проверяем наличие Jira токена
        if not group_config.jira_token or not group_config.jira_email:
            await safe_answer_callback(
                callback, 
                "❌ Jira не настроен. Обратитесь к администратору для настройки интеграции.", 
                show_alert=True
            )
            return
        
        # Получаем сессию и результаты голосования
        session = session_service.get_session(chat_id, topic_id)
        if not session:
            await safe_answer_callback(callback, "❌ Сессия не найдена", show_alert=True)
            return
        
        # Получаем результаты голосования
        results = session.get_voting_results()
        logger.info(f"ADMIN_UPDATE_SP: Voting results: {results}")
        if not results:
            logger.warning("ADMIN_UPDATE_SP: No voting results found")
            await safe_answer_callback(callback, "❌ Нет результатов голосования для обновления", show_alert=True)
            return
        
        # Обновляем Story Points в Jira
        from services.jira_update_service import JiraUpdateService
        from config import JIRA_BASE_URL, JIRA_STORY_POINTS_FIELD_ID
        
        jira_service = JiraUpdateService(
            jira_base_url=JIRA_BASE_URL,
            jira_email=group_config.jira_email,
            jira_token=group_config.jira_token,
            story_points_field_id=JIRA_STORY_POINTS_FIELD_ID
        )
        
        updated_tasks = []
        failed_tasks = []
        
        for task_key, story_points in results.items():
            try:
                # Преобразуем story_points в int
                story_points_int = int(story_points)
                
                # Вызываем асинхронный метод
                result = await jira_service.update_story_points(
                    issue_key=task_key,
                    story_points=story_points_int
                )
                
                if result.success:
                    updated_tasks.append(f"✅ {task_key}: {story_points} SP")
                    logger.info(f"Updated SP for {task_key}: {story_points}")
                else:
                    failed_tasks.append(f"❌ {task_key}: {result.error}")
                    logger.error(f"Failed to update SP for {task_key}: {result.error}")
            except Exception as e:
                failed_tasks.append(f"❌ {task_key}: {str(e)}")
                logger.error(f"Error updating SP for {task_key}: {e}")
        
        # Формируем детальный отчет
        report_lines = ["🔄 **Результаты обновления Story Points**\n"]
        
        if updated_tasks:
            report_lines.append("✅ **Успешно обновлено:**")
            report_lines.extend(updated_tasks)
            report_lines.append("")
        
        if failed_tasks:
            report_lines.append("❌ **Ошибки обновления:**")
            report_lines.extend(failed_tasks)
            report_lines.append("")
        
        # Добавляем итоговую статистику
        total_tasks = len(results)
        success_count = len(updated_tasks)
        failed_count = len(failed_tasks)
        
        report_lines.append(f"📊 **Итого:** {success_count}/{total_tasks} задач обновлено")
        
        if failed_count > 0:
            report_lines.append(f"⚠️ {failed_count} задач не удалось обновить")
        
        report_text = "\n".join(report_lines)
        
        # Показываем результат с кнопкой "Назад"
        from utils import get_main_menu
        
        await safe_send_message(
            callback.message.edit_text,
            report_text,
            reply_markup=get_main_menu(is_admin=True),
            parse_mode="Markdown"
        )
        
    except Exception as e:
        logger.error(f"Error in update story points handler: {e}")
        await safe_answer_callback(callback, "❌ Произошла ошибка при обновлении Story Points", show_alert=True)


@router.callback_query(F.data.startswith("menu:kick_participant"))
async def handle_kick_participant(callback: CallbackQuery):
    """Обработчик удаления участника"""
    try:
        if not callback.from_user or not callback.message:
            return
        
        chat_id = callback.message.chat.id
        topic_id = callback.message.message_thread_id or 0
        
        if not is_allowed_chat(chat_id, topic_id):
            return
        
        # Проверяем права администратора
        if not is_admin(callback.from_user, chat_id, topic_id):
            await safe_answer_callback(callback, "❌ Только администраторы могут удалять участников", show_alert=True)
            return
        
        # Получаем список участников
        session = session_service.get_session(chat_id, topic_id)
        participants = list(session.participants.values())
        
        if not participants:
            await safe_answer_callback(callback, "❌ Нет участников для удаления", show_alert=True)
            return
        
        # Создаем клавиатуру с участниками
        from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton
        keyboard = []
        
        for participant in participants:
            keyboard.append([
                InlineKeyboardButton(
                    text=f"❌ {participant.full_name.value}",
                    callback_data=f"kick:{participant.user_id.value}"
                )
            ])
        
        keyboard.append([
            InlineKeyboardButton(text="🔙 Назад", callback_data="menu:back")
        ])
        
        await safe_send_message(
            callback.message.edit_text,
            "👥 **Выберите участника для удаления:**",
            reply_markup=InlineKeyboardMarkup(inline_keyboard=keyboard),
            parse_mode="Markdown"
        )
        
    except Exception as e:
        logger.error(f"Error in kick participant handler: {e}")
        await safe_answer_callback(callback, "❌ Произошла ошибка при удалении участника", show_alert=True)


@router.callback_query(F.data.startswith("kick:"))
async def handle_confirm_kick(callback: CallbackQuery):
    """Обработчик подтверждения удаления участника"""
    try:
        if not callback.from_user or not callback.message:
            return
        
        chat_id = callback.message.chat.id
        topic_id = callback.message.message_thread_id or 0
        
        if not is_allowed_chat(chat_id, topic_id):
            return
        
        # Проверяем права администратора
        if not is_admin(callback.from_user, chat_id, topic_id):
            await safe_answer_callback(callback, "❌ Только администраторы могут удалять участников", show_alert=True)
            return
        
        # Извлекаем ID пользователя
        user_id = int(callback.data.split(":", 1)[1])
        
        # Удаляем участника
        participant = session_service.remove_participant(chat_id, topic_id, user_id)
        
        if participant:
            await safe_answer_callback(callback, f"✅ Участник {participant.full_name.value} удален")
        else:
            await safe_answer_callback(callback, "❌ Участник не найден", show_alert=True)
        
    except Exception as e:
        logger.error(f"Error in confirm kick handler: {e}")
        await safe_answer_callback(callback, "❌ Произошла ошибка при удалении участника", show_alert=True)
