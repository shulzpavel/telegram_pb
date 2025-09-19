# Makefile для Planning Poker Bot

.PHONY: help install install-dev test test-unit test-comprehensive test-integration test-stress test-security test-story-points test-all coverage lint format clean run

# Переменные
PYTHON = python3
PIP = pip3
PYTEST = pytest
COVERAGE = coverage

# Цвета для вывода
RED = \033[0;31m
GREEN = \033[0;32m
YELLOW = \033[1;33m
BLUE = \033[0;34m
NC = \033[0m # No Color

help: ## Показать справку
	@echo "$(BLUE)Planning Poker Bot - Доступные команды:$(NC)"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-20s$(NC) %s\n", $$1, $$2}'

install: ## Установить зависимости
	@echo "$(BLUE)Установка зависимостей...$(NC)"
	$(PIP) install -r requirements.txt

install-dev: ## Установить зависимости для разработки
	@echo "$(BLUE)Установка зависимостей для разработки...$(NC)"
	$(PIP) install -r requirements-dev.txt
	$(PIP) install -r requirements.txt

test: ## Запустить все тесты
	@echo "$(BLUE)Запуск всех тестов...$(NC)"
	$(PYTHON) run_comprehensive_tests.py

test-unit: ## Запустить unit тесты
	@echo "$(BLUE)Запуск unit тестов...$(NC)"
	$(PYTEST) tests/test_domain.py tests/test_models.py tests/test_core.py tests/test_positive_scenarios.py -v

test-comprehensive: ## Запустить комплексные тесты
	@echo "$(BLUE)Запуск комплексных тестов...$(NC)"
	$(PYTEST) tests/test_comprehensive_scenarios.py tests/test_edge_cases.py -v

test-integration: ## Запустить интеграционные тесты
	@echo "$(BLUE)Запуск интеграционных тестов...$(NC)"
	$(PYTEST) tests/test_integration_scenarios.py -v

test-stress: ## Запустить стресс-тесты
	@echo "$(BLUE)Запуск стресс-тестов...$(NC)"
	$(PYTEST) tests/test_stress_performance.py -v -s

test-security: ## Запустить тесты безопасности
	@echo "$(BLUE)Запуск тестов безопасности...$(NC)"
	$(PYTEST) tests/test_security.py -v

test-story-points: ## Запустить тесты Story Points интеграции
	@echo "$(BLUE)Запуск тестов Story Points интеграции...$(NC)"
	$(PYTHON) test_story_points_integration.py
	$(PYTHON) test_negative_scenarios.py

test-session-control: ## Запустить тесты управления сессиями
	@echo "$(BLUE)Запуск тестов управления сессиями...$(NC)"
	$(PYTEST) tests/test_session_control.py -v

test-all: ## Запустить все тесты с покрытием
	@echo "$(BLUE)Запуск всех тестов с покрытием кода...$(NC)"
	$(PYTEST) tests/ -v --cov=. --cov-report=term-missing --cov-report=html --cov-report=xml

coverage: ## Показать покрытие кода
	@echo "$(BLUE)Генерация отчета покрытия кода...$(NC)"
	$(PYTEST) tests/ --cov=. --cov-report=html --cov-report=term-missing
	@echo "$(GREEN)Отчет покрытия сохранен в htmlcov/index.html$(NC)"

lint: ## Проверить код линтерами
	@echo "$(BLUE)Проверка кода линтерами...$(NC)"
	flake8 . --count --select=E9,F63,F7,F82 --show-source --statistics
	flake8 . --count --exit-zero --max-complexity=10 --max-line-length=127 --statistics
	mypy . --ignore-missing-imports

format: ## Форматировать код
	@echo "$(BLUE)Форматирование кода...$(NC)"
	black . --line-length 127
	isort . --profile black

format-check: ## Проверить форматирование кода
	@echo "$(BLUE)Проверка форматирования кода...$(NC)"
	black . --check --line-length 127
	isort . --check-only --profile black

clean: ## Очистить временные файлы
	@echo "$(BLUE)Очистка временных файлов...$(NC)"
	find . -type f -name "*.pyc" -delete
	find . -type d -name "__pycache__" -delete
	find . -type d -name "*.egg-info" -exec rm -rf {} +
	rm -rf .pytest_cache/
	rm -rf .coverage
	rm -rf htmlcov/
	rm -rf coverage.xml
	rm -rf .mypy_cache/
	rm -rf .tox/

run: ## Запустить бота
	@echo "$(BLUE)Запуск бота...$(NC)"
	$(PYTHON) bot.py

run-dev: ## Запустить бота в режиме разработки
	@echo "$(BLUE)Запуск бота в режиме разработки...$(NC)"
	PYTHONPATH=. $(PYTHON) bot.py

check-config: ## Проверить конфигурацию
	@echo "$(BLUE)Проверка конфигурации...$(NC)"
	$(PYTHON) scripts/check_config.py

backup: ## Создать резервную копию данных
	@echo "$(BLUE)Создание резервной копии данных...$(NC)"
	$(PYTHON) scripts/backup_data.py

setup: install-dev ## Настройка окружения для разработки
	@echo "$(BLUE)Настройка окружения для разработки...$(NC)"
	@if [ ! -f .env ]; then \
		echo "$(YELLOW)Создание .env файла из env.example...$(NC)"; \
		cp env.example .env; \
		echo "$(YELLOW)Отредактируйте .env файл с вашими настройками$(NC)"; \
	fi
	@echo "$(GREEN)Окружение настроено!$(NC)"

ci: ## Запуск тестов для CI/CD
	@echo "$(BLUE)Запуск тестов для CI/CD...$(NC)"
	$(PYTEST) tests/ -v --cov=. --cov-report=xml --cov-fail-under=80
	flake8 . --count --exit-zero --max-complexity=10 --max-line-length=127 --statistics
	black . --check --line-length 127
	isort . --check-only --profile black

docker-build: ## Собрать Docker образ
	@echo "$(BLUE)Сборка Docker образа...$(NC)"
	docker build -t planning-poker-bot .

docker-run: ## Запустить в Docker
	@echo "$(BLUE)Запуск в Docker...$(NC)"
	docker-compose up -d

docker-stop: ## Остановить Docker контейнер
	@echo "$(BLUE)Остановка Docker контейнера...$(NC)"
	docker-compose down

docker-logs: ## Показать логи Docker контейнера
	@echo "$(BLUE)Логи Docker контейнера:$(NC)"
	docker-compose logs -f

# Быстрые команды для разработки
quick-test: ## Быстрый тест основных компонентов
	@echo "$(BLUE)Быстрый тест основных компонентов...$(NC)"
	$(PYTEST) tests/test_domain.py tests/test_models.py -v

quick-lint: ## Быстрая проверка линтерами
	@echo "$(BLUE)Быстрая проверка линтерами...$(NC)"
	flake8 . --count --select=E9,F63,F7,F82 --show-source --statistics

# Команды для отладки
debug-test: ## Запустить тесты в режиме отладки
	@echo "$(BLUE)Запуск тестов в режиме отладки...$(NC)"
	$(PYTEST) tests/ -v -s --tb=long --pdb

debug-single: ## Отладить один тест (используйте: make debug-single TEST=test_name)
	@echo "$(BLUE)Отладка теста: $(TEST)$(NC)"
	$(PYTEST) tests/ -v -s --tb=long --pdb -k $(TEST)

# Команды для профилирования
profile: ## Профилирование производительности
	@echo "$(BLUE)Профилирование производительности...$(NC)"
	$(PYTEST) tests/test_stress_performance.py -v -s --profile

# Команды для документации
docs: ## Генерация документации
	@echo "$(BLUE)Генерация документации...$(NC)"
	@if command -v sphinx-build >/dev/null 2>&1; then \
		sphinx-build -b html docs/ docs/_build/html; \
		echo "$(GREEN)Документация сгенерирована в docs/_build/html/$(NC)"; \
	else \
		echo "$(YELLOW)sphinx-build не найден. Установите sphinx: pip install sphinx$(NC)"; \
	fi

# Команды для безопасности
security-check: ## Проверка безопасности
	@echo "$(BLUE)Проверка безопасности...$(NC)"
	@if command -v safety >/dev/null 2>&1; then \
		safety check; \
	else \
		echo "$(YELLOW)safety не найден. Установите: pip install safety$(NC)"; \
	fi
	@if command -v bandit >/dev/null 2>&1; then \
		bandit -r . -f json -o bandit-report.json; \
		echo "$(GREEN)Отчет безопасности сохранен в bandit-report.json$(NC)"; \
	else \
		echo "$(YELLOW)bandit не найден. Установите: pip install bandit$(NC)"; \
	fi

# Команды для мониторинга
monitor: ## Мониторинг системы
	@echo "$(BLUE)Мониторинг системы...$(NC)"
	@echo "Использование памяти:"
	@ps aux | grep python | grep -v grep | awk '{sum+=\$$6} END {print sum/1024 " MB"}'
	@echo "Количество процессов Python:"
	@ps aux | grep python | grep -v grep | wc -l

# Команды для развертывания
deploy-check: ## Проверка готовности к развертыванию
	@echo "$(BLUE)Проверка готовности к развертыванию...$(NC)"
	@echo "1. Проверка тестов..."
	@$(MAKE) test-all
	@echo "2. Проверка линтеров..."
	@$(MAKE) lint
	@echo "3. Проверка форматирования..."
	@$(MAKE) format-check
	@echo "4. Проверка безопасности..."
	@$(MAKE) security-check
	@echo "$(GREEN)Все проверки пройдены! Готово к развертыванию.$(NC)"

# Команды для обновления
update-deps: ## Обновить зависимости
	@echo "$(BLUE)Обновление зависимостей...$(NC)"
	$(PIP) install --upgrade pip
	$(PIP) install --upgrade -r requirements.txt
	$(PIP) install --upgrade -r requirements-dev.txt

# Команды для статистики
stats: ## Показать статистику проекта
	@echo "$(BLUE)Статистика проекта:$(NC)"
	@echo "Количество Python файлов:"
	@find . -name "*.py" | wc -l
	@echo "Общее количество строк кода:"
	@find . -name "*.py" -exec wc -l {} + | tail -1
	@echo "Количество тестов:"
	@find . -name "test_*.py" | wc -l
	@echo "Количество тестовых функций:"
	@grep -r "def test_" . --include="*.py" | wc -l

# Команды для очистки и сброса
reset: clean ## Полный сброс проекта
	@echo "$(BLUE)Полный сброс проекта...$(NC)"
	@if [ -f .env ]; then \
		echo "$(YELLOW)Удаление .env файла...$(NC)"; \
		rm .env; \
	fi
	@echo "$(GREEN)Проект сброшен!$(NC)"

# Команды для помощи
help-dev: ## Показать справку для разработчиков
	@echo "$(BLUE)Справка для разработчиков:$(NC)"
	@echo ""
	@echo "$(GREEN)Основные команды:$(NC)"
	@echo "  make setup          - Настройка окружения"
	@echo "  make test           - Запуск всех тестов"
	@echo "  make lint           - Проверка кода"
	@echo "  make format         - Форматирование кода"
	@echo "  make run            - Запуск бота"
	@echo ""
	@echo "$(GREEN)Тестирование:$(NC)"
	@echo "  make test-unit      - Unit тесты"
	@echo "  make test-integration - Интеграционные тесты"
	@echo "  make test-stress    - Стресс-тесты"
	@echo "  make test-security  - Тесты безопасности"
	@echo "  make coverage       - Покрытие кода"
	@echo ""
	@echo "$(GREEN)Отладка:$(NC)"
	@echo "  make debug-test     - Тесты в режиме отладки"
	@echo "  make debug-single TEST=name - Отладка одного теста"
	@echo ""
	@echo "$(GREEN)Развертывание:$(NC)"
	@echo "  make deploy-check   - Проверка готовности"
	@echo "  make docker-build   - Сборка Docker образа"
	@echo "  make docker-run     - Запуск в Docker"

# По умолчанию показываем справку
.DEFAULT_GOAL := help