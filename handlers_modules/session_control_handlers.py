"""
Handlers for session control (pause and revoting)
"""
import logging
from typing import Dict, Any

from aiogram import types, Router, F
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext

from core.bootstrap import bootstrap
from core.interfaces import ISessionControlService, ISessionService, IGroupConfigService
from domain.enums import PauseReason, SessionStatus
from utils import (
    create_batch_completion_keyboard, create_pause_management_keyboard,
    create_revoting_keyboard, create_discrepancy_analysis_keyboard,
    format_batch_completion_message, format_pause_message, format_revoting_message,
    format_discrepancy_analysis, format_batch_progress
)

logger = logging.getLogger(__name__)
router = Router()


@router.callback_query(F.data.startswith("batch:"))
async def handle_batch_completion(callback_query: types.CallbackQuery):
    """Handle batch completion decisions"""
    try:
        chat_id = callback_query.message.chat.id
        topic_id = callback_query.message.message_thread_id or 0
        
        session_control_service = bootstrap.get_session_control_service()
        session_service = bootstrap.get_session_service()
        group_config_service = bootstrap.get_group_config_service()
        
        # Check admin rights
        if not group_config_service.is_admin(chat_id, topic_id, callback_query.from_user):
            await callback_query.answer("❌ Только админы могут управлять сессией", show_alert=True)
            return
        
        action = callback_query.data.split(":")[1]
        
        if action == "continue":
            # Continue to next batch
            session = session_service.get_session(chat_id, topic_id)
            
            # Move to next batch
            session.current_batch_index += 1
            session.current_task_index = session.current_batch_index * session.batch_size
            
            # Ensure we don't go beyond available tasks
            if session.current_task_index >= len(session.tasks):
                # All tasks completed
                await callback_query.message.edit_text(
                    "🎉 **Все задачи завершены!**\n\nСессия планирования покера завершена успешно.",
                    parse_mode="Markdown"
                )
                await callback_query.answer("✅ Все задачи завершены")
                return
            
            # Resume session and save
            session.resume_session()
            session_service.save_session(session)
            
            # Start next batch
            await start_next_batch(callback_query.message, chat_id, topic_id)
            await callback_query.answer("🔄 Переход к следующему банчу")
            
        elif action == "pause":
            # Pause session
            success = session_control_service.pause_session(chat_id, topic_id, PauseReason.BATCH_COMPLETED)
            
            if success:
                pause_info = session_control_service.get_pause_status(chat_id, topic_id)
                keyboard = create_pause_management_keyboard()
                
                await callback_query.message.edit_text(
                    format_pause_message(pause_info),
                    reply_markup=keyboard,
                    parse_mode="Markdown"
                )
                
                await callback_query.answer("⏸️ Сессия приостановлена")
            else:
                await callback_query.answer("❌ Ошибка при приостановке сессии", show_alert=True)
        
    except Exception as e:
        logger.error(f"Error handling batch completion: {e}")
        await callback_query.answer("❌ Произошла ошибка", show_alert=True)


