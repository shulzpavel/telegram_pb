.PHONY: help install install-dev test test-cov lint format clean run docker-build docker-run

help: ## Show this help message
	@echo "Planning Poker Bot - Development Commands"
	@echo "=========================================="
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

install: ## Install production dependencies
	pip install -r requirements.txt

install-dev: ## Install development dependencies
	pip install -r requirements-dev.txt
	pre-commit install

test: ## Run tests
	python -m pytest tests/ -v

test-cov: ## Run tests with coverage
	python -m pytest tests/ --cov=. --cov-report=html --cov-report=term-missing

lint: ## Run linting
	flake8 .
	mypy .
	black --check .
	isort --check-only .

format: ## Format code
	black .
	isort .
	pre-commit run --all-files

clean: ## Clean up temporary files
	find . -type f -name "*.pyc" -delete
	find . -type d -name "__pycache__" -delete
	find . -type d -name "*.egg-info" -exec rm -rf {} +
	rm -rf build/
	rm -rf dist/
	rm -rf htmlcov/
	rm -rf .coverage
	rm -rf .pytest_cache/
	rm -rf .mypy_cache/

run: ## Run the bot
	python bot.py

docker-build: ## Build Docker image
	docker build -t planning-poker-bot .

docker-run: ## Run with Docker Compose
	docker-compose up -d

docker-logs: ## View Docker logs
	docker-compose logs -f

docker-stop: ## Stop Docker containers
	docker-compose down

setup: install-dev ## Setup development environment
	@echo "Setting up development environment..."
	@echo "✅ Dependencies installed"
	@echo "✅ Pre-commit hooks installed"
	@echo "✅ Ready for development!"

check: lint test ## Run all checks (lint + test)

ci: ## Run CI pipeline
	@echo "Running CI pipeline..."
	make format
	make lint
	make test-cov
	@echo "✅ CI pipeline completed successfully!"
