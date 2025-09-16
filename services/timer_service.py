"""
Timer service implementation
"""
import asyncio
import logging
from typing import Dict, Optional
from datetime import datetime, timedelta
from aiogram import types

from core.interfaces import ITimerService, ISessionService, IGroupConfigService
from domain.value_objects import ChatId, TopicId, SessionKey
from domain.enums import SessionStatus

logger = logging.getLogger(__name__)


class TimerService(ITimerService):
    """Service for managing timers and voting sessions"""
    
    def __init__(self, session_service: ISessionService, group_config_service: IGroupConfigService):
        self._session_service = session_service
        self._group_config_service = group_config_service
        self._active_timers: Dict[str, asyncio.Task] = {}
        self._active_vote_tasks: Dict[str, asyncio.Task] = {}
    
    def _get_session_key(self, chat_id: int, topic_id: int) -> str:
        """Get session key"""
        return f"{chat_id}_{topic_id}"
    
    def _cancel_timers(self, session_key: str) -> None:
        """Cancel timers for session"""
        logger.info(f"CANCEL_TIMERS: Cancelling timers for key={session_key}")
        
        # Cancel vote timeout task
        if session_key in self._active_vote_tasks:
            task = self._active_vote_tasks[session_key]
            if not task.done():
                task.cancel()
                logger.info(f"CANCEL_TIMERS: Cancelling vote task for key={session_key}")
            del self._active_vote_tasks[session_key]
        
        # Cancel timer task
        if session_key in self._active_timers:
            task = self._active_timers[session_key]
            if not task.done():
                task.cancel()
                logger.info(f"CANCEL_TIMERS: Cancelling timer for key={session_key}")
            del self._active_timers[session_key]
    
    async def _vote_timeout(self, chat_id: int, topic_id: int, message: types.Message) -> None:
        """Handle vote timeout"""
        session_key = self._get_session_key(chat_id, topic_id)
        logger.info(f"VOTE_TIMEOUT: Starting timeout for chat_id={chat_id}, topic_id={topic_id}")
        
        try:
            # Get timeout from group config
            group_config = self._group_config_service.get_group_config(chat_id, topic_id)
            timeout_seconds = group_config.timeout.value if group_config else 90
            
            logger.info(f"VOTE_TIMEOUT: Sleeping for {timeout_seconds} seconds")
            await asyncio.sleep(timeout_seconds)
            
            # Check if timer is still active
            if session_key in self._active_vote_tasks:
                logger.info(f"VOTE_TIMEOUT: Timeout reached for {session_key}")
                await self.finish_voting(chat_id, topic_id, message)
                
        except asyncio.CancelledError:
            logger.info(f"VOTE_TIMEOUT: Cancelled for {session_key}")
        except Exception as e:
            logger.error(f"VOTE_TIMEOUT: Error for {session_key}: {e}")
        finally:
            # Clean up
            if session_key in self._active_vote_tasks:
                del self._active_vote_tasks[session_key]
    
    async def _update_timer(self, chat_id: int, topic_id: int, message: types.Message) -> None:
        """Update timer display"""
        session_key = self._get_session_key(chat_id, topic_id)
        logger.info(f"UPDATE_TIMER: Starting timer for chat_id={chat_id}, topic_id={topic_id}")
        
        # Store original message text to avoid adding timer text multiple times
        original_text = message.text
        if "⏰ Осталось:" in original_text:
            # Remove existing timer text
            original_text = original_text.split("\n\n⏰ Осталось:")[0]
        
        try:
            while session_key in self._active_timers:
                # Get remaining time
                session = self._session_service.get_session(chat_id, topic_id)
                if not session.vote_deadline:
                    break
                
                remaining = (session.vote_deadline - datetime.now()).total_seconds()
                if remaining <= 0:
                    break
                
                logger.info(f"UPDATE_TIMER: Remaining time: {int(remaining)} seconds")
                
                # Check for 10-second ping
                if remaining <= 10 and not getattr(session, 't10_ping_sent', False):
                    logger.info(f"UPDATE_TIMER: Sending 10-second ping for {chat_id}_{topic_id}")
                    try:
                        await message.answer("⚠️ Осталось 10 секунд!")
                        session.t10_ping_sent = True
                        self._session_service.save_session(session)
                    except Exception as e:
                        logger.error(f"UPDATE_TIMER: Error sending 10-second ping: {e}")
                
                # Update message with remaining time
                minutes = int(remaining) // 60
                seconds = int(remaining) % 60
                time_text = f"⏰ Осталось: {minutes:02d}:{seconds:02d}"
                
                # Try to update message (this might fail if message was deleted)
                try:
                    new_text = f"{original_text}\n\n{time_text}"
                    # Only update if text actually changed to avoid unnecessary edits
                    if message.text != new_text:
                        await message.edit_text(
                            text=new_text,
                            reply_markup=message.reply_markup,
                            disable_web_page_preview=False  # Keep links visible
                        )
                except Exception:
                    pass  # Ignore update errors
                
                await asyncio.sleep(5)  # Update every 5 seconds
                
        except asyncio.CancelledError:
            logger.info(f"UPDATE_TIMER: Cancelled for {session_key}")
        except Exception as e:
            logger.error(f"UPDATE_TIMER: Error for {session_key}: {e}")
        finally:
            # Clean up
            if session_key in self._active_timers:
                del self._active_timers[session_key]
    
    def start_vote_timer(self, chat_id: int, topic_id: int, message: types.Message) -> None:
        """Start vote timer"""
        session_key = self._get_session_key(chat_id, topic_id)
        
        # Cancel existing timers
        self._cancel_timers(session_key)
        
        # Set deadline
        session = self._session_service.get_session(chat_id, topic_id)
        group_config = self._group_config_service.get_group_config(chat_id, topic_id)
        timeout_seconds = group_config.timeout.value if group_config else 90
        
        session.vote_deadline = datetime.now() + timedelta(seconds=timeout_seconds)
        session.active_vote_message_id = message.message_id
        session.t10_ping_sent = False  # Reset 10-second ping flag
        self._session_service.save_session(session)
        
        # Start vote timeout task
        self._active_vote_tasks[session_key] = asyncio.create_task(
            self._vote_timeout(chat_id, topic_id, message)
        )
        
        # Start timer update task
        self._active_timers[session_key] = asyncio.create_task(
            self._update_timer(chat_id, topic_id, message)
        )
        
        logger.info(f"Started vote timer for {session_key}")
    
    def extend_timer(self, chat_id: int, topic_id: int, seconds: int) -> None:
        """Extend timer"""
        session_key = self._get_session_key(chat_id, topic_id)
        
        session = self._session_service.get_session(chat_id, topic_id)
        if session.vote_deadline:
            session.vote_deadline += timedelta(seconds=seconds)
            self._session_service.save_session(session)
            logger.info(f"Extended timer for {session_key} by {seconds} seconds")
    
    async def finish_voting(self, chat_id: int, topic_id: int, message: types.Message) -> None:
        """Finish voting"""
        session_key = self._get_session_key(chat_id, topic_id)
        logger.info(f"REVEAL_VOTES: chat_id={chat_id}, topic_id={topic_id}")
        
        # Cancel timers
        self._cancel_timers(session_key)
        
        # Complete current task
        session = self._session_service.get_session(chat_id, topic_id)
        if session.current_task:
            session.complete_current_task()
            self._session_service.save_session(session)
            
            # Check if all tasks are completed
            if session.current_task_index >= len(session.tasks):
                # All tasks completed - show final results
                logger.info(f"REVEAL_VOTES: All tasks completed")
                session.finish_voting()
                self._session_service.save_session(session)
                
                # Show final results as file
                from utils import generate_voting_results_file
                import tempfile
                import os
                from aiogram.types import FSInputFile
                
                results_text = generate_voting_results_file(session)
                logger.info(f"REVEAL_VOTES: Generated results text length: {len(results_text) if results_text else 0}")
                
                if results_text:
                    # Create temporary file
                    with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', suffix='.txt', delete=False) as f:
                        f.write(results_text)
                        temp_file_path = f.name
                    
                    try:
                        # Send file
                        file_input = FSInputFile(temp_file_path, filename=f"voting_results_{datetime.now().strftime('%Y%m%d_%H%M')}.txt")
                        await message.answer_document(file_input, caption="🎉 Все задачи завершены!\n\n📊 Результаты голосования:")
                    finally:
                        # Delete temporary file
                        os.unlink(temp_file_path)
                else:
                    await message.edit_text(
                        "🎉 Все задачи завершены!\n\n📊 Результаты будут доступны в статистике."
                    )
                return
            
            # Check if batch is complete
            if session.is_batch_complete():
                logger.info(f"REVEAL_VOTES: Batch completed, checking for revoting needs")
                
                # Import here to avoid circular imports
                from core.bootstrap import bootstrap
                session_control_service = bootstrap.get_session_control_service()
                
                # Check if batch completion requires action
                needs_action = session_control_service.check_batch_completion(chat_id, topic_id)
                
                if needs_action:
                    # Show batch completion UI
                    from utils import create_batch_completion_keyboard, format_batch_completion_message
                    batch_info = session_control_service.get_batch_progress(chat_id, topic_id)
                    
                    await message.edit_text(
                        format_batch_completion_message(batch_info),
                        reply_markup=create_batch_completion_keyboard()
                    )
                    return
                else:
                    # Continue to next task in the same batch or next batch
                    logger.info(f"REVEAL_VOTES: More tasks available, starting next task")
                    await self._start_next_task(chat_id, topic_id, message)
                    return
            
            # Check if there are more tasks
            if session.current_task_index < len(session.tasks):
                # Start next task
                logger.info(f"REVEAL_VOTES: Starting next task")
                await self._start_next_task(chat_id, topic_id, message)
    
    def cancel_timers(self, chat_id: int, topic_id: int) -> None:
        """Cancel timers for session"""
        session_key = self._get_session_key(chat_id, topic_id)
        self._cancel_timers(session_key)
    
    async def _start_next_task(self, chat_id: int, topic_id: int, message: types.Message) -> None:
        """Start next voting task"""
        try:
            logger.info(f"START_NEXT_TASK: Starting for {chat_id}_{topic_id}")
            
            session = self._session_service.get_session(chat_id, topic_id)
            
            # Check if session is in voting state to avoid duplicate calls
            if session.status != SessionStatus.VOTING:
                logger.warning(f"START_NEXT_TASK: Session not in voting state: {session.status}")
                return
            
            current_task = session.current_task
            
            logger.info(f"START_NEXT_TASK: Session has {len(session.tasks)} tasks, current index: {session.current_task_index}")
            
            if not current_task:
                logger.warning(f"START_NEXT_TASK: No current task for session {chat_id}_{topic_id}")
                return
            
            logger.info(f"START_NEXT_TASK: Current task: {current_task.text.value}")
            
            # Get group config for scale
            group_config = self._group_config_service.get_group_config(chat_id, topic_id)
            scale = group_config.scale if group_config else ['1', '2', '3', '5', '8', '13']
            logger.info(f"START_NEXT_TASK: Using scale: {scale}")
            
            # Create voting message
            from utils import format_task_with_progress, build_vote_keyboard, build_admin_keyboard
            
            voting_text = format_task_with_progress(
                session.current_task_index + 1,
                len(session.tasks),
                current_task.text.value
            )
            
            logger.info(f"START_NEXT_TASK: Generated voting text: {voting_text[:100]}...")
            
            # Use admin keyboard for all users (since we can't determine admin status here)
            # The admin check will be done in the callback handlers
            voting_keyboard = build_admin_keyboard(scale)
            logger.info(f"START_NEXT_TASK: Generated admin voting keyboard")
            
            # Send voting message
            from utils import safe_send_message
            logger.info(f"START_NEXT_TASK: Sending message with text length: {len(voting_text)}")
            contains_links = '<a href=' in voting_text or ('[' in voting_text and '](' in voting_text)
            logger.info(f"START_NEXT_TASK: Message contains links: {contains_links}")
            
            # Let safe_send_message handle web page preview based on links
            voting_message = await safe_send_message(
                message.answer,
                voting_text,
                reply_markup=voting_keyboard
                # disable_web_page_preview will be set automatically by safe_send_message
            )
            
            logger.info(f"START_NEXT_TASK: Message sent successfully: {voting_message is not None}")
            
            if voting_message:
                logger.info(f"START_NEXT_TASK: Sent voting message, starting timer")
                # Start timer
                self.start_vote_timer(chat_id, topic_id, voting_message)
                logger.info(f"START_NEXT_TASK: Started voting for task {session.current_task_index + 1} in {chat_id}_{topic_id}")
            else:
                logger.error(f"START_NEXT_TASK: Failed to send voting message")
            
        except Exception as e:
            logger.error(f"START_NEXT_TASK: Error starting next task: {e}", exc_info=True)

    def cleanup(self) -> None:
        """Cleanup all timers"""
        for session_key in list(self._active_timers.keys()):
            self._cancel_timers(session_key)
        logger.info("Cleaned up all timers")
