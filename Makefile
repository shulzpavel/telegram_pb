.PHONY: test backend-test frontend-test frontend-e2e frontend-build check install clean

install:
	pip3 install -r backend/requirements.txt

test: backend-test frontend-test

backend-test:
	PYTHONPATH=backend python3 -m pytest -q -p no:cacheprovider

frontend-test:
	cd frontend/web && npm run test

frontend-e2e:
	cd frontend/web && npm run test:e2e

frontend-build:
	cd frontend/web && npm run build

check: backend-test frontend-test frontend-build
	PYTHONPATH=backend python3 -m compileall -q backend
	docker compose config >/tmp/planning-poker-compose.yml
	docker compose -f docker-compose.prod.yml --env-file infra/deploy/prod.env.example config >/tmp/planning-poker-prod-compose.yml

clean:
	find . -type d -name __pycache__ -exec rm -r {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete
	find . -type f -name "*.pyo" -delete
	find . -type f -name ".pytest_cache" -delete
	rm -rf .coverage htmlcov/ .pytest_cache/
