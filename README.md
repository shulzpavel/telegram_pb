# Planning Poker

Planning Poker is a manager-led web estimation tool with Jira integration, browser voting links, and an admin/audit CMS.

## What Is Included

- Manager web cockpit for session creation, invite links, task queue management, voting control, reveal, and final estimates.
- Voting Service API backed by Redis for live state and Postgres for CMS/read models.
- Jira Service API for Jira search and Story Points writes.
- React/Vite web app for `/manage`, participant voting links, and `/cms`.
- CMS with role-based access control for overview, sessions, users, votes, tokens, web participants, audit events, and access management.
- Docker Compose setup for local and production-like runs.

## Repository Layout

```text
backend/
  app/                         # domain, use cases, ports, adapters
  services/
    jira_service/              # Jira FastAPI service
    voting_service/            # Voting, web voting, CMS, RBAC API
  scripts/                     # backend operational scripts
frontend/
  web/                         # React/Vite app
infra/
  caddy/                       # production reverse proxy config
  deploy/                      # production env example and runbook
  grafana/                     # dashboards and provisioning
  k8s/                         # Kubernetes manifests
docs/
  PRODUCT.md                   # product behavior
  TECHNICAL.md                 # current technical architecture
  ROADMAP.md                   # next improvements
tests/                         # backend tests
```

## Local Run

```bash
docker compose up -d postgres redis jira-service voting-service web
```

Open:

- Web app: `http://localhost:3001`
- Manager cockpit: `http://localhost:3001/manage`
- Real demo session: `http://localhost:3001/demo`
- Manager view for real demo: `http://localhost:3001/manage?demo=1`
- CMS: `http://localhost:3001/cms`
- Voting API health: `http://localhost:8002/health/`

For local CMS login, set `CMS_USERNAME` and `CMS_PASSWORD` in `.env`. On startup the Voting Service bootstraps that account as a DB-backed superadmin.

## Development

Backend:

```bash
PYTHONPATH=backend python3 -m pytest -q -p no:cacheprovider
PYTHONPATH=backend python3 -m compileall -q backend
```

Frontend:

```bash
cd frontend/web
npm ci
npm run test
npm run build
npx playwright install chromium
npm run test:e2e
```

Docker config checks:

```bash
docker compose config
docker compose -f docker-compose.prod.yml --env-file infra/deploy/prod.env.example config
```

## Production

Use Docker Compose production deployment:

- Runbook: [infra/deploy/PRODUCTION.md](infra/deploy/PRODUCTION.md)
- Env example: [infra/deploy/prod.env.example](infra/deploy/prod.env.example)

The legacy root `DEPLOY.md` only points to the current production runbook.

## Documentation

- [docs/PRODUCT.md](docs/PRODUCT.md)
- [docs/TECHNICAL.md](docs/TECHNICAL.md)
- [docs/ROADMAP.md](docs/ROADMAP.md)