@router.callback_query(F.data.startswith("pause:"))
async def handle_pause_management(callback_query: types.CallbackQuery):
    """Handle pause management actions"""
    try:
        chat_id = callback_query.message.chat.id
        topic_id = callback_query.message.message_thread_id or 0
        
        session_control_service = bootstrap.get_session_control_service()
        session_service = bootstrap.get_session_service()
        group_config_service = bootstrap.get_group_config_service()
        
        # Check admin rights
        if not group_config_service.is_admin(chat_id, topic_id, callback_query.from_user):
            await callback_query.answer("❌ Только админы могут управлять сессией", show_alert=True)
            return
        
        action = callback_query.data.split(":")[1]
        
        if action == "resume":
            # Resume session
            success = session_control_service.resume_session(chat_id, topic_id)
            
            if success:
                # Check if we need to start next batch or continue current task
                session = session_service.get_session(chat_id, topic_id)
                if session.current_task_index < len(session.tasks):
                    await start_next_batch(callback_query.message, chat_id, topic_id)
                    await callback_query.answer("▶️ Сессия возобновлена")
                else:
                    await callback_query.message.edit_text(
                        "🎉 **Все задачи завершены!**\n\nСессия планирования покера завершена успешно.",
                        parse_mode="Markdown"
                    )
                    await callback_query.answer("✅ Все задачи завершены")
            else:
                await callback_query.answer("❌ Ошибка при возобновлении сессии", show_alert=True)
                
        elif action == "stats":
            # Show statistics
            batch_info = session_control_service.get_batch_progress(chat_id, topic_id)
            await callback_query.message.edit_text(
                format_batch_progress(batch_info),
                parse_mode="Markdown"
            )
            await callback_query.answer("📊 Статистика показана")
            
        elif action == "revote":
            # Start revoting process
            tasks_needing_revoting = session_control_service.analyze_session_for_revoting(chat_id, topic_id)
            
            if tasks_needing_revoting:
                keyboard = create_discrepancy_analysis_keyboard(tasks_needing_revoting)
                await callback_query.message.edit_text(
                    format_discrepancy_analysis(tasks_needing_revoting),
                    reply_markup=keyboard,
                    parse_mode="Markdown"
                )
                await callback_query.answer("🔄 Анализ расхождений")
            else:
                await callback_query.answer("✅ Расхождений не найдено", show_alert=True)
                
        elif action == "back_to_discussion":
            # Return to main menu
            from utils import get_main_menu
            await callback_query.message.edit_text(
                "📌 Главное меню:",
                reply_markup=get_main_menu()
            )
            await callback_query.answer("🏠 Возврат в главное меню")
        
    except Exception as e:
        logger.error(f"Error handling pause management: {e}")
        await callback_query.answer("❌ Произошла ошибка", show_alert=True)


@router.callback_query(F.data.startswith("revote:"))
async def handle_revoting_management(callback_query: types.CallbackQuery):
    """Handle revoting management actions"""
    try:
        chat_id = callback_query.message.chat.id
        topic_id = callback_query.message.message_thread_id or 0
        
        session_control_service = bootstrap.get_session_control_service()
        group_config_service = bootstrap.get_group_config_service()
        
        # Check admin rights
        if not group_config_service.is_admin(chat_id, topic_id, callback_query.from_user):
            await callback_query.answer("❌ Только админы могут управлять сессией", show_alert=True)
            return
        
        action = callback_query.data.split(":")[1]
        
        if action == "start":
            # Start revoting
            tasks_needing_revoting = session_control_service.analyze_session_for_revoting(chat_id, topic_id)
            
            if tasks_needing_revoting:
                task_indices = [task['index'] for task in tasks_needing_revoting]
                success = session_control_service.start_revoting(chat_id, topic_id, task_indices)
                
                if success:
                    await start_revoting_task(callback_query.message, chat_id, topic_id)
                    await callback_query.answer("🔄 Переголосование начато")
                else:
                    await callback_query.answer("❌ Ошибка при запуске переголосования", show_alert=True)
            else:
                await callback_query.answer("✅ Нет задач для переголосования", show_alert=True)
                
        elif action == "skip":
            # Skip revoting
            session_control_service.resume_session(chat_id, topic_id)
            await callback_query.answer("⏭️ Переголосование пропущено")
            
        elif action == "show_discrepancies":
            # Show discrepancies
            tasks_needing_revoting = session_control_service.analyze_session_for_revoting(chat_id, topic_id)
            await callback_query.message.edit_text(
                format_discrepancy_analysis(tasks_needing_revoting),
                parse_mode="Markdown"
            )
            await callback_query.answer("📊 Расхождения показаны")
            
        elif action == "complete":
            # Complete current revoting task
            success = session_control_service.complete_revoting_task(chat_id, topic_id)
            
            if success:
                revoting_info = session_control_service.get_revoting_status(chat_id, topic_id)
                
                if revoting_info['is_in_progress']:
                    # Continue to next revoting task
                    await start_revoting_task(callback_query.message, chat_id, topic_id)
                else:
                    # Revoting completed, resume session
                    await callback_query.message.edit_text(
                        "✅ Переголосование завершено! Сессия возобновлена.",
                        parse_mode="Markdown"
                    )
                    await start_next_batch(callback_query.message, chat_id, topic_id)
                
                await callback_query.answer("✅ Задача переголосована")
            else:
                await callback_query.answer("❌ Ошибка при завершении переголосования", show_alert=True)
                
        elif action == "cancel":
            # Cancel revoting
            session_control_service.resume_session(chat_id, topic_id)
            await callback_query.answer("❌ Переголосование отменено")
        
    except Exception as e:
        logger.error(f"Error handling revoting management: {e}")
        await callback_query.answer("❌ Произошла ошибка", show_alert=True)


