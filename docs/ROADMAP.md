# Roadmap

## Recently Completed

1. Added atomic live-session mutations.
   - Redis uses optimistic locking.
   - Postgres uses transaction-scoped advisory locks.
   - Task queue edits, Jira imports, manager actions, and browser voting mutate sessions through the same repository boundary.

2. Moved CMS read-model refresh out of hot write paths.
   - Session saves schedule coalesced background CMS sync.
   - User-facing voting and task-edit operations no longer wait on normalized CMS table refresh.

3. Added baseline CI and smoke automation.
   - GitHub Actions runs backend tests, frontend tests/build, Playwright smoke tests, and Docker Compose config validation.
   - Playwright covers the browser voting happy path and unauthenticated CMS login rendering on desktop and mobile.

4. Hardened large-list foundations.
   - CMS search has trigram indexes for large text filters.
   - Jira preview shows all returned preview rows in a bounded list and exposes selected/importable counts.

5. Moved session facilitation into the main web app.
   - `/manage` is now the manager cockpit for session creation, invite links, queue editing, Jira/manual task intake, start/reveal/next/skip/finish, and final estimate selection.
   - `/cms` remains the secondary operational/audit surface.
   - Manager actions are protected by `app.sessions.manage`.

## Next Backend Improvements

1. Add explicit database migrations.
   - Current CMS tables are created by `ensure_schema`.
   - Move schema changes to Alembic or another migration tool before production data becomes critical.

2. Move task queue storage toward a normalized write model.
   - Today live session JSON remains the source of truth and CMS tables are a read model.
   - For very large task queues, store tasks as rows with rank/position keys and transactional queue updates.

3. Remove duplicated local import bootstrapping.
   - Several service entrypoints still include local `sys.path` bootstrapping for direct script execution.
   - Prefer package execution with a single shared bootstrap or installation as an editable package.

4. Add true bulk Jira Story Points writes if the target Jira deployment supports a safe bulk endpoint.
   - Current implementation uses bounded concurrency in skip-errors mode.
   - Keep per-issue fallback for clear partial-failure reporting.

5. Add app/CMS RBAC and mutation integration tests with a real Postgres container.
   - Cover bootstrap superadmin.
   - Cover custom role creation.
   - Cover 403 on denied CMS routes.
   - Cover `cms.tasks.manage` on task mutations.
   - Cover `app.sessions.manage` on manager-session APIs.
   - Cover concurrent vote/task mutations against Redis and Postgres repositories.

6. Add audit coverage for access changes.
   - Capture before/after role assignments.
   - Capture admin activation changes.
   - Capture before/after task queue mutations.

7. Add export jobs.
   - CSV/JSON exports should be backend jobs filtered by query params.
   - Avoid browser-side export-all for huge tables.

8. Add slow-query metrics for CMS endpoints.
   - Track endpoint, filters, duration, and returned row count.

## Next Frontend Improvements

1. Add React component tests.
   - Login screen.
   - CMS shell navigation by permission.
   - Access management forms.
   - Table empty/loading/error states.

2. Expand Playwright coverage beyond smoke.
   - `/cms` successful login.
   - Each CMS route renders for superadmin.
   - A limited role only sees allowed routes.
   - Task queue manual add/edit/delete/reorder.
   - Jira preview/import with duplicate rows.

3. Continue design-system extraction.
   - Checkbox group.
   - Role picker.
   - Permission picker.
   - Toast stack.
   - Form success state.

4. Improve CMS table ergonomics.
   - URL-synced filters.
   - Date-range filters.
   - Copy buttons for IDs/hashes.
   - Sticky headers for wide tables.

5. Add dedicated queue ergonomics for very large backlogs.
   - Move after selected task.
   - URL-synced queue filters.
   - Bulk select/delete for non-active tasks.

6. Improve the manager cockpit interaction model.
   - Drag-and-drop reorder for loaded unfiltered queues.
   - Toast notifications for successful actions.
   - Dedicated empty/error/loading states for Jira import.
   - Multi-manager conflict messaging when `tasks_version` is stale.

## Production Readiness

1. Add backups.
   - Postgres scheduled dumps.
   - Restore test procedure.

2. Add production deploy workflow.
   - Build immutable Docker images.
   - Push images to registry.
   - Deploy to VPS only after CI passes.
   - Keep manual approval for production until rollback is rehearsed.

3. Add secrets process.
   - Strong generated `CMS_PASSWORD`.
   - Rotation process for CMS admins.
   - Separate prod/test env files.

4. Add operational dashboards.
   - Service health.
   - CMS request latency.
   - Login failures.
   - WebSocket disconnects.
