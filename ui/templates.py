"""
Message templates
"""
from typing import Dict, Any, Optional


def get_help_template() -> str:
    """Шаблон помощи"""
    return """
🤖 **Planning Poker Bot**

📋 **Основные команды:**
• `/join + токен` - присоединиться к сессии
• `/menu` - показать главное меню
• `/start` - показать это меню
• `/my_role` - показать свою роль

🎯 **Функции:**
• 🆕 Создание списка задач
• 📊 Голосование по задачам
• 📈 Подсчет Story Points
• 📋 Отчеты по сессиям
• 📊 Итоги дня

👥 **Роли:**
• 👤 **Participant** - может голосовать
• 👑 **Lead** - может голосовать и управлять
• ⚙️ **Admin** - может управлять, не голосует
• 🔧 **Super Admin** - полные права
"""


def get_error_template(error_type: str, details: Optional[str] = None) -> str:
    """Шаблон ошибки"""
    templates = {
        'permission': "❌ У вас нет прав для выполнения этого действия.",
        'not_found': "❌ Запрашиваемый объект не найден.",
        'validation': f"❌ Ошибка валидации: {details or 'Неверные данные'}",
        'network': "❌ Ошибка сети. Попробуйте позже.",
        'internal': "❌ Внутренняя ошибка сервера.",
        'timeout': "❌ Время ожидания истекло.",
        'rate_limit': "❌ Слишком много запросов. Подождите немного."
    }
    
    return templates.get(error_type, f"❌ Произошла ошибка: {details or 'Неизвестная ошибка'}")


def get_success_template(action: str, details: Optional[str] = None) -> str:
    """Шаблон успешного действия"""
    templates = {
        'join': "✅ Вы успешно присоединились к сессии!",
        'leave': "✅ Вы покинули сессию!",
        'vote': f"✅ Ваш голос засчитан: {details or ''}",
        'task_created': "✅ Задачи созданы успешно!",
        'session_started': "✅ Сессия голосования начата!",
        'session_finished': "✅ Сессия голосования завершена!",
        'role_set': f"✅ Роль установлена: {details or ''}",
        'settings_saved': "✅ Настройки сохранены!"
    }
    
    return templates.get(action, f"✅ Действие выполнено успешно: {details or ''}")


def get_info_template(info_type: str, data: Optional[Dict[str, Any]] = None) -> str:
    """Шаблон информационного сообщения"""
    templates = {
        'session_info': """
📊 **Информация о сессии:**
• Участников: {participants_count}
• Задач: {tasks_count}
• Статус: {status}
        """,
        'participant_info': """
👤 **Информация об участнике:**
• Имя: {full_name}
• Роль: {role}
• Может голосовать: {can_vote}
• Может управлять: {can_manage}
        """,
        'task_info': """
📋 **Информация о задаче:**
• Текст: {text}
• Прогресс: {progress}
• Оценка: {estimate}
        """,
        'stats_info': """
📈 **Статистика:**
• Всего задач: {total_tasks}
• Завершено: {completed_tasks}
• Общие SP: {total_sp}
• Средняя оценка: {avg_estimate}
        """
    }
    
    template = templates.get(info_type, "📊 Информация недоступна")
    
    if data:
        try:
            return template.format(**data)
        except KeyError:
            return template
    
    return template


def get_warning_template(warning_type: str, details: Optional[str] = None) -> str:
    """Шаблон предупреждения"""
    templates = {
        'already_voted': "⚠️ Вы уже проголосовали!",
        'session_not_active': "⚠️ Сессия не активна.",
        'no_participants': "⚠️ Нет участников для голосования.",
        'timeout_warning': f"⚠️ Внимание! Осталось {details or 'мало'} времени.",
        'role_change': "⚠️ Изменение роли требует перезапуска бота.",
        'data_loss': "⚠️ Возможна потеря данных. Сохраните важную информацию."
    }
    
    return templates.get(warning_type, f"⚠️ Предупреждение: {details or 'Обратите внимание'}")


def get_question_template(question_type: str, options: Optional[list] = None) -> str:
    """Шаблон вопроса"""
    templates = {
        'confirm_action': "❓ Вы уверены, что хотите выполнить это действие?",
        'choose_option': "❓ Выберите один из вариантов:",
        'enter_value': "❓ Введите значение:",
        'select_participant': "❓ Выберите участника:",
        'select_task': "❓ Выберите задачу:"
    }
    
    base_template = templates.get(question_type, "❓ Вопрос:")
    
    if options:
        options_text = "\n".join([f"• {option}" for option in options])
        return f"{base_template}\n\n{options_text}"
    
    return base_template
