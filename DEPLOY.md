# Deploy

Current production deployment is Docker Compose based.

Use the production runbook:

- [infra/deploy/PRODUCTION.md](infra/deploy/PRODUCTION.md)
- [infra/deploy/prod.env.example](infra/deploy/prod.env.example)

The old systemd-only deployment path is deprecated for this project because production now includes the web app, Voting Service, Jira Service, Redis, Postgres, Caddy, and CMS RBAC.
