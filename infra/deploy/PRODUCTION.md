# Production Deploy

Target domain: `planning.shults-sync.com`.

## Architecture

- Cloudflare DNS and proxy in front of the VPS.
- Caddy terminates HTTPS and proxies traffic.
- Docker Compose runs `web`, `voting-service`, `jira-service`, `postgres`, and `redis`.
- Only ports `80` and `443` are public. Postgres, Redis, and internal services stay inside the Docker network.

## Cloudflare

Create an `A` record:

- Name: `planning`
- Content: VPS IPv4
- Proxy status: start with `DNS only` for first deploy/debug, then switch to `Proxied`
- SSL/TLS mode: `Full (strict)`
- Network: WebSockets `On`

## First Deploy

Install Docker Engine and Compose plugin using Docker's official apt repository.

Clone the repo:

```bash
mkdir -p /opt/planning-poker
cd /opt/planning-poker
git clone <repo-url> .
```

Create the env file:

```bash
cp infra/deploy/prod.env.example .env
nano .env
```

Build and start infrastructure plus web/API first:

```bash
docker compose -f docker-compose.prod.yml --env-file .env build
docker compose -f docker-compose.prod.yml --env-file .env up -d postgres redis jira-service voting-service web caddy
```

Check:

```bash
docker compose -f docker-compose.prod.yml --env-file .env ps
curl -fsS https://planning.shults-sync.com/health/
```

Open:

- `https://planning.shults-sync.com/cms`
- login with `CMS_USERNAME` / `CMS_PASSWORD`

## Update

```bash
cd /opt/planning-poker
./infra/deploy/deploy-web-prod.sh
# or:
make deploy-web-prod
```

This script performs the exact web rollout sequence:

1. `git pull --ff-only origin main`
2. `docker compose ... build web`
3. `docker compose ... up -d web`
4. `docker compose ... ps web`

## Auto Deploy on push to main

The repo includes workflow `.github/workflows/deploy-prod-web.yml`.
On every push to `main`, GitHub Actions connects to the server over SSH
and runs:

```bash
cd /opt/planning-poker
./infra/deploy/deploy-web-prod.sh
```

### One-time setup

1. Generate a dedicated deploy key on your local machine:

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/planning_poker_deploy
```

2. Add public key to server:

```bash
ssh <user>@<server-ip>
mkdir -p ~/.ssh && chmod 700 ~/.ssh
echo "<contents-of-planning_poker_deploy.pub>" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

3. In GitHub repository settings, add secrets:

- `DEPLOY_HOST` — server IP or DNS
- `DEPLOY_USER` — SSH user on server
- `DEPLOY_SSH_KEY` — private key from `~/.ssh/planning_poker_deploy`

4. Push to `main` and verify workflow run in Actions tab.

## Logs

```bash
docker compose -f docker-compose.prod.yml --env-file .env logs -f voting-service
docker compose -f docker-compose.prod.yml --env-file .env logs -f caddy
```

## Jira Import

Production imports tasks through `jira-service`. Fill these values in `.env`:

```bash
JIRA_URL=https://company.atlassian.net
JIRA_USERNAME=jira-service-account@company.com
JIRA_API_TOKEN=<jira-api-token>
STORY_POINTS_FIELD=customfield_10022
JIRA_DEMO_FALLBACK=false
```

Use `JIRA_DEMO_FALLBACK=false` in production so the app never imports local demo tasks when Jira is misconfigured or the JQL is empty.

Import flow:

1. Manager enters JQL in Cockpit or CMS session tasks.
2. `voting-service` calls `jira-service` at `/api/v1/parse`.
3. `jira-service` queries Jira REST API with the configured `JIRA_URL`, `JIRA_USERNAME`, and `JIRA_API_TOKEN`.
4. Jira issues are normalized to `key`, `summary`, `url`, and `story_points`.
5. Selected issues are appended to the session task queue with `source="jira"`.

Verify the service configuration without exposing secrets:

```bash
docker compose -f docker-compose.prod.yml --env-file .env exec jira-service curl -fsS http://localhost:8001/health/ready
```

Expected production shape:

```json
{"status":"ready","jira_configured":true,"demo_fallback_enabled":false,"story_points_field":"customfield_10022"}
```

## AI Summary (Anthropic)

Add to `.env`:

```bash
ANTHROPIC_API_KEY=<anthropic-api-key>
ANTHROPIC_MODEL=claude-haiku-4-5-20251001
ANTHROPIC_TIMEOUT_SECONDS=20
ANTHROPIC_MAX_CONTEXT_CHARS=6000
```

Restart `voting-service` after changing LLM env vars. Without `ANTHROPIC_API_KEY`, the manager **Generate AI summary** button returns an error and does not save a summary.

Verify Jira context for one issue key:

```bash
docker compose -f docker-compose.prod.yml --env-file .env exec jira-service \
  curl -fsS http://localhost:8001/api/v1/issue/YOUR-123/context
```

Then test the real search path with a small JQL before using the CMS import UI:

```bash
docker compose -f docker-compose.prod.yml --env-file .env exec jira-service \
  curl -fsS -H "Content-Type: application/json" \
  -d '{"jql":"project = YOURPROJECT ORDER BY priority DESC","max_results":5}' \
  http://localhost:8001/api/v1/parse
```

## Backups

Add scheduled Postgres backups after the first production verification.
