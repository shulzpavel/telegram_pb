.PHONY: test install run clean

install:
	pip3 install -r requirements.txt

test:
	python3 -m pytest tests/ -v --cov=app --cov-report=term-missing

run:
	python3 run.py

clean:
	find . -type d -name __pycache__ -exec rm -r {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete
	find . -type f -name "*.pyo" -delete
	find . -type f -name ".pytest_cache" -delete
	rm -rf .coverage htmlcov/ .pytest_cache/

