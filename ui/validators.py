"""
UI validation utilities
"""
import re
from typing import List, Optional


def validate_vote_value(value: str, scale: List[str]) -> bool:
    """Проверить валидность голоса"""
    if not value or not value.strip():
        return False
    
    # Проверяем, есть ли значение в шкале
    if value in scale:
        return True
    
    # Проверяем специальные значения
    special_values = ['?', '∞', 'coffee', 'break']
    if value.lower() in special_values:
        return True
    
    # Проверяем числовые значения
    try:
        float(value)
        return True
    except ValueError:
        return False


def validate_task_text(text: str) -> bool:
    """Проверить валидность текста задачи"""
    if not text or not text.strip():
        return False
    
    # Минимальная длина
    if len(text.strip()) < 3:
        return False
    
    # Максимальная длина
    if len(text) > 1000:
        return False
    
    return True


def validate_username(username: str) -> bool:
    """Проверить валидность имени пользователя"""
    if not username or not username.strip():
        return False
    
    # Убираем @ если есть
    clean_username = username.lstrip('@')
    
    # Проверяем формат
    if not re.match(r'^[a-zA-Z0-9_]+$', clean_username):
        return False
    
    # Проверяем длину
    if len(clean_username) < 1 or len(clean_username) > 32:
        return False
    
    return True


def validate_token(token: str) -> bool:
    """Проверить валидность токена"""
    if not token or not token.strip():
        return False
    
    # Проверяем длину
    if len(token) < 8 or len(token) > 50:
        return False
    
    # Проверяем символы
    if not re.match(r'^[a-zA-Z0-9_-]+$', token):
        return False
    
    return True


def validate_scale(scale: List[str]) -> bool:
    """Проверить валидность шкалы голосования"""
    if not scale or len(scale) < 2:
        return False
    
    # Проверяем, что все значения валидны
    for value in scale:
        if not validate_vote_value(value, scale):
            return False
    
    return True


def validate_timeout(timeout: int) -> bool:
    """Проверить валидность таймаута"""
    return 10 <= timeout <= 3600  # От 10 секунд до 1 часа


def validate_chat_id(chat_id: int) -> bool:
    """Проверить валидность ID чата"""
    return chat_id < 0  # Группы имеют отрицательные ID


def validate_topic_id(topic_id: int) -> bool:
    """Проверить валидность ID топика"""
    return topic_id >= 0  # Топики имеют неотрицательные ID


def validate_user_id(user_id: int) -> bool:
    """Проверить валидность ID пользователя"""
    return user_id > 0  # Пользователи имеют положительные ID
