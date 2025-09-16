"""
Example of using the refactored architecture
"""
import asyncio
import logging
from aiogram import Bot, Dispatcher, types
from aiogram.fsm.context import FSMContext

from core.bootstrap import bootstrap
from core.exceptions import ValidationError, AuthorizationError
from domain.value_objects import ChatId, TopicId, UserId, VoteValue
from domain.enums import SessionStatus

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class RefactoredPokerBot:
    """Example of refactored poker bot using new architecture"""
    
    def __init__(self, bot_token: str):
        self.bot = Bot(token=bot_token)
        self.dp = Dispatcher()
        
        # Configure services
        bootstrap.configure_services()
        
        # Get services
        self.session_service = bootstrap.get_session_service()
        self.timer_service = bootstrap.get_timer_service()
        self.group_config_service = bootstrap.get_group_config_service()
        self.message_service = bootstrap.get_message_service()
        self.file_parser_service = bootstrap.get_file_parser_service()
        
        # Register handlers
        self._register_handlers()
    
    def _register_handlers(self):
        """Register message handlers"""
        
        @self.dp.message()
        async def handle_message(message: types.Message):
            """Handle incoming messages"""
            try:
                chat_id = message.chat.id
                topic_id = message.message_thread_id or 0
                
                # Check if user is admin
                if not self.group_config_service.is_admin(chat_id, topic_id, message.from_user):
                    await self.message_service.send_message(
                        message.answer,
                        "❌ У вас нет прав для использования бота"
                    )
                    return
                
                # Handle different message types
                if message.text:
                    await self._handle_text_message(message, chat_id, topic_id)
                elif message.document:
                    await self._handle_document_message(message, chat_id, topic_id)
                    
            except AuthorizationError as e:
                await self.message_service.send_message(
                    message.answer,
                    f"❌ Ошибка авторизации: {e.message}"
                )
            except ValidationError as e:
                await self.message_service.send_message(
                    message.answer,
                    f"❌ Ошибка валидации: {e.message}"
                )
            except Exception as e:
                logger.error(f"Error handling message: {e}")
                await self.message_service.send_message(
                    message.answer,
                    "❌ Произошла ошибка при обработке сообщения"
                )
    
    async def _handle_text_message(self, message: types.Message, chat_id: int, topic_id: int):
        """Handle text messages"""
        text = message.text.strip()
        
        if text.startswith('/start'):
            await self._handle_start_command(message, chat_id, topic_id)
        elif text.startswith('/vote'):
            await self._handle_vote_command(message, chat_id, topic_id)
        elif text.startswith('/tasks'):
            await self._handle_tasks_command(message, chat_id, topic_id)
        else:
            # Try to parse as task list
            await self._handle_task_list(message, chat_id, topic_id)
    
    async def _handle_document_message(self, message: types.Message, chat_id: int, topic_id: int):
        """Handle document messages"""
        if not message.document.file_name.endswith(('.xlsx', '.xls')):
            await self.message_service.send_message(
                message.answer,
                "❌ Поддерживаются только .xlsx и .xls файлы"
            )
            return
        
        try:
            # Download file
            file = await self.bot.get_file(message.document.file_id)
            file_path = f"temp_{message.document.file_id}.xlsx"
            await self.bot.download_file(file.file_path, file_path)
            
            # Parse file
            tasks = self.file_parser_service.parse_xlsx(file_path)
            
            if not tasks:
                await self.message_service.send_message(
                    message.answer,
                    "❌ Не удалось извлечь задачи из файла"
                )
                return
            
            # Start voting session
            success = self.session_service.start_voting_session(chat_id, topic_id, tasks)
            
            if success:
                await self.message_service.send_message(
                    message.answer,
                    f"✅ Начато голосование по {len(tasks)} задачам"
                )
                await self._start_voting_round(chat_id, topic_id, message)
            else:
                await self.message_service.send_message(
                    message.answer,
                    "❌ Не удалось начать голосование"
                )
            
            # Clean up
            import os
            os.unlink(file_path)
            
        except Exception as e:
            logger.error(f"Error handling document: {e}")
            await self.message_service.send_message(
                message.answer,
                "❌ Ошибка при обработке файла"
            )
    
    async def _handle_start_command(self, message: types.Message, chat_id: int, topic_id: int):
        """Handle start command"""
        # Add participant
        success = self.session_service.add_participant(chat_id, topic_id, message.from_user)
        
        if success:
            await self.message_service.send_message(
                message.answer,
                "✅ Вы добавлены в сессию голосования"
            )
        else:
            await self.message_service.send_message(
                message.answer,
                "❌ Не удалось добавить вас в сессию"
            )
    
    async def _handle_vote_command(self, message: types.Message, chat_id: int, topic_id: int):
        """Handle vote command"""
        parts = message.text.split()
        if len(parts) != 2:
            await self.message_service.send_message(
                message.answer,
                "❌ Использование: /vote <значение>"
            )
            return
        
        vote_value = parts[1]
        success = self.session_service.add_vote(chat_id, topic_id, message.from_user.id, vote_value)
        
        if success:
            await self.message_service.send_message(
                message.answer,
                f"✅ Ваш голос: {vote_value}"
            )
            
            # Check if all voted
            if self.session_service.is_all_voted(chat_id, topic_id):
                await self._finish_voting_round(chat_id, topic_id, message)
        else:
            await self.message_service.send_message(
                message.answer,
                "❌ Не удалось зарегистрировать голос"
            )
    
    async def _handle_tasks_command(self, message: types.Message, chat_id: int, topic_id: int):
        """Handle tasks command"""
        session = self.session_service.get_session(chat_id, topic_id)
        
        if not session.tasks:
            await self.message_service.send_message(
                message.answer,
                "📝 Задач пока нет"
            )
            return
        
        tasks_text = "📝 **Список задач:**\n\n"
        for i, task in enumerate(session.tasks, 1):
            status = "✅" if task.is_completed() else "⏳"
            tasks_text += f"{i}. {status} {task.text.value}\n"
        
        await self.message_service.send_message(
            message.answer,
            tasks_text,
            parse_mode="Markdown"
        )
    
    async def _handle_task_list(self, message: types.Message, chat_id: int, topic_id: int):
        """Handle task list"""
        try:
            tasks = self.file_parser_service.parse_text(message.text)
            
            if not tasks:
                await self.message_service.send_message(
                    message.answer,
                    "❌ Не удалось распознать список задач"
                )
                return
            
            # Start voting session
            success = self.session_service.start_voting_session(chat_id, topic_id, tasks)
            
            if success:
                await self.message_service.send_message(
                    message.answer,
                    f"✅ Начато голосование по {len(tasks)} задачам"
                )
                await self._start_voting_round(chat_id, topic_id, message)
            else:
                await self.message_service.send_message(
                    message.answer,
                    "❌ Не удалось начать голосование"
                )
                
        except ValidationError as e:
            await self.message_service.send_message(
                message.answer,
                f"❌ Ошибка в списке задач: {e.message}"
            )
    
    async def _start_voting_round(self, chat_id: int, topic_id: int, message: types.Message):
        """Start voting round"""
        session = self.session_service.get_session(chat_id, topic_id)
        current_task = session.current_task
        
        if not current_task:
            await self.message_service.send_message(
                message.answer,
                "❌ Нет активных задач"
            )
            return
        
        # Create voting message
        voting_text = f"🗳️ **ГОЛОСОВАНИЕ** ({session.current_task_index + 1}/{len(session.tasks)})\n\n"
        voting_text += f"📝 **Задача:** {current_task.text.value}\n\n"
        voting_text += f"👥 **Участники:** {len(session.participants)}\n\n"
        voting_text += "Отправьте /vote <значение> для голосования"
        
        # Send voting message
        voting_message = await self.message_service.send_message(
            message.answer,
            voting_text,
            parse_mode="Markdown"
        )
        
        if voting_message:
            # Start timer
            self.timer_service.start_vote_timer(chat_id, topic_id, voting_message)
    
    async def _finish_voting_round(self, chat_id: int, topic_id: int, message: types.Message):
        """Finish voting round"""
        session = self.session_service.get_session(chat_id, topic_id)
        current_task = session.current_task
        
        if not current_task:
            return
        
        # Create results message
        results_text = f"📊 **РЕЗУЛЬТАТЫ ГОЛОСОВАНИЯ**\n\n"
        results_text += f"📝 **Задача:** {current_task.text.value}\n\n"
        
        if current_task.votes:
            results_text += "🗳️ **Голоса:**\n"
            for user_id, vote in current_task.votes.items():
                participant = session.participants.get(user_id)
                name = participant.full_name.value if participant else f"User {user_id.value}"
                results_text += f"• {name}: **{vote.value.value}**\n"
            
            # Calculate result
            max_vote = current_task.get_max_vote()
            if max_vote:
                results_text += f"\n🎯 **Результат:** {max_vote.value}"
        else:
            results_text += "❌ Голосов не было"
        
        # Send results
        await self.message_service.send_message(
            message.answer,
            results_text,
            parse_mode="Markdown"
        )
        
        # Complete task
        self.session_service.complete_current_task(chat_id, topic_id)
        
        # Check if more tasks
        session = self.session_service.get_session(chat_id, topic_id)
        if session.current_task_index < len(session.tasks):
            # Start next task
            await self._start_voting_round(chat_id, topic_id, message)
        else:
            # All tasks completed
            await self.message_service.send_message(
                message.answer,
                "🎉 Все задачи завершены!"
            )
            self.session_service.finish_voting_session(chat_id, topic_id)
    
    async def start(self):
        """Start the bot"""
        logger.info("Starting refactored poker bot...")
        await self.dp.start_polling(self.bot)
    
    async def stop(self):
        """Stop the bot"""
        logger.info("Stopping refactored poker bot...")
        self.timer_service.cleanup()
        await self.bot.session.close()


# Example usage
async def main():
    """Main function"""
    bot_token = "YOUR_BOT_TOKEN"  # Replace with actual token
    
    bot = RefactoredPokerBot(bot_token)
    
    try:
        await bot.start()
    except KeyboardInterrupt:
        logger.info("Bot stopped by user")
    finally:
        await bot.stop()


if __name__ == "__main__":
    asyncio.run(main())
