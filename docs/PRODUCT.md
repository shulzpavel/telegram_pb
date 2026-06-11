# Product Notes

## Purpose

Planning Poker helps teams estimate Jira tasks from a manager-led web room with browser voting links, live results, exportable reports, and operational audit tooling.

## Core Flows

1. A manager logs in to the main web app and creates a planning session.
2. Participants join by invite link and wait in the lobby.
3. The manager imports tasks from Jira or adds them manually.
4. The manager starts voting. Participants see live vote progress and values as votes arrive; once everyone has voted, the round moves to results.
5. The manager discusses outliers, sets the final estimate, and the cockpit automatically advances to the next task.
6. On the final task, auto-advance completes the session and opens the finished-report flow. Manual `Finish` and CMS `Close` remain available.
7. CMS remains available for audit, access, and operational inspection.

## Roles In Planning Sessions

Participant disciplines are used for estimation context:

- backend team
- frontend team
- qa team

Session authority is separate:

- `facilitator`: authenticated manager with `app.sessions.manage`.
- `estimator`: participant who can vote.
- `observer`: future read-only participant role.

CMS admin roles are separate from session roles.

## Manager Web App

The primary product workspace is `/manage`.

A manager can:

- log in with the same secure cookie auth used by CMS;
- create a session and copy the participant invite link;
- see lobby participants and vote progress;
- add tasks manually one by one;
- preview and import Jira tasks;
- edit, delete, and move backlog tasks;
- start voting;
- skip or move to the next task;
- generate a structured AI estimation hint for the active task when Anthropic is configured;
- set the final estimate after discussion;
- finish the session and open the report.

Only users with `app.sessions.manage` can call manager session APIs. Participants cannot start, skip, advance, set estimates, sync Jira, or finish tasks from the public voting link.

## Finished Session Report

Finished sessions have a report page under `/cms/sessions/:chatId/report` and the legacy `/manage/finished/:chatId` route.

The report includes:

- played task count, final estimate coverage, total SP, consensus count, and votes cast;
- session start/end timestamps and duration;
- participant roster;
- per-task vote breakdowns, final estimates, Jira metadata, and stored AI summaries;
- CSV export for spreadsheet use;
- Markdown export for Confluence-friendly handoff, with `---` separators between task sections;
- optional Jira Story Points sync from the finished batch.

Reports work for both explicitly finished sessions and auto-completed sessions where the manager advanced past the final task.

## Real Demo Session

`/demo` now creates or reuses a real backend session with Jira-like test tasks and redirects to the participant invite link.

For manager testing:

- open `/manage?demo=1`;
- log in as a manager/superadmin;
- open `/demo` in another browser/tab and join as a participant;
- the manager cockpit refreshes live state automatically and shows joined participants/vote progress.

The static visual mock is still available at `/demo?mock=1` for frontend smoke tests.

## Browser Voting

The web app supports token-based voting sessions:

- `/s/:token` opens the participant flow.
- A participant joins with a name and role.
- The browser keeps a local participant id for the token.
- WebSocket updates keep the voting state current, and the client catches up from `/web/state/:token` after reconnects.
- Vote values are visible live; the participant screen no longer waits for a separate manager reveal step.
- Participants do not see manager controls.

## Telegram Alerts

Production can send a Telegram alert when a planning session newly completes.

The alert is sent when:

- the manager auto-advances past the final task after setting the last final SP;
- the manager explicitly clicks Finish;
- an admin force-closes the session from CMS.

The alert includes a short HTML caption with session title, team, finisher, duration, stats, report link, and an attached Markdown report. Alerts are best-effort and idempotent: already completed sessions do not send duplicate alerts on later Finish/Close calls.

## CMS

CMS is available at `/cms`.

CMS includes:

- Overview
- Sessions
- Tokens
- Web participants
- Audit events
- Access management
- Sprint planner
- Retrospectives

Access management lets a superadmin or access manager:

- create custom roles;
- assign permissions to roles;
- create CMS user/admin accounts;
- assign roles to CMS users/admins;
- deactivate admins.

New CMS users need a username, a temporary password of at least 8 characters, and at least one role.

For large teams, CMS users are searched and loaded page by page. The access screen supports filtering by status and role before loading more rows.

## Sprint Planner And Retrospectives

CMS also includes lightweight planning and retrospective workspaces:

- Sprint planner stores sprint-plan drafts, plan metadata, and task lists.
- Retrospectives use token-based participant links, live WebSocket updates, configurable sections, voting/grouping, action items, and optional AI analysis through Anthropic.

## Task Queue Management

The main task queue editor lives in `/manage`; CMS keeps a secondary task editor for support and audit workflows.

Admins with `cms.tasks.manage` can:

- preview Jira import results before adding them, including duplicate/importable/selected counts;
- import selected Jira tasks;
- add one manual task;
- paste many manual tasks, one per line;
- edit queue tasks;
- delete queue tasks;
- move tasks to top, up, down, or end;
- reorder loaded queue tasks by drag handle;
- search task rows before loading more.

The active current task is protected while voting is running: it cannot be deleted or moved until the round changes or voting stops. This avoids corrupting an in-progress vote.

For large queues, tasks are loaded page by page, filtered server-side, and rendered through a virtual list. Drag reorder is available for the loaded visible queue; direct move actions remain available for long-distance moves.
Jira preview rows are shown in a scrollable list instead of being silently capped, so selected hidden tasks are never imported without being visible to the admin.

## Security Model

- CMS uses httponly cookie auth.
- Login is rate-limited per username/IP.
- CMS permissions are enforced server-side.
- Frontend uses permissions only for navigation and UX.
- Bootstrap superadmin is configured by `CMS_USERNAME` and `CMS_PASSWORD`.
- Participant invite tokens and WebSocket authorization are Redis-backed and expire with `WEB_TOKEN_TTL`.

## Browser And Apple Icons

The web app ships favicon and install metadata for desktop browsers, Safari, iOS, and PWA-style home-screen shortcuts:

- `favicon.ico` for legacy browser support;
- `favicon.svg` and `favicon-96x96.png` for modern tabs;
- `apple-touch-icon.png` for iOS;
- `safari-pinned-tab.svg` for pinned tabs;
- `site.webmanifest` with 192px and 512px PNG icons.
