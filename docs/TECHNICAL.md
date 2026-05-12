# Technical Architecture

## Services

The project is split into backend services, a browser frontend, and infrastructure configuration.

```text
backend/app
  domain, use cases, ports, adapters, Telegram/Lark transports
backend/services/jira_service
  FastAPI service for Jira search and Story Points writes
backend/services/voting_service
  FastAPI service for sessions, manager app, web voting, CMS, RBAC, and read-model sync
frontend/web
  React/Vite app for manager sessions, participant voting, and CMS
infra
  Caddy, Grafana, Kubernetes, deployment files
```

## Runtime Data

- Redis stores live voting/session state and web voting tokens.
- Postgres stores the CMS read model and RBAC data.
- Voting Service syncs live session state into normalized CMS tables through a coalesced background sync.
- CMS list endpoints use cursor pagination and indexed query shapes.
- Task queue and voting mutations always write through atomic live-session repository operations first; the CMS read model is refreshed asynchronously after the commit.
- Manager-created web sessions use live session state as the source of truth; CMS tables remain a read model.

## Reliability And Secrets

- Jira API auth failures are logged without exposing the API token.
- Jira HTTP calls retry transient network errors and `429/5xx` responses with short backoff.
- Bot-to-service HTTP clients retry transient service failures.
- Jira Service cache is TTL-based and capped by `JIRA_CACHE_MAX_ITEMS` to avoid unbounded growth.
- Telegram notifier failures are logged with chat/message context.
- Session JSON serialization is centralized in `SessionFactory`.
- Redis and Postgres session repositories expose async methods directly; sync `NotImplementedError` shims were removed.
- Session creation is service-owned and idempotent: Redis uses `SET NX`, Postgres uses a transaction-scoped advisory lock, and HTTP clients no longer create local fallback sessions after a missing read.
- Session mutations are atomic at the repository boundary: Redis uses optimistic locking with `WATCH`, Postgres uses a transaction-scoped advisory lock, and the file repository uses a process-local async lock for development/test runs.
- CMS read-model sync is scheduled in the background and coalesced per session so user-facing write paths are not blocked by CMS table refreshes.
- CMS text search uses trigram indexes for large session, user, and task tables.

## Task Queue Management

Live tasks have stable domain ids:

- `task_id` is the only safe identifier for edit/delete/move.
- `source` is `jira` or `manual`.
- `created_at` and `updated_at` are stored in the serialized task payload.
- `tasks_version` is stored on the session and incremented on queue/task changes.

The current task is still indexed for fast voting flow compatibility, but queue mutations preserve the current task by `task_id` and then recompute `current_task_index`.

Safety rules:

- The active current task cannot be deleted or moved while voting is running.
- Editing task text/metadata is allowed through the queue API.
- Mutations may pass `expected_version`; stale versions receive `409`.
- Jira imports dedupe by `jira_key`; manual tasks are identified by `task_id`.
- Jira search is paginated up to the configured request limit instead of relying on one 100-row page.

CMS task endpoints:

- `GET /api/v1/cms/sessions/{id}/tasks?bucket=tasks_queue&q=text`
- `POST /api/v1/cms/sessions/{id}/tasks`
- `POST /api/v1/cms/sessions/{id}/tasks/bulk`
- `POST /api/v1/cms/sessions/{id}/tasks/jira-preview`
- `POST /api/v1/cms/sessions/{id}/tasks/jira-import`
- `PATCH /api/v1/cms/sessions/{id}/tasks/{task_id}`
- `DELETE /api/v1/cms/sessions/{id}/tasks/{task_id}`
- `POST /api/v1/cms/sessions/{id}/tasks/{task_id}/move`
- `POST /api/v1/cms/sessions/{id}/tasks/reorder`

Jira preview returns duplicate flags before importing. Jira import accepts optional `selected_keys`; when omitted, all non-duplicate previewed issues are imported.
The CMS preview UI renders every previewed row in a bounded scroll area and shows selected/importable counts so hidden Jira rows cannot be imported accidentally.

## Manager App API

