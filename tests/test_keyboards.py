"""Tests for keyboard menus."""

import pytest

from app.keyboards.menus import get_main_menu
from app.domain.participant import Participant
from app.domain.session import Session
from app.domain.task import Task
from config import UserRole


class TestMenus:
    """Tests for menu keyboards."""

    def test_get_main_menu_no_session(self):
        """Test main menu without session."""
        menu = get_main_menu()
        assert menu is not None
        # Должны быть базовые кнопки
        buttons = [btn.text for row in menu.inline_keyboard for btn in row]
        assert "📝 Загрузить задачи из Jira" in buttons
        assert "📋 Итоги дня" in buttons
        assert "🗑️ Сбросить очередь" not in buttons  # Нет задач и can_manage=False

    def test_get_main_menu_with_tasks_no_manage(self):
        """Test main menu with tasks but user cannot manage."""
        session = Session(chat_id=123, topic_id=456)
        task = Task(summary="Test")
        session.tasks_queue.append(task)

        menu = get_main_menu(session, can_manage=False)
        buttons = [btn.text for row in menu.inline_keyboard for btn in row]

        # Кнопка "Сбросить очередь" не должна быть для обычных пользователей
        assert "🗑️ Сбросить очередь" not in buttons
        # Кнопка "Начать" должна быть (если нет активного голосования)
        assert "▶️ Начать" in buttons

    def test_get_main_menu_with_tasks_can_manage(self):
        """Test main menu with tasks and user can manage."""
        session = Session(chat_id=123, topic_id=456)
        task = Task(summary="Test")
        session.tasks_queue.append(task)

        menu = get_main_menu(session, can_manage=True)
        buttons = [btn.text for row in menu.inline_keyboard for btn in row]

        # Кнопка "Сбросить очередь" должна быть для лидов/админов
        assert "🗑️ Сбросить очередь" in buttons
        # Кнопка "Начать" должна быть
        assert "▶️ Начать" in buttons

    def test_get_main_menu_no_tasks_can_manage(self):
        """Test main menu without tasks but user can manage."""
        session = Session(chat_id=123, topic_id=456)
        # Нет задач в очереди

        menu = get_main_menu(session, can_manage=True)
        buttons = [btn.text for row in menu.inline_keyboard for btn in row]

        # Кнопка "Сбросить очередь" не должна быть, если нет задач
        assert "🗑️ Сбросить очередь" not in buttons
        # Кнопка "Начать" не должна быть, если нет задач
        assert "▶️ Начать" not in buttons

    def test_get_main_menu_active_voting(self):
        """Test main menu when voting is active."""
        session = Session(chat_id=123, topic_id=456)
        task = Task(summary="Test")
        session.tasks_queue.append(task)
        session.current_batch_started_at = "2024-01-01T00:00:00"  # Голосование активно

        menu = get_main_menu(session, can_manage=True)
        buttons = [btn.text for row in menu.inline_keyboard for btn in row]

        # Кнопка "Начать" не должна быть при активном голосовании
        assert "▶️ Начать" not in buttons
        # Кнопка "Сбросить очередь" должна быть (можно сбросить даже во время голосования)
        assert "🗑️ Сбросить очередь" in buttons