@router.callback_query(F.data.startswith("discrepancy:"))
async def handle_discrepancy_management(callback_query: types.CallbackQuery):
    """Handle discrepancy management actions"""
    try:
        chat_id = callback_query.message.chat.id
        topic_id = callback_query.message.message_thread_id or 0
        
        session_control_service = bootstrap.get_session_control_service()
        group_config_service = bootstrap.get_group_config_service()
        
        # Check admin rights
        if not group_config_service.is_admin(chat_id, topic_id, callback_query.from_user):
            await callback_query.answer("❌ Только админы могут управлять сессией", show_alert=True)
            return
        
        action = callback_query.data.split(":")[1]
        
        if action == "revote_all":
            # Start revoting for all tasks with discrepancies
            tasks_needing_revoting = session_control_service.analyze_session_for_revoting(chat_id, topic_id)
            
            if tasks_needing_revoting:
                task_indices = [task['index'] for task in tasks_needing_revoting]
                success = session_control_service.start_revoting(chat_id, topic_id, task_indices)
                
                if success:
                    await start_revoting_task(callback_query.message, chat_id, topic_id)
                    await callback_query.answer("🔄 Переголосование всех задач начато")
                else:
                    await callback_query.answer("❌ Ошибка при запуске переголосования", show_alert=True)
            else:
                await callback_query.answer("✅ Нет задач для переголосования", show_alert=True)
                
        elif action == "skip":
            # Skip discrepancy handling
            session_control_service.resume_session(chat_id, topic_id)
            await callback_query.answer("⏭️ Обработка расхождений пропущена")
            
        elif action.startswith("task_"):
            # Handle specific task
            task_index = int(action.split("_")[1])
            success = session_control_service.start_revoting(chat_id, topic_id, [task_index])
            
            if success:
                await start_revoting_task(callback_query.message, chat_id, topic_id)
                await callback_query.answer(f"🔄 Переголосование задачи {task_index + 1}")
            else:
                await callback_query.answer("❌ Ошибка при запуске переголосования", show_alert=True)
        
    except Exception as e:
        logger.error(f"Error handling discrepancy management: {e}")
        await callback_query.answer("❌ Произошла ошибка", show_alert=True)


async def start_next_batch(message: types.Message, chat_id: int, topic_id: int):
    """Start next batch of tasks"""
    try:
        session_service = bootstrap.get_session_service()
        session = session_service.get_session(chat_id, topic_id)
        
        # Check if all tasks are completed
        if session.current_task_index >= len(session.tasks):
            # All tasks completed
            await message.edit_text(
                "🎉 **Все задачи завершены!**\n\nСессия планирования покера завершена успешно.",
                parse_mode="Markdown"
            )
            return
        
        # Ensure we're in the correct state for starting next task
        if session.status != SessionStatus.VOTING:
            logger.warning(f"Session not in VOTING state: {session.status}")
            # Try to resume session if it's paused
            if session.status == SessionStatus.PAUSED:
                session.resume_session()
                session_service.save_session(session)
            else:
                logger.error(f"Cannot start next batch in state: {session.status}")
                return
        
        # Start next task using timer service
        timer_service = bootstrap.get_timer_service()
        await timer_service._start_next_task(chat_id, topic_id, message)
        
    except Exception as e:
        logger.error(f"Error starting next batch: {e}")