The primary web product uses `/api/v1/app/*` endpoints protected by `app.sessions.manage`.

Core endpoints:

- `POST /api/v1/app/sessions`
- `GET /api/v1/app/sessions/{chat_id}/state`
- `GET /api/v1/app/sessions/{chat_id}/tasks`
- `POST /api/v1/app/sessions/{chat_id}/tasks`
- `POST /api/v1/app/sessions/{chat_id}/tasks/bulk`
- `POST /api/v1/app/sessions/{chat_id}/tasks/jira-preview`
- `POST /api/v1/app/sessions/{chat_id}/tasks/jira-import`
- `PATCH /api/v1/app/sessions/{chat_id}/tasks/{task_id}`
- `DELETE /api/v1/app/sessions/{chat_id}/tasks/{task_id}`
- `POST /api/v1/app/sessions/{chat_id}/tasks/{task_id}/move`
- `POST /api/v1/app/sessions/{chat_id}/start`
- `POST /api/v1/app/sessions/{chat_id}/reveal`
- `POST /api/v1/app/sessions/{chat_id}/next`
- `POST /api/v1/app/sessions/{chat_id}/skip`
- `POST /api/v1/app/sessions/{chat_id}/final-estimate`
- `POST /api/v1/app/sessions/{chat_id}/finish`

Manual reveal is represented by `Session.revealed_task_id`. The browser state moves to `results` either when all eligible voters voted or when the manager explicitly reveals the current task.

Telegram and Lark no longer expose task-skip controls to ordinary voters; server handlers also reject crafted skip/review callbacks from non-managers.

Demo support:

- `POST /api/v1/app/demo-session` creates/reuses a real test session with Jira-like tasks.
- `/demo` redirects to the real participant link returned by that endpoint.
- `/demo?mock=1` keeps the old frontend-only mock for smoke tests.
- `/manage?demo=1` loads the same demo session into the manager cockpit after login.
- `ENABLE_DEMO_SESSION=false` disables the public demo endpoint in production.

## CMS And RBAC

CMS auth is DB-backed:

- `CMS_USERNAME` and `CMS_PASSWORD` bootstrap the initial superadmin.
- Admin accounts are stored in `cms_admin_accounts`.
- Passwords are hashed with PBKDF2-SHA256.
- Roles are stored in `cms_roles`.
- Permissions are stored in `cms_permissions`.
- Page access is stored in `cms_pages`.
- Admin-role and role-permission relations are many-to-many.

CMS user creation is guarded on both UX and API boundaries: the frontend validates username format, password length, role selection, and optional Telegram user id before submitting. FastAPI remains authoritative for request validation and server-side permission checks.

Access management is designed for large admin lists:

- `GET /api/v1/cms/access/admins` uses cursor pagination.
- Admin list filters are `q`, `active`, and `role_id`.
- Admin search is prefix-oriented for indexed lookup on username/display name; numeric queries can match `telegram_user_id`.
- Frontend searches are debounced and stale list responses are ignored.

Backend remains the source of truth. Frontend hides pages based on `/api/v1/cms/auth/me`, but every CMS API endpoint also checks its required permission server-side.

Runtime env:

- `CORS_ORIGINS`: comma-separated browser origins for FastAPI services.
- `JIRA_SERVICE_CORS_ORIGINS`: optional override for Jira Service CORS origins.
- `CMS_COOKIE_SECURE`: controls the `Secure` flag on CMS auth and CSRF cookies. Default is `true`; local Docker Compose overrides it to `false` for `http://localhost`.
- `JIRA_CACHE_MAX_ITEMS`: max in-memory Jira cache entries, default `1000`.
- `JIRA_UPDATE_CONCURRENCY`: concurrent Jira Story Points writes in skip-errors mode, default `5`.
- `JIRA_SERVICE_TIMEOUT_SECONDS`: CMS Jira preview/import HTTP timeout, default `30`.
- `ENABLE_DEMO_SESSION`: enables public real-demo session endpoint, default `true` for local compose and `false` in production compose.

