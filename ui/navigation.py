"""
Navigation components for better UX
"""
from typing import List, Dict, Any, Optional
from aiogram import types
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton


class NavigationManager:
    """Manager for navigation breadcrumbs and progress tracking"""
    
    def __init__(self):
        self.breadcrumbs: Dict[str, List[str]] = {}
        self.progress: Dict[str, Dict[str, Any]] = {}
    
    def add_breadcrumb(self, user_id: int, chat_id: int, topic_id: int, page: str) -> None:
        """Add breadcrumb to navigation history"""
        key = f"{user_id}_{chat_id}_{topic_id}"
        if key not in self.breadcrumbs:
            self.breadcrumbs[key] = []
        
        # Don't add duplicate consecutive breadcrumbs
        if not self.breadcrumbs[key] or self.breadcrumbs[key][-1] != page:
            self.breadcrumbs[key].append(page)
            
            # Limit breadcrumbs to 5 levels
            if len(self.breadcrumbs[key]) > 5:
                self.breadcrumbs[key] = self.breadcrumbs[key][-5:]
    
    def get_breadcrumbs(self, user_id: int, chat_id: int, topic_id: int) -> List[str]:
        """Get breadcrumbs for user"""
        key = f"{user_id}_{chat_id}_{topic_id}"
        return self.breadcrumbs.get(key, [])
    
    def go_back(self, user_id: int, chat_id: int, topic_id: int) -> Optional[str]:
        """Go back in navigation history"""
        key = f"{user_id}_{chat_id}_{topic_id}"
        if key in self.breadcrumbs and len(self.breadcrumbs[key]) > 1:
            self.breadcrumbs[key].pop()  # Remove current page
            return self.breadcrumbs[key][-1]  # Return previous page
        return None
    
    def set_progress(self, user_id: int, chat_id: int, topic_id: int, 
                    current: int, total: int, context: str = "") -> None:
        """Set progress for user session"""
        key = f"{user_id}_{chat_id}_{topic_id}"
        self.progress[key] = {
            'current': current,
            'total': total,
            'context': context,
            'percentage': int((current / total) * 100) if total > 0 else 0
        }
    
    def get_progress(self, user_id: int, chat_id: int, topic_id: int) -> Optional[Dict[str, Any]]:
        """Get progress for user session"""
        key = f"{user_id}_{chat_id}_{topic_id}"
        return self.progress.get(key)
    
    def clear_navigation(self, user_id: int, chat_id: int, topic_id: int) -> None:
        """Clear navigation history for user"""
        key = f"{user_id}_{chat_id}_{topic_id}"
        if key in self.breadcrumbs:
            del self.breadcrumbs[key]
        if key in self.progress:
            del self.progress[key]


# Global navigation manager
nav_manager = NavigationManager()


def create_breadcrumb_keyboard(user_id: int, chat_id: int, topic_id: int, 
                             current_page: str = "") -> InlineKeyboardMarkup:
    """Create breadcrumb navigation keyboard"""
    breadcrumbs = nav_manager.get_breadcrumbs(user_id, chat_id, topic_id)
    
    if not breadcrumbs:
        return InlineKeyboardMarkup(inline_keyboard=[])
    
    # Add current page if provided
    if current_page and (not breadcrumbs or breadcrumbs[-1] != current_page):
        breadcrumbs.append(current_page)
    
    # Create breadcrumb buttons
    buttons = []
    for i, page in enumerate(breadcrumbs):
        if i == len(breadcrumbs) - 1:
            # Current page - not clickable
            buttons.append([InlineKeyboardButton(
                text=f"📍 {page}",
                callback_data="breadcrumb:current"
            )])
        else:
            # Previous pages - clickable
            buttons.append([InlineKeyboardButton(
                text=f"🔙 {page}",
                callback_data=f"breadcrumb:back:{i}"
            )])
    
    return InlineKeyboardMarkup(inline_keyboard=buttons)


def create_progress_bar(current: int, total: int, context: str = "") -> str:
    """Create visual progress bar"""
    if total <= 0:
        return "📊 Прогресс: 0%"
    
    percentage = int((current / total) * 100)
    filled = int((current / total) * 10)  # 10 blocks max
    empty = 10 - filled
    
    bar = "█" * filled + "░" * empty
    
    return f"📊 **{context}**\n`{bar}` {percentage}% ({current}/{total})"


