"""
Text formatting utilities
"""
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from domain.entities import DomainSession as Session, DomainParticipant as Participant


def format_time_mmss(seconds: int) -> str:
    """Форматировать время в MM:SS"""
    seconds = max(0, int(seconds))
    m, s = divmod(seconds, 60)
    return f"{m:02d}:{s:02d}"


def format_participants_list(session: Session) -> str:
    """Форматировать список участников"""
    if not session.participants:
        return "👥 Участников нет"
    
    lines = []
    for participant in session.participants.values():
        role_emoji = {
            'participant': '👤',
            'lead': '👑',
            'admin': '⚙️',
            'super_admin': '🔧'
        }.get(participant.role.value, '👤')
        
        lines.append(f"{role_emoji} {participant.full_name.value}")
    
    return "\n".join(lines)


def format_task_with_progress(session: Session) -> str:
    """Форматировать задачу с прогрессом"""
    if not session.current_task:
        return "❌ Нет активной задачи"
    
    task = session.current_task
    total_participants = len(session.participants)
    voted_count = len(task.votes)
    
    progress = f"({voted_count}/{total_participants})"
    
    return f"📋 **Задача {task.index + 1}:** {task.text.value}\n\n📊 Прогресс: {progress}"


def format_voting_status(session: Session) -> str:
    """Форматировать статус голосования"""
    if not session.current_task:
        return "❌ Нет активной задачи"
    
    task = session.current_task
    total_participants = len(session.participants)
    voted_count = len(task.votes)
    
    if voted_count == total_participants:
        return "✅ Все проголосовали!"
    else:
        remaining = total_participants - voted_count
        return f"⏳ Осталось проголосовать: {remaining}"


def format_participant_stats(session: Session) -> str:
    """Форматировать статистику участников"""
    if not session.current_task or not session.current_task.votes:
        return "📊 Статистика недоступна"
    
    lines = []
    for participant in session.participants.values():
        if participant.user_id in session.current_task.votes:
            vote = session.current_task.votes[participant.user_id]
            lines.append(f"👤 {participant.full_name.value}: {vote.value.value}")
    
    return "\n".join(lines)


def format_average_estimates(session: Session) -> str:
    """Форматировать средние оценки"""
    if not session.current_task or not session.current_task.votes:
        return "📊 Оценки недоступны"
    
    votes = []
    for vote in session.current_task.votes.values():
        try:
            votes.append(float(vote.value.value))
        except ValueError:
            continue
    
    if not votes:
        return "📊 Оценки недоступны"
    
    avg = sum(votes) / len(votes)
    return f"📈 Средняя оценка: {avg:.1f} SP"


def calculate_task_estimate(session: Session) -> Optional[str]:
    """Вычислить оценку задачи (исключая голоса админов)"""
    if not session.current_task or not session.current_task.votes:
        return None
    
    votes = []
    for vote in session.current_task.votes.values():
        try:
            # Исключаем голоса админов из итогового подсчета
            if hasattr(vote, 'user_id') and vote.user_id in session.participants:
                participant = session.participants[vote.user_id]
                if hasattr(participant, 'role') and participant.role.value in ['admin', 'super_admin']:
                    continue  # Пропускаем голос админа
            
            votes.append(int(vote.value.value))
        except (ValueError, AttributeError):
            continue
    
    if not votes:
        return None
    
    # Простая медиана
    votes.sort()
    n = len(votes)
    if n % 2 == 0:
        median = (votes[n//2 - 1] + votes[n//2]) / 2
    else:
        median = votes[n//2]
    
    return f"📈 Оценка: {median} SP"


def generate_summary_report(session: Session, is_daily: bool = False) -> str:
    """Генерировать отчет по сессии"""
    history = session.history if not is_daily else [
        task for task in session.history 
        if task.completed_at and task.completed_at.date() == datetime.now().date()
    ]
    
    if not history:
        return "📊 Нет завершенных задач"
    
    total_tasks = len(history)
    completed_tasks = len([task for task in history if task.status.value == 'completed'])
    
    # Подсчитываем общие Story Points
    total_sp = 0
    for task in history:
        if task.result and task.result.value != 'pending':
            try:
                total_sp += float(task.result.value)
            except ValueError:
                continue
    
    lines = [
        f"📊 **Отчет {'за день' if is_daily else 'по сессии'}**",
        f"",
        f"📋 Всего задач: {total_tasks}",
        f"✅ Завершено: {completed_tasks}",
        f"📈 Общие SP: {total_sp}",
        f"",
        f"📋 **Детали:**"
    ]
    
    for i, task in enumerate(history, 1):
        status_emoji = "✅" if task.status.value == 'completed' else "⏳"
        result_text = task.result.value if task.result else "Не оценено"
        lines.append(f"{status_emoji} {i}. {task.text.value} - {result_text}")
    
    return "\n".join(lines)
