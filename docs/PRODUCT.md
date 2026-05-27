# Product Notes

## Purpose

Planning Poker helps teams estimate Jira tasks from a manager-led web room with browser voting links.

## Core Flows

1. A manager logs in to the main web app and creates a planning session.
2. Participants join by invite link and wait in the lobby.
3. The manager imports tasks from Jira or adds them manually.
4. The manager starts voting, reveals results, discusses outliers, sets the final estimate, and moves to the next task.
5. CMS remains available for audit, access, and operational inspection.

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
- reveal results before or after all voters have voted;
- skip or move to the next task;
- set the final estimate after discussion;
- finish the session.

Only users with `app.sessions.manage` can call manager session APIs. Participants cannot start, reveal, skip, or advance tasks from the public voting link.

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
- WebSocket updates keep the voting state current.
- Participants do not see manager controls.

## CMS

CMS is available at `/cms`.

CMS includes:

- Overview
- Sessions
- Users
- Votes
- Tokens
- Web participants
- Audit events
- Access management

Access management lets a superadmin or access manager:

- create custom roles;
- assign permissions to roles;
- create CMS user/admin accounts;
- assign roles to CMS users/admins;
- deactivate admins.

New CMS users need a username, a temporary password of at least 8 characters, and at least one role.

For large teams, CMS users are searched and loaded page by page. The access screen supports filtering by status and role before loading more rows.

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
