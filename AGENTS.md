# AGENTS.md

## Cursor Cloud specific instructions

### Services overview

| Service | Port | Purpose |
|---------|------|---------|
| postgres (Docker) | 5432 | CMS read model, RBAC, session persistence |
| redis (Docker) | 6379 | Live voting state, WebSocket pub/sub, web tokens |
| voting-service (Docker) | 8002 | Core FastAPI backend — sessions, voting, CMS, RBAC |
| web (Docker) | 3001 | Nginx-served production build of the React frontend |
| Vite dev server (local) | 5173 | React frontend dev mode with HMR and API proxy to :8002 |

### Running services

Start required Docker services:
```bash
sudo docker compose up -d postgres redis voting-service web
```

For frontend development with HMR, run the Vite dev server (proxies `/api` and `/ws` to voting-service):
```bash
cd frontend/web && npm run dev
```

### CMS login

The voting-service bootstraps a superadmin from `CMS_USERNAME` / `CMS_PASSWORD` env vars.
Create a `.env` file at the repo root with at least:
```
CMS_USERNAME=admin
CMS_PASSWORD=admin123
ENABLE_DEMO_SESSION=true
```
Then restart voting-service. CMS is at `/cms` (both `:3001` and `:5173`).

### Testing (see README for full commands)

- **Backend:** `PYTHONPATH=backend python3 -m pytest -q -p no:cacheprovider`
- **Frontend unit:** `cd frontend/web && npm run test`
- **Frontend build (lint):** `cd frontend/web && npm run build` (runs `tsc` then Vite)
- **Python compile check:** `PYTHONPATH=backend python3 -m compileall -q backend`
- **E2E:** `cd frontend/web && npx playwright install chromium && npm run test:e2e`

### Non-obvious caveats

- There is no ESLint config; TypeScript compilation (`tsc`) serves as the frontend lint step.
- Docker must be started manually (`sudo dockerd &>/tmp/dockerd.log &`) in Cloud Agent VMs since there is no systemd. Wait ~3s before running docker commands.
- The `.env` file is gitignored; credentials must be recreated each session if not persisted.
- The Jira service is optional and requires `JIRA_URL`, `JIRA_USERNAME`, `JIRA_API_TOKEN` env vars.
- `pytest-asyncio` version pinned to `>=0.23` uses auto mode; no `@pytest.mark.asyncio` needed on most tests.