CMS and manager write APIs use cookie auth plus double-submit CSRF protection. Login issues an `httponly` auth cookie and a readable `cms_csrf` cookie; unsafe CMS/manager requests must send the same value in `X-CSRF-Token`.

CMS permissions:

- `cms.overview.view`
- `cms.sessions.view`
- `cms.users.view`
- `cms.votes.view`
- `cms.tokens.view`
- `cms.web.view`
- `cms.events.view`
- `cms.access.view`
- `cms.access.manage`
- `cms.tasks.manage`
- `app.sessions.manage`

## Frontend Structure

Frontend uses a feature-first layout:

```text
frontend/web/src/
  app/                         # runtime config
  design-system/               # tokens, primitives, motion helpers
  shared/                      # generic API/types/lib utilities
  components/                  # participant voting UI
  hooks/                       # participant voting hooks
  pages/                       # top-level route pages
  features/cms/
    access/
    api/
    auth/
    components/
    events/
    hooks/
    layout/
    navigation.ts
    overview/
    sessions/                   # session detail and task queue editor
    tokens/
    users/
    votes/
    webParticipants/
  features/manager/              # manager cockpit and app API client
```

Primary routes:

- `/manage`: manager cockpit for creating and facilitating sessions.
- `/s/:token`: participant voting link.
- `/cms`: secondary admin/audit CMS.

CMS routes are nested under `/cms`:

- `/cms`
- `/cms/sessions`
- `/cms/users`
- `/cms/votes`
- `/cms/tokens`
- `/cms/web`
- `/cms/events`
- `/cms/access`

CMS route components are lazy-loaded to keep the participant voting path lighter.

The CMS task queue editor uses `@tanstack/react-virtual` for large lists and `@dnd-kit` for drag handles. Full drag reorder is sent through `/tasks/reorder` only when the complete unfiltered queue is loaded; otherwise the UI falls back to a bounded move operation so huge filtered lists do not require rendering everything.

## Frontend Design System

The frontend now has a small code-first design system in `frontend/web/src/design-system`.

- `components.tsx`: `Button`, `Surface`, `TextField`, `TextareaField`, `SelectField`, `CheckboxField`, `Badge`, `Alert`, `EmptyState`, `Skeleton`, `Spinner`, `ProgressBar`, `ConfirmDialog`.
- `motion.ts`: shared durations and capped stagger helpers for large result/list rendering.
- `utils.ts`: class name composition helper.

Design rules:

- Cards and controls use 8px radius by default.
- Focus states are visible and tokenized through global CSS.
- `prefers-reduced-motion` disables nonessential animation globally.
- Participant voting screens keep stable content zones to avoid layout jumps between vote, waiting, and results states.
- CMS tables/lists use shared loading/error/footer primitives, optional mobile card rendering, and avoid native `window.confirm`.

## Testing

Backend:

```bash
PYTHONPATH=backend python3 -m compileall -q backend
PYTHONPATH=backend python3 -m pytest -q -p no:cacheprovider
```

Frontend:

```bash
cd frontend/web
npm run test
npm run build
npm run test:e2e
```

Current frontend unit tests cover CMS navigation/RBAC tab filtering, query serialization, access validation, and task bulk-input parsing.
Frontend smoke E2E tests run with Playwright against the production preview build on desktop Chromium and a Pixel 5 mobile viewport.

CI:

- GitHub Actions runs backend tests, backend compile checks, frontend unit tests, frontend build, Playwright smoke tests, and Docker Compose config validation on every pull request.

## Deployment

Production uses Docker Compose and Caddy:

- `docker-compose.prod.yml`
- `infra/caddy/Caddyfile`
- `infra/deploy/prod.env.example`
- `infra/deploy/PRODUCTION.md`

Only Caddy exposes public HTTP/HTTPS. Postgres, Redis, and internal FastAPI services stay inside the Docker network.

## Observability

Grafana provisioning lives under `infra/grafana`.

- Dashboards: `infra/grafana/dashboards`
- Datasource provisioning: `infra/grafana/provisioning`
- API import dashboard payload: `infra/grafana/import`
