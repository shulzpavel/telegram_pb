# Technical Architecture

## Services

The project is split into backend services, a browser frontend, and infrastructure configuration.

```text
backend/app
  domain, use cases, ports, adapters
backend/services/jira_service
  FastAPI service for Jira search and Story Points writes
backend/services/voting_service
  FastAPI service for sessions, manager app, web voting, CMS, RBAC, retrospectives, alerts, and read-model sync
frontend/web
  React/Vite app for manager sessions, participant voting, reports, retrospectives, and CMS
infra
  Caddy, Grafana, Kubernetes, deployment files
```

## Runtime Data

- Redis stores live voting/session state and web voting tokens.
- Redis pub/sub fans live state to participant and retro WebSockets.
- Postgres stores the CMS read model and RBAC data.
- Voting Service syncs live session state into normalized CMS tables through a coalesced background sync.
- CMS list endpoints use cursor pagination and indexed query shapes.
- Task queue and voting mutations always write through atomic live-session repository operations first; the CMS read model is refreshed asynchronously after the commit.
- Manager-created web sessions use live session state as the source of truth; CMS tables remain a read model.
- Finished-session summaries are computed from live session state and support paginated task details plus CSV/Markdown exports.

## Reliability And Secrets

- Jira API auth failures are logged without exposing the API token.
- Jira HTTP calls retry transient network errors and `429/5xx` responses with short backoff.
- Jira Service cache is TTL-based and capped by `JIRA_CACHE_MAX_ITEMS` to avoid unbounded growth.
- Session JSON serialization is centralized in `SessionFactory`.
- Redis and Postgres session repositories expose async methods directly; sync `NotImplementedError` shims were removed.
- Session creation is service-owned and idempotent: Redis uses `SET NX`, Postgres uses a transaction-scoped advisory lock, and HTTP clients no longer create local fallback sessions after a missing read.
- Session mutations are atomic at the repository boundary: Redis uses optimistic locking with `WATCH`, Postgres uses a transaction-scoped advisory lock, and the file repository uses a process-local async lock for development/test runs.
- CMS read-model sync is scheduled in the background and coalesced per session so user-facing write paths are not blocked by CMS table refreshes.
- CMS text search uses trigram indexes for large session, user, and task tables.
- WebSocket listeners subscribe through the same configured Redis client/pool used for REST publish operations. Participant clients also catch up from `/web/state/{token}` when a socket opens or reconnects.
- Telegram session-finish alerts are best-effort. Notification failures are logged and never fail the session mutation.

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
- `GET /api/v1/app/sessions/{chat_id}/completed`
- `POST /api/v1/app/sessions/{chat_id}/invite`
- `PATCH /api/v1/app/sessions/{chat_id}/title`
- `GET /api/v1/app/sessions/{chat_id}/tasks`
- `POST /api/v1/app/sessions/{chat_id}/tasks`
- `POST /api/v1/app/sessions/{chat_id}/tasks/bulk`
- `POST /api/v1/app/sessions/{chat_id}/tasks/jira-preview`
- `POST /api/v1/app/sessions/{chat_id}/tasks/jira-import`
- `PATCH /api/v1/app/sessions/{chat_id}/tasks/{task_id}`
- `DELETE /api/v1/app/sessions/{chat_id}/tasks/{task_id}`
- `POST /api/v1/app/sessions/{chat_id}/tasks/{task_id}/move`
- `POST /api/v1/app/sessions/{chat_id}/start`
- `POST /api/v1/app/sessions/{chat_id}/ai-summary`
- `POST /api/v1/app/sessions/{chat_id}/next`
- `POST /api/v1/app/sessions/{chat_id}/skip`
- `POST /api/v1/app/sessions/{chat_id}/completed/{task_id}/reopen`
- `POST /api/v1/app/sessions/{chat_id}/final-estimate`
- `POST /api/v1/app/sessions/{chat_id}/finish`
- `POST /api/v1/app/sessions/{chat_id}/jira-story-points/sync`
- `GET /api/v1/app/sessions/{chat_id}/summary`
- `GET /api/v1/app/sessions/{chat_id}/summary/tasks`
- `GET /api/v1/app/sessions/{chat_id}/summary.csv`
- `GET /api/v1/app/sessions/{chat_id}/summary.md`

Live vote values are included in participant WebSocket state. The browser state moves to `results` when all eligible voters have voted; `Session.revealed_task_id` remains in the domain model for compatibility with older flows but the current web UI no longer requires a separate reveal action.

Setting a final estimate calls `/final-estimate`, then the cockpit auto-calls `/next`. If `/next` advances past the final task, `batch_completed` becomes true and the session-finish notifier runs. Explicit `/finish` and CMS `/close` share the same idempotency guard so Telegram alerts are not duplicated.

Only authenticated managers with `app.sessions.manage` can start, skip, advance, reopen completed tasks, set final estimates, sync Jira Story Points, or finish a session. Public participant links expose voting/joining only.

## Public Voting And WebSockets

Public voting endpoints:

- `POST /api/v1/web/token`
- `POST /api/v1/web/join`
- `GET /api/v1/web/state/{token}`
- `POST /api/v1/web/vote`
- `WS /api/v1/ws/{token}`

