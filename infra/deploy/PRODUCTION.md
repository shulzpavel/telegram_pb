# Production Deploy

Target domain: `planning.shults-sync.com`.

## Architecture

- Cloudflare DNS and proxy in front of the VPS.
- Caddy terminates HTTPS and proxies traffic.
- Docker Compose runs `web`, `voting-service`, `jira-service`, `gateway`, `postgres`, and `redis`.
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
mkdir -p /opt/telegram-pb
cd /opt/telegram-pb
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

Start Telegram polling only after web/API/CMS are healthy:

```bash
docker compose -f docker-compose.prod.yml --env-file .env up -d gateway
```

## Update

```bash
cd /opt/telegram-pb
git pull
docker compose -f docker-compose.prod.yml --env-file .env build
docker compose -f docker-compose.prod.yml --env-file .env up -d
docker compose -f docker-compose.prod.yml --env-file .env ps
```

## Logs

```bash
docker compose -f docker-compose.prod.yml --env-file .env logs -f voting-service
docker compose -f docker-compose.prod.yml --env-file .env logs -f gateway
docker compose -f docker-compose.prod.yml --env-file .env logs -f caddy
```

## Backups

Add scheduled Postgres backups after the first production verification.
