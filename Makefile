.PHONY: help install install-dev format lint test run clean docker-build docker-run

# Default target
help:
	@echo "Available commands:"
	@echo "  install      Install production dependencies"
	@echo "  install-dev  Install development dependencies"
	@echo "  format       Format code with black and isort"
	@echo "  lint         Run linting checks"
	@echo "  test         Run tests"
	@echo "  run          Run the bot"
	@echo "  clean        Clean up temporary files"
	@echo "  docker-build Build Docker image"
	@echo "  docker-run   Run Docker container"

# Installation
install:
	pip install -r requirements.txt

install-dev:
	pip install -r requirements.txt
	pip install -r requirements-dev.txt
	pre-commit install

# Code formatting
format:
	black .
	isort .

# Linting
lint:
	flake8 . --count --select=E9,F63,F7,F82 --show-source --statistics
	flake8 . --count --exit-zero --max-complexity=10 --max-line-length=127 --statistics
	mypy . --ignore-missing-imports
	black --check .
	isort --check-only .

# Testing
test:
	pytest --cov=. --cov-report=xml --cov-report=html

# Running
run:
	python bot.py

# Cleaning
clean:
	find . -type f -name "*.pyc" -delete
	find . -type d -name "__pycache__" -delete
	find . -type d -name "*.egg-info" -exec rm -rf {} +
	rm -rf .pytest_cache
	rm -rf .coverage
	rm -rf htmlcov
	rm -rf dist
	rm -rf build

# Docker
docker-build:
	docker build -t planning-poker-bot .

docker-run:
	docker run --rm -v $(PWD)/data:/app/data -v $(PWD)/.env:/app/.env planning-poker-bot

# Development
dev-setup: install-dev
	@echo "Development environment setup complete!"
	@echo "Run 'make format' to format code"
	@echo "Run 'make lint' to check code quality"
	@echo "Run 'make test' to run tests"
	@echo "Run 'make run' to start the bot"