The WebSocket sends an initial `session_state`, forwards Redis pub/sub messages, and emits keepalive pings. REST mutations publish `session_state` snapshots through `_publish_state`; direct participant votes publish either `vote_cast` or `results`. The React `useSession` hook reconnects with exponential backoff and fetches `/web/state/{token}` on socket open to recover missed events.

## Finished Reports And Telegram Alerts

Finished report generation lives in `backend/services/voting_service/app_api.py`:

- `_summary_payload()` computes exact aggregate stats over the full completed batch.
- `/summary` can inline the first task page while `/summary/tasks` pages through long sessions.
- `_csv_report()` powers `/summary.csv`.
- `_markdown_report()` powers `/summary.md` and Telegram attachments.

Telegram alert orchestration lives in:

- `backend/services/voting_service/session_finish_notify.py`
- `backend/services/voting_service/telegram_notifier.py`

Required runtime env for alerts:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `WEB_UI_URL` for report links

The notifier sends `sendDocument` with an HTML caption and Markdown report. It runs on newly completed sessions from manager auto-complete, explicit Finish, and CMS force-close.

## Retrospectives

Retrospectives are served by `backend/services/voting_service/retro_api.py` and use Redis live state plus Postgres CMS metadata.

Core capabilities:

- CMS-created retrospectives with configurable sections and vote limits.
- Public `/r/:token` participant flow backed by `web_retro:{token}` keys.
- `WS /api/v1/retro-ws/{token}` for live state.
- Anonymous cards, grouping, voting, action items, finalization, and optional Anthropic AI analysis.
- AI analysis is strict JSON with one repair retry and no heuristic fallback.

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

CMS user creation is guarded on both UX and API boundaries: the frontend validates username format, password length, and role selection before submitting. FastAPI remains authoritative for request validation and server-side permission checks.

Access management is designed for large admin lists:

- `GET /api/v1/cms/access/admins` uses cursor pagination.
- Admin list filters are `q`, `active`, and `role_id`.
- Admin search is prefix-oriented for indexed lookup on username/display name.
- Frontend searches are debounced and stale list responses are ignored.

Backend remains the source of truth. Frontend hides pages based on `/api/v1/cms/auth/me`, but every CMS API endpoint also checks its required permission server-side.

Runtime env:

- `CORS_ORIGINS`: comma-separated browser origins for FastAPI services.
- `JIRA_SERVICE_CORS_ORIGINS`: optional override for Jira Service CORS origins.
- `JIRA_URL`: Atlassian site base URL, for example `https://company.atlassian.net`.
- `JIRA_USERNAME`: Jira account email used with the API token.
- `JIRA_API_TOKEN`: Jira API token. Keep it in the runtime env only; never commit a real token.
- `STORY_POINTS_FIELD`: Jira custom field id used for Story Points, for example `customfield_10022`.
- `JIRA_DEMO_FALLBACK`: enables local DEMO issue fallback when Jira returns no issues, default `true` locally and `false` in production compose.
- `ANTHROPIC_API_KEY`: Anthropic API key for manager AI task summaries (required for `/ai-summary`; no heuristic fallback).
- `ANTHROPIC_MODEL`: Claude model id, default `claude-haiku-4-5-20251001`.
- `ANTHROPIC_TIMEOUT_SECONDS`: LLM HTTP timeout, default `20`.
- `ANTHROPIC_MAX_CONTEXT_CHARS`: max Jira/task text sent to the model, default `16000`.
- `TELEGRAM_BOT_TOKEN`: bot token for session-finish Telegram alerts.
- `TELEGRAM_CHAT_ID`: target chat/channel for session-finish Telegram alerts.
- `WEB_UI_URL`: public web base URL used in invite/report links and Telegram captions.
- `JIRA_CACHE_MAX_ITEMS`: max in-memory Jira cache entries, default `1000`.
- `JIRA_UPDATE_CONCURRENCY`: concurrent Jira Story Points writes in skip-errors mode, default `5`.
- `JIRA_SERVICE_TIMEOUT_SECONDS`: CMS Jira preview/import HTTP timeout, default `30`.
- `ENABLE_DEMO_SESSION`: enables public real-demo session endpoint, default `true` for local compose and `false` in production compose.

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
- `cms.planner.view`
- `cms.planner.manage`
- `cms.retro.view`
- `cms.retro.manage`
- `cms.retro.analyze`
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
- `/r/:token`: participant retrospective link.
- `/cms`: secondary admin/audit CMS.

CMS routes are nested under `/cms`:

- `/cms`
- `/cms/sessions`
- `/cms/users`
- `/cms/votes`
- `/cms/tokens`
- `/cms/events`
- `/cms/access`
- `/cms/planner`
- `/cms/retro`

CMS route components are lazy-loaded to keep the participant voting path lighter.

The CMS task queue editor uses `@tanstack/react-virtual` for large lists and `@dnd-kit` for drag handles. Full drag reorder is sent through `/tasks/reorder` only when the complete unfiltered queue is loaded; otherwise the UI falls back to a bounded move operation so huge filtered lists do not require rendering everything.

The web root also ships browser install assets from `frontend/web/public`: `favicon.ico`, `favicon.svg`, `favicon-96x96.png`, `apple-touch-icon.png`, `safari-pinned-tab.svg`, `site.webmanifest`, and 192/512 PNG manifest icons.

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

Current frontend unit tests cover CMS navigation/RBAC tab filtering, query serialization, access validation, task bulk-input parsing, manager/voter AI-summary rendering, and task queue behavior.
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