def create_progress_keyboard(user_id: int, chat_id: int, topic_id: int, 
                           show_back: bool = True) -> InlineKeyboardMarkup:
    """Create progress tracking keyboard"""
    progress = nav_manager.get_progress(user_id, chat_id, topic_id)
    
    buttons = []
    
    if progress:
        progress_text = create_progress_bar(
            progress['current'], 
            progress['total'], 
            progress['context']
        )
        buttons.append([InlineKeyboardButton(
            text=progress_text,
            callback_data="progress:info"
        )])
    
    if show_back:
        buttons.append([InlineKeyboardButton(
            text="🔙 Назад",
            callback_data="navigation:back"
        )])
    
    return InlineKeyboardMarkup(inline_keyboard=buttons)


def create_session_progress_keyboard(session, show_details: bool = True) -> InlineKeyboardMarkup:
    """Create session progress keyboard with detailed info"""
    if not session:
        return InlineKeyboardMarkup(inline_keyboard=[])
    
    buttons = []
    
    # Session info
    total_tasks = len(session.tasks) if hasattr(session, 'tasks') else 0
    completed_tasks = len([t for t in session.history if t.get('status') == 'completed']) if hasattr(session, 'history') else 0
    current_task = session.current_task_index if hasattr(session, 'current_task_index') else 0
    
    # Progress bar
    if total_tasks > 0:
        progress_text = create_progress_bar(current_task, total_tasks, "Задачи")
        buttons.append([InlineKeyboardButton(
            text=progress_text,
            callback_data="progress:session"
        )])
    
    # Voting progress
    if hasattr(session, 'current_task') and session.current_task:
        total_participants = len(session.participants) if hasattr(session, 'participants') else 0
        voted_count = len(session.current_task.votes) if hasattr(session.current_task, 'votes') else 0
        
        if total_participants > 0:
            voting_progress = create_progress_bar(voted_count, total_participants, "Голосование")
            buttons.append([InlineKeyboardButton(
                text=voting_progress,
                callback_data="progress:voting"
            )])
    
    # Navigation
    buttons.append([
        InlineKeyboardButton(text="🏠 Главное", callback_data="menu:main"),
        InlineKeyboardButton(text="📊 Статистика", callback_data="menu:stats")
    ])
    
    return InlineKeyboardMarkup(inline_keyboard=buttons)


def create_enhanced_main_menu(is_admin: bool = False, 
                            user_id: int = 0, chat_id: int = 0, topic_id: int = 0) -> InlineKeyboardMarkup:
    """Create enhanced main menu with navigation"""
    keyboard = [
        [
            InlineKeyboardButton(text="🆕 Список задач", callback_data="menu:new_task"),
            InlineKeyboardButton(text="📋 Итоги дня", callback_data="menu:summary")
        ],
        [
            InlineKeyboardButton(text="👥 Участники", callback_data="menu:show_participants"),
            InlineKeyboardButton(text="📊 Прогресс", callback_data="menu:progress")
        ],
        [
            InlineKeyboardButton(text="🚪 Покинуть", callback_data="menu:leave")
        ]
    ]
    
    # Admin buttons
    if is_admin:
        keyboard.append([
            InlineKeyboardButton(text="🗑️ Удалить участника", callback_data="menu:kick_participant"),
            InlineKeyboardButton(text="🔄 Обновить Story Points", callback_data="admin:update_story_points")
        ])
    
    # Add navigation breadcrumbs if available
    breadcrumbs = nav_manager.get_breadcrumbs(user_id, chat_id, topic_id)
    if breadcrumbs:
        breadcrumb_buttons = []
        for i, page in enumerate(breadcrumbs[-3:]):  # Show last 3 breadcrumbs
            breadcrumb_buttons.append(InlineKeyboardButton(
                text=f"🔙 {page}",
                callback_data=f"breadcrumb:back:{i}"
            ))
        keyboard.append(breadcrumb_buttons)
    
    return InlineKeyboardMarkup(inline_keyboard=keyboard)


def create_context_menu(context: str, options: List[Dict[str, str]]) -> InlineKeyboardMarkup:
    """Create context menu for specific situations"""
    buttons = []
    
    # Add context header
    buttons.append([InlineKeyboardButton(
        text=f"📍 {context}",
        callback_data="context:info"
    )])
    
    # Add options
    for option in options:
        buttons.append([InlineKeyboardButton(
            text=option['text'],
            callback_data=option['callback']
        )])
    
    # Add navigation
    buttons.append([
        InlineKeyboardButton(text="🔙 Назад", callback_data="navigation:back"),
        InlineKeyboardButton(text="🏠 Главное", callback_data="menu:main")
    ])
    
    return InlineKeyboardMarkup(inline_keyboard=buttons)