async def start_revoting_task(message: types.Message, chat_id: int, topic_id: int):
    """Start revoting for current task"""
    try:
        session_control_service = bootstrap.get_session_control_service()
        revoting_info = session_control_service.get_revoting_status(chat_id, topic_id)
        
        if revoting_info['is_in_progress']:
            current_task = revoting_info['current_task']
            task_index = revoting_info['current_index'] + 1
            total_tasks = revoting_info['tasks_count']
            
            # Process task text with Jira links
            from config import JIRA_BASE_URL
            
            from utils import create_jira_link_generator
            jira_generator = create_jira_link_generator(JIRA_BASE_URL)
            processed_task = jira_generator.process_task_text(current_task)
            
            await message.edit_text(
                f"🔄 **Переголосование {task_index}/{total_tasks}**\n\n"
                f"📝 **Задача:** {processed_task}\n\n"
                f"⚠️ **Внимание:** Эта задача требует переголосования из-за расхождений в оценках.\n"
                f"Пожалуйста, проголосуйте заново.",
                parse_mode="Markdown"
            )
        else:
            await message.edit_text(
                "✅ Переголосование завершено!",
                parse_mode="Markdown"
            )
        
    except Exception as e:
        logger.error(f"Error starting revoting task: {e}")


@router.message(Command("pause"))
async def pause_session_command(message: types.Message):
    """Pause session command"""
    try:
        chat_id = message.chat.id
        topic_id = message.message_thread_id or 0
        
        session_control_service = bootstrap.get_session_control_service()
        group_config_service = bootstrap.get_group_config_service()
        
        # Check admin rights
        if not group_config_service.is_admin(chat_id, topic_id, message.from_user):
            await message.reply("❌ Только админы могут приостанавливать сессию")
            return
        
        success = session_control_service.pause_session(chat_id, topic_id, PauseReason.ADMIN_REQUEST)
        
        if success:
            pause_info = session_control_service.get_pause_status(chat_id, topic_id)
            keyboard = create_pause_management_keyboard()
            
            await message.reply(
                format_pause_message(pause_info),
                reply_markup=keyboard,
                parse_mode="Markdown"
            )
        else:
            await message.reply("❌ Ошибка при приостановке сессии")
        
    except Exception as e:
        logger.error(f"Error in pause command: {e}")
        await message.reply("❌ Произошла ошибка")


@router.message(Command("resume"))
async def resume_session_command(message: types.Message):
    """Resume session command"""
    try:
        chat_id = message.chat.id
        topic_id = message.message_thread_id or 0
        
        session_control_service = bootstrap.get_session_control_service()
        group_config_service = bootstrap.get_group_config_service()
        
        # Check admin rights
        if not group_config_service.is_admin(chat_id, topic_id, message.from_user):
            await message.reply("❌ Только админы могут возобновлять сессию")
            return
        
        success = session_control_service.resume_session(chat_id, topic_id)
        
        if success:
            await message.reply("▶️ Сессия возобновлена!")
        else:
            await message.reply("❌ Ошибка при возобновлении сессии")
        
    except Exception as e:
        logger.error(f"Error in resume command: {e}")
        await message.reply("❌ Произошла ошибка")


@router.message(Command("revote"))
async def revote_session_command(message: types.Message):
    """Start revoting command"""
    try:
        chat_id = message.chat.id
        topic_id = message.message_thread_id or 0
        
        session_control_service = bootstrap.get_session_control_service()
        group_config_service = bootstrap.get_group_config_service()
        
        # Check admin rights
        if not group_config_service.is_admin(chat_id, topic_id, message.from_user):
            await message.reply("❌ Только админы могут запускать переголосование")
            return
        
        tasks_needing_revoting = session_control_service.analyze_session_for_revoting(chat_id, topic_id)
        
        if tasks_needing_revoting:
            keyboard = create_discrepancy_analysis_keyboard(tasks_needing_revoting)
            await message.reply(
                format_discrepancy_analysis(tasks_needing_revoting),
                reply_markup=keyboard,
                parse_mode="Markdown"
            )
        else:
            await message.reply("✅ Расхождений в оценках не найдено. Переголосование не требуется.")
        
    except Exception as e:
        logger.error(f"Error in revote command: {e}")
        await message.reply("❌ Произошла ошибка")
