"""Postgres read model for CMS/admin screens.

The app stores live session state as compact domain JSON. CMS screens need a
different shape: indexed, normalized, and pageable tables. This module keeps
that read model in sync without making normal voting depend on CMS writes.
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Optional

import asyncpg

from app.domain.session import Session, SessionFactory
from app.domain.task import Task
from services.voting_service.cms_rbac import (
    ALL_PERMISSION_KEYS,
    CMS_PAGE_DEFINITIONS,
    CMS_PERMISSION_DEFINITIONS,
    DEPRECATED_CMS_PAGE_KEYS,
    OPERATIONAL_VIEW_PERMISSIONS,
    PERM_ACCESS_MANAGE,
    PERM_ACCESS_VIEW,
    PERM_APP_SESSIONS_MANAGE,
    PERM_SESSIONS_VIEW,
    PERM_TASKS_MANAGE,
    hash_password,
    verify_password,
)

logger = logging.getLogger(__name__)


DEFAULT_LIMIT = 50
MAX_LIMIT = 100


def clamp_limit(limit: int) -> int:
    return max(1, min(limit, MAX_LIMIT))


def encode_cursor(payload: dict[str, Any]) -> str:
    raw = json.dumps(payload, separators=(",", ":"), default=str).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def decode_cursor(cursor: Optional[str]) -> dict[str, Any]:
    if not cursor:
        return {}
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        raw = base64.urlsafe_b64decode(padded.encode("ascii"))
        data = json.loads(raw.decode("utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _decode_cursor_timestamp(value: Any) -> Optional[datetime]:
    """Cursors are serialised as JSON with ``default=str``, so timestamps
    arrive as ISO-8601 strings. asyncpg, however, binds ``timestamptz``
    parameters as ``datetime`` instances. Convert here so every paginated
    list endpoint can pass cursor TS straight through to the SQL query."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            # ``datetime.fromisoformat`` handles the ``YYYY-MM-DDTHH:MM:SS[.ffffff][+HH:MM]``
            # shape produced by ``str(datetime)`` since Python 3.11.
            return datetime.fromisoformat(value)
        except ValueError:
            return None
    return None


def session_key(chat_id: int, topic_id: Optional[int]) -> str:
    return f"{chat_id}:{'none' if topic_id is None else topic_id}"


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def token_prefix(token: str) -> str:
    return token[:8]


def _json_default(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def _row_to_dict(row: asyncpg.Record) -> dict[str, Any]:
    return json.loads(json.dumps(dict(row), default=_json_default))


def _serialize_session(session: Session) -> dict[str, Any]:
    return SessionFactory.to_dict(session)


def _deserialize_session(data: dict[str, Any], fallback_chat_id: int, fallback_topic_id: Optional[int]) -> Session:
    return SessionFactory.from_dict(data, fallback_chat_id, fallback_topic_id)


def _ids_from_session_key(key: str) -> tuple[int, Optional[int]]:
    parts = key.split(":")
    chat_id = int(parts[1])
    topic_raw = parts[2] if len(parts) > 2 else "none"
    topic_id = None if topic_raw == "none" else int(topic_raw)
    return chat_id, topic_id


async def backfill_cms_from_redis(redis_client, cms_store: "PostgresCmsStore") -> None:
    """Backfill current Redis live state into the CMS read model.

    Uses SCAN-style iteration so startup does not issue Redis KEYS against a
    large keyspace. The task is best-effort and voting continues if it fails.
    """
    try:
        session_count = 0
        async for key in redis_client.scan_iter(match="session:*", count=100):
            raw = await redis_client.get(key)
            if not raw:
                continue
            try:
                chat_id, topic_id = _ids_from_session_key(key)
                session = _deserialize_session(json.loads(raw), chat_id, topic_id)
                await cms_store.sync_session(session)
                session_count += 1
            except Exception as exc:
                logger.warning("CMS Redis session backfill skipped key=%s: %s", key, exc)

        token_count = 0
        async for key in redis_client.scan_iter(match="web:*", count=100):
            token = key.removeprefix("web:")
            raw = await redis_client.get(key)
            ttl = await redis_client.ttl(key)
            if not raw or ttl <= 0:
                continue
            try:
                info = json.loads(raw)
                await cms_store.record_web_token(token, int(info["chat_id"]), info.get("topic_id"), ttl)
                token_count += 1
            except Exception as exc:
                logger.warning("CMS Redis token backfill skipped key=%s: %s", key, exc)

        participant_count = 0
        async for key in redis_client.scan_iter(match="web_participant:*:*", count=100):
            raw = await redis_client.get(key)
            ttl = await redis_client.ttl(key)
            if not raw or ttl <= 0:
                continue
            try:
                _, token, participant_id = key.split(":", 2)
                token_raw = await redis_client.get(f"web:{token}")
                if not token_raw:
                    continue
                info = json.loads(token_raw)
                participant = json.loads(raw)
                await cms_store.record_web_participant(
                    token,
                    participant_id,
                    int(participant["user_id"]),
                    participant.get("name") or "Unknown",
                    participant.get("role") or "participant",
                    int(info["chat_id"]),
                    info.get("topic_id"),
                    ttl,
                )
                participant_count += 1
            except Exception as exc:
                logger.warning("CMS Redis participant backfill skipped key=%s: %s", key, exc)

        logger.info(
            "CMS Redis backfill completed: sessions=%s tokens=%s web_participants=%s",
            session_count,
            token_count,
            participant_count,
        )
    except Exception as exc:
        logger.warning("CMS Redis backfill failed: %s", exc)


class PostgresCmsStore:
    """Normalized read model used by the CMS API."""

    def __init__(self, pool: asyncpg.Pool):
        self.pool = pool

    @classmethod
    async def create(cls, dsn: str) -> "PostgresCmsStore":
        pool = await asyncpg.create_pool(dsn, min_size=1, max_size=5)
        store = cls(pool)
        await store.ensure_schema()
        return store

    async def ensure_schema(self) -> None:
        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                CREATE EXTENSION IF NOT EXISTS pg_trgm;

                CREATE TABLE IF NOT EXISTS cms_sessions (
                    id BIGSERIAL PRIMARY KEY,
                    session_key TEXT NOT NULL UNIQUE,
                    chat_id BIGINT NOT NULL,
                    topic_id BIGINT,
                    current_task_index INTEGER NOT NULL DEFAULT 0,
                    participants_count INTEGER NOT NULL DEFAULT 0,
                    tasks_queue_count INTEGER NOT NULL DEFAULT 0,
                    history_count INTEGER NOT NULL DEFAULT 0,
                    last_batch_count INTEGER NOT NULL DEFAULT 0,
                    total_tasks INTEGER NOT NULL DEFAULT 0,
                    total_votes INTEGER NOT NULL DEFAULT 0,
                    batch_completed BOOLEAN NOT NULL DEFAULT FALSE,
                    is_active BOOLEAN NOT NULL DEFAULT FALSE,
                    current_batch_id TEXT,
                    current_batch_started_at TEXT,
                    current_task_id TEXT,
                    tasks_version INTEGER NOT NULL DEFAULT 0,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    raw JSONB NOT NULL
                );
                ALTER TABLE cms_sessions
                    ADD COLUMN IF NOT EXISTS current_task_id TEXT;
                ALTER TABLE cms_sessions
                    ADD COLUMN IF NOT EXISTS tasks_version INTEGER NOT NULL DEFAULT 0;
                ALTER TABLE cms_sessions
                    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
                ALTER TABLE cms_sessions
                    ADD COLUMN IF NOT EXISTS title TEXT;
                CREATE INDEX IF NOT EXISTS idx_cms_sessions_title_trgm
                    ON cms_sessions USING GIN ((lower(title)) gin_trgm_ops)
                    WHERE title IS NOT NULL;
                CREATE INDEX IF NOT EXISTS idx_cms_sessions_updated
                    ON cms_sessions(updated_at DESC, id DESC);
                CREATE INDEX IF NOT EXISTS idx_cms_sessions_active_updated
                    ON cms_sessions(is_active, updated_at DESC, id DESC);
                CREATE INDEX IF NOT EXISTS idx_cms_sessions_chat
                    ON cms_sessions(chat_id, topic_id);
                CREATE INDEX IF NOT EXISTS idx_cms_sessions_session_key_trgm
                    ON cms_sessions USING GIN (session_key gin_trgm_ops);
                CREATE INDEX IF NOT EXISTS idx_cms_sessions_batch_id_trgm
                    ON cms_sessions USING GIN (current_batch_id gin_trgm_ops)
                    WHERE current_batch_id IS NOT NULL;
                CREATE INDEX IF NOT EXISTS idx_cms_sessions_alive_updated
                    ON cms_sessions(updated_at DESC, id DESC)
                    WHERE deleted_at IS NULL;

                CREATE TABLE IF NOT EXISTS cms_users (
                    user_id BIGINT PRIMARY KEY,
                    name TEXT NOT NULL,
                    role TEXT NOT NULL,
                    is_web BOOLEAN NOT NULL DEFAULT FALSE,
                    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_cms_users_last_seen
                    ON cms_users(last_seen_at DESC, user_id DESC);
                CREATE INDEX IF NOT EXISTS idx_cms_users_role
                    ON cms_users(role);
                CREATE INDEX IF NOT EXISTS idx_cms_users_name_trgm
                    ON cms_users USING GIN (name gin_trgm_ops);
                CREATE INDEX IF NOT EXISTS idx_cms_users_id_text_trgm
                    ON cms_users USING GIN ((user_id::text) gin_trgm_ops);

                CREATE TABLE IF NOT EXISTS cms_session_participants (
                    session_id BIGINT NOT NULL REFERENCES cms_sessions(id) ON DELETE CASCADE,
                    user_id BIGINT NOT NULL,
                    name TEXT NOT NULL,
                    role TEXT NOT NULL,
                    source TEXT NOT NULL DEFAULT 'session',
                    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    PRIMARY KEY (session_id, user_id)
                );
                CREATE INDEX IF NOT EXISTS idx_cms_session_participants_user
                    ON cms_session_participants(user_id);

                CREATE TABLE IF NOT EXISTS cms_tasks (
                    id BIGSERIAL PRIMARY KEY,
                    session_id BIGINT NOT NULL REFERENCES cms_sessions(id) ON DELETE CASCADE,
                    task_uid TEXT NOT NULL DEFAULT '',
                    bucket TEXT NOT NULL,
                    bucket_index INTEGER NOT NULL,
                    jira_key TEXT,
                    summary TEXT NOT NULL DEFAULT '',
                    url TEXT,
                    story_points INTEGER,
                    source TEXT NOT NULL DEFAULT 'jira',
                    votes_count INTEGER NOT NULL DEFAULT 0,
                    numeric_avg NUMERIC,
                    numeric_max INTEGER,
                    completed_at TEXT,
                    jql TEXT,
                    created_at_text TEXT,
                    domain_updated_at TEXT,
                    raw JSONB NOT NULL,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE(session_id, bucket, bucket_index)
                );
                ALTER TABLE cms_tasks
                    ADD COLUMN IF NOT EXISTS task_uid TEXT NOT NULL DEFAULT '';
                ALTER TABLE cms_tasks
                    ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'jira';
                ALTER TABLE cms_tasks
                    ADD COLUMN IF NOT EXISTS created_at_text TEXT;
                ALTER TABLE cms_tasks
                    ADD COLUMN IF NOT EXISTS domain_updated_at TEXT;
                CREATE INDEX IF NOT EXISTS idx_cms_tasks_session_bucket
                    ON cms_tasks(session_id, bucket, bucket_index, id);
                CREATE INDEX IF NOT EXISTS idx_cms_tasks_session_uid
                    ON cms_tasks(session_id, task_uid);
                CREATE INDEX IF NOT EXISTS idx_cms_tasks_jira_key
                    ON cms_tasks(jira_key);
                CREATE INDEX IF NOT EXISTS idx_cms_tasks_updated
                    ON cms_tasks(updated_at DESC, id DESC);
                CREATE INDEX IF NOT EXISTS idx_cms_tasks_summary_trgm
                    ON cms_tasks USING GIN (summary gin_trgm_ops);
                CREATE INDEX IF NOT EXISTS idx_cms_tasks_jira_key_trgm
                    ON cms_tasks USING GIN (jira_key gin_trgm_ops)
                    WHERE jira_key IS NOT NULL;
                CREATE INDEX IF NOT EXISTS idx_cms_tasks_uid_trgm
                    ON cms_tasks USING GIN (task_uid gin_trgm_ops)
                    WHERE task_uid <> '';

                CREATE TABLE IF NOT EXISTS cms_votes (
                    id BIGSERIAL PRIMARY KEY,
                    task_id BIGINT NOT NULL REFERENCES cms_tasks(id) ON DELETE CASCADE,
                    session_id BIGINT NOT NULL REFERENCES cms_sessions(id) ON DELETE CASCADE,
                    user_id BIGINT NOT NULL,
                    value TEXT NOT NULL,
                    is_numeric BOOLEAN NOT NULL DEFAULT FALSE,
                    numeric_value INTEGER,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_cms_votes_task_id
                    ON cms_votes(task_id, id);
                CREATE INDEX IF NOT EXISTS idx_cms_votes_session_id
                    ON cms_votes(session_id, id DESC);
                CREATE INDEX IF NOT EXISTS idx_cms_votes_user_id
                    ON cms_votes(user_id, id DESC);
                CREATE INDEX IF NOT EXISTS idx_cms_votes_id_desc
                    ON cms_votes(id DESC);

                CREATE TABLE IF NOT EXISTS cms_web_tokens (
                    id BIGSERIAL PRIMARY KEY,
                    token_hash TEXT NOT NULL UNIQUE,
                    token_prefix TEXT NOT NULL,
                    chat_id BIGINT NOT NULL,
                    topic_id BIGINT,
                    session_key TEXT NOT NULL,
                    participants_joined INTEGER NOT NULL DEFAULT 0,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    expires_at TIMESTAMPTZ NOT NULL,
                    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_cms_web_tokens_expires
                    ON cms_web_tokens(expires_at DESC, id DESC);
                CREATE INDEX IF NOT EXISTS idx_cms_web_tokens_session
                    ON cms_web_tokens(session_key, id DESC);

                CREATE TABLE IF NOT EXISTS cms_web_participants (
                    id BIGSERIAL PRIMARY KEY,
                    token_hash TEXT NOT NULL,
                    participant_id TEXT NOT NULL,
                    user_id BIGINT NOT NULL,
                    name TEXT NOT NULL,
                    role TEXT NOT NULL,
                    chat_id BIGINT NOT NULL,
                    topic_id BIGINT,
                    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    expires_at TIMESTAMPTZ NOT NULL,
                    UNIQUE(token_hash, participant_id)
                );
                CREATE INDEX IF NOT EXISTS idx_cms_web_participants_user
                    ON cms_web_participants(user_id, id DESC);
                CREATE INDEX IF NOT EXISTS idx_cms_web_participants_token
                    ON cms_web_participants(token_hash, id DESC);

                CREATE TABLE IF NOT EXISTS cms_audit_events (
                    id BIGSERIAL PRIMARY KEY,
                    ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    action TEXT NOT NULL,
                    actor TEXT,
                    status TEXT NOT NULL DEFAULT 'ok',
                    ip TEXT,
                    payload JSONB NOT NULL DEFAULT '{}'::jsonb
                );
                CREATE INDEX IF NOT EXISTS idx_cms_audit_events_ts
                    ON cms_audit_events(ts DESC, id DESC);
                CREATE INDEX IF NOT EXISTS idx_cms_audit_events_action
                    ON cms_audit_events(action, ts DESC);

                CREATE TABLE IF NOT EXISTS cms_permissions (
                    key TEXT PRIMARY KEY,
                    label TEXT NOT NULL,
                    description TEXT NOT NULL DEFAULT '',
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );

                CREATE TABLE IF NOT EXISTS cms_pages (
                    key TEXT PRIMARY KEY,
                    label TEXT NOT NULL,
                    path TEXT NOT NULL UNIQUE,
                    permission_key TEXT NOT NULL REFERENCES cms_permissions(key),
                    sort_order INTEGER NOT NULL DEFAULT 100,
                    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_cms_pages_sort
                    ON cms_pages(sort_order, key);

                CREATE TABLE IF NOT EXISTS cms_roles (
                    id BIGSERIAL PRIMARY KEY,
                    key TEXT NOT NULL UNIQUE,
                    name TEXT NOT NULL,
                    description TEXT NOT NULL DEFAULT '',
                    is_system BOOLEAN NOT NULL DEFAULT FALSE,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );

                CREATE TABLE IF NOT EXISTS cms_role_permissions (
                    role_id BIGINT NOT NULL REFERENCES cms_roles(id) ON DELETE CASCADE,
                    permission_key TEXT NOT NULL REFERENCES cms_permissions(key) ON DELETE CASCADE,
                    PRIMARY KEY (role_id, permission_key)
                );

                CREATE TABLE IF NOT EXISTS cms_admin_accounts (
                    id BIGSERIAL PRIMARY KEY,
                    username TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    display_name TEXT,
                    is_active BOOLEAN NOT NULL DEFAULT TRUE,
                    is_superuser BOOLEAN NOT NULL DEFAULT FALSE,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    last_login_at TIMESTAMPTZ
                );
                ALTER TABLE cms_admin_accounts
                    ADD COLUMN IF NOT EXISTS theme_preference TEXT NOT NULL DEFAULT 'system';
                ALTER TABLE cms_admin_accounts
                    DROP CONSTRAINT IF EXISTS cms_admin_accounts_theme_preference_check;
                ALTER TABLE cms_admin_accounts
                    ADD CONSTRAINT cms_admin_accounts_theme_preference_check
                    CHECK (theme_preference IN ('dark', 'light', 'system'));
                CREATE INDEX IF NOT EXISTS idx_cms_admin_accounts_active
                    ON cms_admin_accounts(is_active, username);
                CREATE INDEX IF NOT EXISTS idx_cms_admin_accounts_username_lower
                    ON cms_admin_accounts((lower(username)), id);
                CREATE INDEX IF NOT EXISTS idx_cms_admin_accounts_display_name_lower
                    ON cms_admin_accounts((lower(display_name)), id)
                    WHERE display_name IS NOT NULL;

                CREATE TABLE IF NOT EXISTS cms_admin_roles (
                    admin_id BIGINT NOT NULL REFERENCES cms_admin_accounts(id) ON DELETE CASCADE,
                    role_id BIGINT NOT NULL REFERENCES cms_roles(id) ON DELETE CASCADE,
                    PRIMARY KEY (admin_id, role_id)
                );
                CREATE INDEX IF NOT EXISTS idx_cms_admin_roles_role_admin
                    ON cms_admin_roles(role_id, admin_id);
                """
            )

    async def ensure_access_defaults(self, bootstrap_username: str, bootstrap_password: str) -> None:
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                for permission in CMS_PERMISSION_DEFINITIONS:
                    await conn.execute(
                        """
                        INSERT INTO cms_permissions (key, label, description)
                        VALUES ($1, $2, $3)
                        ON CONFLICT (key) DO UPDATE SET
                            label = EXCLUDED.label,
                            description = EXCLUDED.description
                        """,
                        permission["key"],
                        permission["label"],
                        permission["description"],
                    )

                for page in CMS_PAGE_DEFINITIONS:
                    await conn.execute(
                        """
                        INSERT INTO cms_pages (key, label, path, permission_key, sort_order)
                        VALUES ($1, $2, $3, $4, $5)
                        ON CONFLICT (key) DO UPDATE SET
                            label = EXCLUDED.label,
                            path = EXCLUDED.path,
                            permission_key = EXCLUDED.permission_key,
                            sort_order = EXCLUDED.sort_order,
                            updated_at = NOW()
                        """,
                        page["key"],
                        page["label"],
                        page["path"],
                        page["permission_key"],
                        page["sort_order"],
                    )

                if DEPRECATED_CMS_PAGE_KEYS:
                    await conn.execute(
                        """
                        UPDATE cms_pages
                        SET is_enabled = FALSE, updated_at = NOW()
                        WHERE key = ANY($1::text[]) AND is_enabled = TRUE
                        """,
                        list(DEPRECATED_CMS_PAGE_KEYS),
                    )

                superadmin_role_id = await self._upsert_system_role(
                    conn,
                    "superadmin",
                    "Superadmin",
                    "Full CMS access, including access management.",
                    ALL_PERMISSION_KEYS,
                )
                await self._upsert_system_role(
                    conn,
                    "viewer",
                    "Viewer",
                    "Read-only access to operational CMS pages.",
                    OPERATIONAL_VIEW_PERMISSIONS,
                )
                await self._upsert_system_role(
                    conn,
                    "access_manager",
                    "Access manager",
                    "Can view and manage CMS admins and roles.",
                    [PERM_ACCESS_VIEW, PERM_ACCESS_MANAGE],
                )
                await self._upsert_system_role(
                    conn,
                    "session_manager",
                    "Session manager",
                    "Can facilitate planning sessions and manage active task queues.",
                    [PERM_SESSIONS_VIEW, PERM_TASKS_MANAGE, PERM_APP_SESSIONS_MANAGE],
                )

                if bootstrap_username and bootstrap_password:
                    admin_id = await conn.fetchval(
                        """
                        INSERT INTO cms_admin_accounts (
                            username, password_hash, display_name,
                            is_active, is_superuser, updated_at
                        )
                        VALUES ($1, $2, $3, TRUE, TRUE, NOW())
                        ON CONFLICT (username) DO UPDATE SET
                            password_hash = EXCLUDED.password_hash,
                            display_name = COALESCE(cms_admin_accounts.display_name, EXCLUDED.display_name),
                            is_active = TRUE,
                            is_superuser = TRUE,
                            updated_at = NOW()
                        RETURNING id
                        """,
                        bootstrap_username,
                        hash_password(bootstrap_password),
                        bootstrap_username,
                    )
                    await conn.execute(
                        """
                        INSERT INTO cms_admin_roles (admin_id, role_id)
                        VALUES ($1, $2)
                        ON CONFLICT DO NOTHING
                        """,
                        admin_id,
                        superadmin_role_id,
                    )

    async def _upsert_system_role(
        self,
        conn: asyncpg.Connection,
        key: str,
        name: str,
        description: str,
        permission_keys: list[str],
    ) -> int:
        role_id = await conn.fetchval(
            """
            INSERT INTO cms_roles (key, name, description, is_system, updated_at)
            VALUES ($1, $2, $3, TRUE, NOW())
            ON CONFLICT (key) DO UPDATE SET
                name = EXCLUDED.name,
                description = EXCLUDED.description,
                is_system = TRUE,
                updated_at = NOW()
            RETURNING id
            """,
            key,
            name,
            description,
        )
        await conn.execute("DELETE FROM cms_role_permissions WHERE role_id = $1", role_id)
        if permission_keys:
            await conn.executemany(
                """
                INSERT INTO cms_role_permissions (role_id, permission_key)
                VALUES ($1, $2)
                ON CONFLICT DO NOTHING
                """,
                [(role_id, permission_key) for permission_key in permission_keys],
            )
        return int(role_id)

    async def sync_session(self, session: Session) -> None:
        """Upsert a session and its normalized CMS children."""
        try:
            data = _serialize_session(session)
            queue = data["tasks_queue"]
            history = data["history"]
            last_batch = data["last_batch"]
            all_tasks = queue + history + last_batch
            votes_total = sum(len(task.get("votes") or {}) for task in all_tasks)
            participants = data["participants"]
            key = session_key(session.chat_id, session.topic_id)

            async with self.pool.acquire() as conn:
                async with conn.transaction():
                    session_id = await conn.fetchval(
                        """
                        INSERT INTO cms_sessions (
                            session_key, chat_id, topic_id, current_task_index,
                            participants_count, tasks_queue_count, history_count,
                            last_batch_count, total_tasks, total_votes,
                            batch_completed, is_active, current_batch_id,
                            current_batch_started_at, current_task_id,
                            tasks_version, updated_at, raw
                        )
                        VALUES (
                            $1, $2, $3, $4, $5, $6, $7, $8,
                            $9, $10, $11, $12, $13, $14, $15,
                            $16, NOW(), $17::jsonb
                        )
                        ON CONFLICT (session_key) DO UPDATE SET
                            chat_id = EXCLUDED.chat_id,
                            topic_id = EXCLUDED.topic_id,
                            current_task_index = EXCLUDED.current_task_index,
                            participants_count = EXCLUDED.participants_count,
                            tasks_queue_count = EXCLUDED.tasks_queue_count,
                            history_count = EXCLUDED.history_count,
                            last_batch_count = EXCLUDED.last_batch_count,
                            total_tasks = EXCLUDED.total_tasks,
                            total_votes = EXCLUDED.total_votes,
                            batch_completed = EXCLUDED.batch_completed,
                            is_active = EXCLUDED.is_active,
                            current_batch_id = EXCLUDED.current_batch_id,
                            current_batch_started_at = EXCLUDED.current_batch_started_at,
                            current_task_id = EXCLUDED.current_task_id,
                            tasks_version = EXCLUDED.tasks_version,
                            updated_at = NOW(),
                            raw = EXCLUDED.raw
                        WHERE cms_sessions.deleted_at IS NULL
                        RETURNING id
                        """,
                        key,
                        session.chat_id,
                        session.topic_id,
                        session.current_task_index,
                        len(participants),
                        len(queue),
                        len(history),
                        len(last_batch),
                        len(all_tasks),
                        votes_total,
                        session.batch_completed,
                        bool(session.current_batch_started_at and not session.batch_completed),
                        session.current_batch_id,
                        session.current_batch_started_at,
                        session.current_task_id,
                        session.tasks_version,
                        json.dumps(data),
                    )

                    if session_id is None:
                        # Session is soft-deleted in the CMS read model;
                        # skip downstream writes so deleted state is preserved.
                        return

                    user_ids: list[int] = []
                    for raw_uid, participant in participants.items():
                        user_id = int(raw_uid)
                        user_ids.append(user_id)
                        role = participant.get("role", "participant")
                        name = participant.get("name") or "Unknown"
                        is_web = True
                        await conn.execute(
                            """
                            INSERT INTO cms_users (user_id, name, role, is_web)
                            VALUES ($1, $2, $3, $4)
                            ON CONFLICT (user_id) DO UPDATE SET
                                name = EXCLUDED.name,
                                role = EXCLUDED.role,
                                is_web = cms_users.is_web OR EXCLUDED.is_web,
                                last_seen_at = NOW()
                            """,
                            user_id,
                            name,
                            role,
                            is_web,
                        )
                        await conn.execute(
                            """
                            INSERT INTO cms_session_participants (
                                session_id, user_id, name, role, source, last_seen_at
                            )
                            VALUES ($1, $2, $3, $4, $5, NOW())
                            ON CONFLICT (session_id, user_id) DO UPDATE SET
                                name = EXCLUDED.name,
                                role = EXCLUDED.role,
                                source = EXCLUDED.source,
                                last_seen_at = NOW()
                            """,
                            session_id,
                            user_id,
                            name,
                            role,
                            "web",
                        )

                    await conn.execute(
                        """
                        DELETE FROM cms_session_participants
                        WHERE session_id = $1 AND NOT (user_id = ANY($2::bigint[]))
                        """,
                        session_id,
                        user_ids,
                    )

                    await conn.execute("DELETE FROM cms_tasks WHERE session_id = $1", session_id)

                    for bucket, tasks in (
                        ("tasks_queue", queue),
                        ("history", history),
                        ("last_batch", last_batch),
                    ):
                        for idx, task in enumerate(tasks):
                            votes = task.get("votes") or {}
                            numeric_votes = [
                                int(value)
                                for value in votes.values()
                                if str(value).lstrip("-").isdigit()
                            ]
                            numeric_avg = (
                                Decimal(sum(numeric_votes)) / Decimal(len(numeric_votes))
                                if numeric_votes
                                else None
                            )
                            numeric_max = max(numeric_votes) if numeric_votes else None
                            task_id = await conn.fetchval(
                                """
                                INSERT INTO cms_tasks (
                                    session_id, task_uid, bucket, bucket_index, jira_key,
                                    summary, url, story_points, source, votes_count,
                                    numeric_avg, numeric_max, completed_at, jql,
                                    created_at_text, domain_updated_at, raw, updated_at
                                )
                                VALUES (
                                    $1, $2, $3, $4, $5, $6, $7, $8,
                                    $9, $10, $11, $12, $13, $14, $15,
                                    $16, $17::jsonb, NOW()
                                )
                                RETURNING id
                                """,
                                session_id,
                                task.get("task_id") or "",
                                bucket,
                                idx,
                                task.get("jira_key"),
                                task.get("summary") or "",
                                task.get("url"),
                                task.get("story_points"),
                                task.get("source") or ("jira" if task.get("jira_key") else "manual"),
                                len(votes),
                                numeric_avg,
                                numeric_max,
                                task.get("completed_at"),
                                task.get("jql"),
                                task.get("created_at"),
                                task.get("updated_at"),
                                json.dumps(task),
                            )
                            for raw_uid, value in votes.items():
                                value_text = str(value)
                                is_numeric = value_text.lstrip("-").isdigit()
                                await conn.execute(
                                    """
                                    INSERT INTO cms_votes (
                                        task_id, session_id, user_id, value,
                                        is_numeric, numeric_value
                                    )
                                    VALUES ($1, $2, $3, $4, $5, $6)
                                    """,
                                    task_id,
                                    session_id,
                                    int(raw_uid),
                                    value_text,
                                    is_numeric,
                                    int(value_text) if is_numeric else None,
                                )
        except Exception as exc:
            logger.warning("CMS read-model sync failed: %s", exc)

    async def record_web_token(self, token: str, chat_id: int, topic_id: Optional[int], ttl_seconds: int) -> None:
        try:
            expires_at = datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)
            hashed = token_hash(token)
            async with self.pool.acquire() as conn:
                await conn.execute(
                    """
                    INSERT INTO cms_web_tokens (
                        token_hash, token_prefix, chat_id, topic_id, session_key,
                        expires_at, last_seen_at
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, NOW())
                    ON CONFLICT (token_hash) DO UPDATE SET
                        chat_id = EXCLUDED.chat_id,
                        topic_id = EXCLUDED.topic_id,
                        session_key = EXCLUDED.session_key,
                        expires_at = EXCLUDED.expires_at,
                        last_seen_at = NOW()
                    """,
                    hashed,
                    token_prefix(token),
                    chat_id,
                    topic_id,
                    session_key(chat_id, topic_id),
                    expires_at,
                )
        except Exception as exc:
            logger.warning("CMS web token record failed: %s", exc)

    async def record_web_participant(
        self,
        token: str,
        participant_id: str,
        user_id: int,
        name: str,
        role: str,
        chat_id: int,
        topic_id: Optional[int],
        ttl_seconds: int,
    ) -> None:
        try:
            hashed = token_hash(token)
            expires_at = datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)
            async with self.pool.acquire() as conn:
                async with conn.transaction():
                    await conn.execute(
                        """
                        INSERT INTO cms_web_participants (
                            token_hash, participant_id, user_id, name, role,
                            chat_id, topic_id, expires_at
                        )
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                        ON CONFLICT (token_hash, participant_id) DO UPDATE SET
                            name = EXCLUDED.name,
                            role = EXCLUDED.role,
                            expires_at = EXCLUDED.expires_at
                        """,
                        hashed,
                        participant_id,
                        user_id,
                        name,
                        role,
                        chat_id,
                        topic_id,
                        expires_at,
                    )
                    await conn.execute(
                        """
                        INSERT INTO cms_users (user_id, name, role, is_web)
                        VALUES ($1, $2, $3, TRUE)
                        ON CONFLICT (user_id) DO UPDATE SET
                            name = EXCLUDED.name,
                            role = EXCLUDED.role,
                            is_web = TRUE,
                            last_seen_at = NOW()
                        """,
                        user_id,
                        name,
                        role,
                    )
                    await conn.execute(
                        """
                        UPDATE cms_web_tokens
                        SET participants_joined = (
                                SELECT COUNT(*)
                                FROM cms_web_participants
                                WHERE token_hash = $1
                            ),
                            last_seen_at = NOW()
                        WHERE token_hash = $1
                        """,
                        hashed,
                    )
        except Exception as exc:
            logger.warning("CMS web participant record failed: %s", exc)

    async def record_audit_event(
        self,
        action: str,
        actor: Optional[str] = None,
        status: str = "ok",
        ip: Optional[str] = None,
        payload: Optional[dict[str, Any]] = None,
    ) -> None:
        try:
            async with self.pool.acquire() as conn:
                await conn.execute(
                    """
                    INSERT INTO cms_audit_events (action, actor, status, ip, payload)
                    VALUES ($1, $2, $3, $4, $5::jsonb)
                    """,
                    action,
                    actor,
                    status,
                    ip,
                    json.dumps(payload or {}),
                )
        except Exception as exc:
            logger.warning("CMS audit record failed: %s", exc)

    async def verify_admin_login(self, username: str, password: str) -> Optional[dict[str, Any]]:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT id, username, password_hash, is_active
                FROM cms_admin_accounts
                WHERE username = $1
                """,
                username,
            )
            password_hash = row["password_hash"] if row else ""
            password_ok = verify_password(password, password_hash)
            if not row or not row["is_active"] or not password_ok:
                return None
            await conn.execute(
                "UPDATE cms_admin_accounts SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1",
                row["id"],
            )
        return await self.get_admin_principal(admin_id=int(row["id"]))

    async def get_admin_principal(
        self,
        admin_id: Optional[int] = None,
        username: Optional[str] = None,
    ) -> Optional[dict[str, Any]]:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT id, username, display_name,
                       is_active, is_superuser, created_at, updated_at, last_login_at,
                       COALESCE(theme_preference, 'system') AS theme_preference
                FROM cms_admin_accounts
                WHERE ($1::bigint IS NOT NULL AND id = $1)
                   OR ($2::text IS NOT NULL AND username = $2)
                """,
                admin_id,
                username,
            )
            if not row or not row["is_active"]:
                return None

            role_rows = await conn.fetch(
                """
                SELECT r.id, r.key, r.name, r.description, r.is_system
                FROM cms_roles r
                JOIN cms_admin_roles ar ON ar.role_id = r.id
                WHERE ar.admin_id = $1
                ORDER BY r.name ASC, r.id ASC
                """,
                row["id"],
            )

            if row["is_superuser"]:
                permission_rows = await conn.fetch("SELECT key FROM cms_permissions ORDER BY key ASC")
            else:
                permission_rows = await conn.fetch(
                    """
                    SELECT DISTINCT p.key
                    FROM cms_permissions p
                    JOIN cms_role_permissions rp ON rp.permission_key = p.key
                    JOIN cms_admin_roles ar ON ar.role_id = rp.role_id
                    WHERE ar.admin_id = $1
                    ORDER BY p.key ASC
                    """,
                    row["id"],
                )

            permission_keys = [item["key"] for item in permission_rows]
            page_rows = await conn.fetch(
                """
                SELECT key, label, path, permission_key, sort_order
                FROM cms_pages
                WHERE is_enabled
                  AND ($1::boolean OR permission_key = ANY($2::text[]))
                ORDER BY sort_order ASC, key ASC
                """,
                row["is_superuser"],
                permission_keys,
            )

        data = _row_to_dict(row)
        data["roles"] = [_row_to_dict(role) for role in role_rows]
        data["permissions"] = permission_keys
        data["pages"] = [_row_to_dict(page) for page in page_rows]
        return data

    async def update_admin_theme_preference(self, admin_id: int, theme_preference: str) -> bool:
        """Persist the admin's theme choice. Returns True if the account exists and is active."""
        if theme_preference not in ("dark", "light", "system"):
            raise ValueError(f"invalid theme_preference: {theme_preference!r}")
        async with self.pool.acquire() as conn:
            result = await conn.execute(
                """
                UPDATE cms_admin_accounts
                SET theme_preference = $2,
                    updated_at = NOW()
                WHERE id = $1 AND is_active
                """,
                admin_id,
                theme_preference,
            )
        try:
            affected = int(result.split()[-1])
        except (ValueError, IndexError):
            affected = 0
        return affected > 0

    async def list_cms_permissions(self) -> list[dict[str, Any]]:
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT key, label, description
                FROM cms_permissions
                ORDER BY key ASC
                """
            )
        return [_row_to_dict(row) for row in rows]

    async def list_cms_pages(self) -> list[dict[str, Any]]:
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT key, label, path, permission_key, sort_order, is_enabled
                FROM cms_pages
                ORDER BY sort_order ASC, key ASC
                """
            )
        return [_row_to_dict(row) for row in rows]

    async def list_cms_roles(self) -> list[dict[str, Any]]:
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT id, key, name, description, is_system, created_at, updated_at
                FROM cms_roles
                ORDER BY is_system DESC, name ASC, id ASC
                """
            )
            permissions = await conn.fetch(
                """
                SELECT role_id, permission_key
                FROM cms_role_permissions
                ORDER BY permission_key ASC
                """
            )
        permission_map: dict[int, list[str]] = {}
        for permission in permissions:
            permission_map.setdefault(int(permission["role_id"]), []).append(permission["permission_key"])
        roles = []
        for row in rows:
            item = _row_to_dict(row)
            item["permission_keys"] = permission_map.get(int(row["id"]), [])
            roles.append(item)
        return roles

    async def create_cms_role(
        self,
        key: str,
        name: str,
        description: str,
        permission_keys: list[str],
    ) -> dict[str, Any]:
        clean_permissions = await self._valid_permission_keys(permission_keys)
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                role_id = await conn.fetchval(
                    """
                    INSERT INTO cms_roles (key, name, description, is_system, updated_at)
                    VALUES ($1, $2, $3, FALSE, NOW())
                    RETURNING id
                    """,
                    key,
                    name,
                    description,
                )
                await self._replace_role_permissions(conn, int(role_id), clean_permissions)
        return await self.get_cms_role(int(role_id))

    async def update_cms_role(
        self,
        role_id: int,
        name: str,
        description: str,
        permission_keys: list[str],
    ) -> Optional[dict[str, Any]]:
        clean_permissions = await self._valid_permission_keys(permission_keys)
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                updated = await conn.fetchrow(
                    """
                    UPDATE cms_roles
                    SET name = $2, description = $3, updated_at = NOW()
                    WHERE id = $1 AND is_system = FALSE
                    RETURNING id
                    """,
                    role_id,
                    name,
                    description,
                )
                if not updated:
                    return None
                await self._replace_role_permissions(conn, role_id, clean_permissions)
        return await self.get_cms_role(role_id)

    async def get_cms_role(self, role_id: int) -> dict[str, Any]:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT id, key, name, description, is_system, created_at, updated_at
                FROM cms_roles
                WHERE id = $1
                """,
                role_id,
            )
            permission_rows = await conn.fetch(
                """
                SELECT permission_key
                FROM cms_role_permissions
                WHERE role_id = $1
                ORDER BY permission_key ASC
                """,
                role_id,
            )
        item = _row_to_dict(row)
        item["permission_keys"] = [permission["permission_key"] for permission in permission_rows]
        return item

    async def list_cms_admins(
        self,
        limit: int,
        cursor: Optional[str] = None,
        q: Optional[str] = None,
        active: Optional[bool] = None,
        role_id: Optional[int] = None,
    ) -> dict[str, Any]:
        limit = clamp_limit(limit)
        cur = decode_cursor(cursor)
        cursor_username = cur.get("username")
        cursor_id = cur.get("id")
        clean_q = q.strip().lower() if q and q.strip() else None
        pattern = f"{clean_q}%" if clean_q else None
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT id, username, display_name, is_active,
                       is_superuser, created_at, updated_at, last_login_at
                FROM cms_admin_accounts
                WHERE (
                    $1::text IS NULL
                    OR lower(username) LIKE $1
                    OR lower(COALESCE(display_name, '')) LIKE $1
                )
                  AND ($2::boolean IS NULL OR is_active = $2)
                  AND (
                    $3::bigint IS NULL
                    OR EXISTS (
                        SELECT 1
                        FROM cms_admin_roles role_filter
                        WHERE role_filter.admin_id = cms_admin_accounts.id
                          AND role_filter.role_id = $3
                    )
                  )
                  AND (
                      $4::text IS NULL
                      OR (lower(username), id) > ($4::text, $5::bigint)
                  )
                ORDER BY lower(username) ASC, id ASC
                LIMIT $6
                """,
                pattern,
                active,
                role_id,
                cursor_username,
                cursor_id,
                limit + 1,
            )
            page_rows = rows[:limit]
            admin_ids = [int(row["id"]) for row in page_rows]
            roles = []
            if admin_ids:
                roles = await conn.fetch(
                    """
                    SELECT ar.admin_id, r.id, r.key, r.name, r.is_system
                    FROM cms_admin_roles ar
                    JOIN cms_roles r ON r.id = ar.role_id
                    WHERE ar.admin_id = ANY($1::bigint[])
                    ORDER BY r.name ASC, r.id ASC
                    """,
                    admin_ids,
                )
        has_more = len(rows) > limit
        next_cursor = None
        if has_more and page_rows:
            last = page_rows[-1]
            next_cursor = encode_cursor({"username": last["username"].lower(), "id": int(last["id"])})
        role_map: dict[int, list[dict[str, Any]]] = {}
        for role in roles:
            role_map.setdefault(int(role["admin_id"]), []).append(
                {
                    "id": int(role["id"]),
                    "key": role["key"],
                    "name": role["name"],
                    "is_system": role["is_system"],
                }
            )
        admins = []
        for row in page_rows:
            item = _row_to_dict(row)
            item["roles"] = role_map.get(int(row["id"]), [])
            admins.append(item)
        return {"items": admins, "next_cursor": next_cursor, "limit": limit}

    async def list_all_cms_admins(self) -> list[dict[str, Any]]:
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT id, username, display_name, is_active,
                       is_superuser, created_at, updated_at, last_login_at
                FROM cms_admin_accounts
                ORDER BY lower(username) ASC, id ASC
                """
            )
            roles = await conn.fetch(
                """
                SELECT ar.admin_id, r.id, r.key, r.name, r.is_system
                FROM cms_admin_roles ar
                JOIN cms_roles r ON r.id = ar.role_id
                ORDER BY r.name ASC, r.id ASC
                """
            )
        role_map: dict[int, list[dict[str, Any]]] = {}
        for role in roles:
            role_map.setdefault(int(role["admin_id"]), []).append(
                {
                    "id": int(role["id"]),
                    "key": role["key"],
                    "name": role["name"],
                    "is_system": role["is_system"],
                }
            )
        admins = []
        for row in rows:
            item = _row_to_dict(row)
            item["roles"] = role_map.get(int(row["id"]), [])
            admins.append(item)
        return admins

    async def get_cms_admin_account(self, admin_id: int) -> Optional[dict[str, Any]]:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT id, username, display_name, is_active,
                       is_superuser, created_at, updated_at, last_login_at
                FROM cms_admin_accounts
                WHERE id = $1
                """,
                admin_id,
            )
            if not row:
                return None
            roles = await conn.fetch(
                """
                SELECT r.id, r.key, r.name, r.is_system
                FROM cms_admin_roles ar
                JOIN cms_roles r ON r.id = ar.role_id
                WHERE ar.admin_id = $1
                ORDER BY r.name ASC, r.id ASC
                """,
                admin_id,
            )
        item = _row_to_dict(row)
        item["roles"] = [
            {
                "id": int(role["id"]),
                "key": role["key"],
                "name": role["name"],
                "is_system": role["is_system"],
            }
            for role in roles
        ]
        return item

    async def create_cms_admin(
        self,
        username: str,
        password: str,
        display_name: Optional[str],
        is_active: bool,
        role_ids: list[int],
    ) -> dict[str, Any]:
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                admin_id = await conn.fetchval(
                    """
                    INSERT INTO cms_admin_accounts (
                        username, password_hash, display_name, is_active, is_superuser, updated_at
                    )
                    VALUES ($1, $2, $3, $4, FALSE, NOW())
                    RETURNING id
                    """,
                    username,
                    hash_password(password),
                    display_name,
                    is_active,
                )
                await self._replace_admin_roles(conn, int(admin_id), role_ids)
        return await self.get_cms_admin_account(int(admin_id)) or {}

    async def update_cms_admin(
        self,
        admin_id: int,
        display_name: Optional[str],
        is_active: bool,
        role_ids: list[int],
        password: Optional[str] = None,
    ) -> Optional[dict[str, Any]]:
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                if password:
                    row = await conn.fetchrow(
                        """
                        UPDATE cms_admin_accounts
                        SET display_name = $2,
                            is_active = $3,
                            password_hash = $4,
                            updated_at = NOW()
                        WHERE id = $1
                        RETURNING id
                        """,
                        admin_id,
                        display_name,
                        is_active,
                        hash_password(password),
                    )
                else:
                    row = await conn.fetchrow(
                        """
                        UPDATE cms_admin_accounts
                        SET display_name = $2,
                            is_active = $3,
                            updated_at = NOW()
                        WHERE id = $1
                        RETURNING id
                        """,
                        admin_id,
                        display_name,
                        is_active,
                    )
                if not row:
                    return None
                await self._replace_admin_roles(conn, admin_id, role_ids)
        return await self.get_cms_admin_account(admin_id)

    async def _valid_permission_keys(self, permission_keys: list[str]) -> list[str]:
        if not permission_keys:
            return []
        unique_keys = sorted(set(permission_keys))
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT key
                FROM cms_permissions
                WHERE key = ANY($1::text[])
                ORDER BY key ASC
                """,
                unique_keys,
            )
        return [row["key"] for row in rows]

    async def _replace_role_permissions(
        self,
        conn: asyncpg.Connection,
        role_id: int,
        permission_keys: list[str],
    ) -> None:
        await conn.execute("DELETE FROM cms_role_permissions WHERE role_id = $1", role_id)
        if permission_keys:
            await conn.executemany(
                """
                INSERT INTO cms_role_permissions (role_id, permission_key)
                VALUES ($1, $2)
                ON CONFLICT DO NOTHING
                """,
                [(role_id, permission_key) for permission_key in permission_keys],
            )

    async def _replace_admin_roles(
        self,
        conn: asyncpg.Connection,
        admin_id: int,
        role_ids: list[int],
    ) -> None:
        await conn.execute("DELETE FROM cms_admin_roles WHERE admin_id = $1", admin_id)
        if role_ids:
            await conn.executemany(
                """
                INSERT INTO cms_admin_roles (admin_id, role_id)
                SELECT $1, id
                FROM cms_roles
                WHERE id = $2
                ON CONFLICT DO NOTHING
                """,
                [(admin_id, role_id) for role_id in sorted(set(role_ids))],
            )

    async def overview(self) -> dict[str, Any]:
        async with self.pool.acquire() as conn:
            sessions = await conn.fetchrow(
                """
                SELECT
                    COUNT(*)::bigint AS total_sessions,
                    COUNT(*) FILTER (WHERE is_active)::bigint AS active_sessions,
                    COALESCE(SUM(total_votes), 0)::bigint AS total_votes,
                    COALESCE(SUM(total_tasks), 0)::bigint AS total_tasks
                FROM cms_sessions
                WHERE deleted_at IS NULL
                """
            )
            users = await conn.fetchrow(
                """
                SELECT
                    COUNT(*)::bigint AS total_users,
                    COUNT(*) FILTER (WHERE is_web)::bigint AS web_users
                FROM cms_users
                """
            )
            # Tokens tied to deleted sessions are excluded so the overview
            # stays consistent with the visible session list.
            tokens = await conn.fetchrow(
                """
                SELECT
                    COUNT(*) FILTER (WHERE wt.expires_at > NOW())::bigint AS active_web_tokens,
                    COUNT(*)::bigint AS total_web_tokens
                FROM cms_web_tokens wt
                LEFT JOIN cms_sessions s ON s.session_key = wt.session_key
                WHERE s.id IS NULL OR s.deleted_at IS NULL
                """
            )
            votes = await conn.fetchval(
                """
                SELECT COUNT(*)::bigint
                FROM cms_votes v
                JOIN cms_sessions s ON s.id = v.session_id
                WHERE s.deleted_at IS NULL
                """
            )
            return {
                **_row_to_dict(sessions),
                **_row_to_dict(users),
                **_row_to_dict(tokens),
                "votes_rows": votes or 0,
            }

    async def list_sessions(
        self,
        limit: int,
        cursor: Optional[str] = None,
        q: Optional[str] = None,
        active: Optional[bool] = None,
        chat_id: Optional[int] = None,
        topic_id: Optional[int] = None,
    ) -> dict[str, Any]:
        limit = clamp_limit(limit)
        cur = decode_cursor(cursor)
        cursor_ts = _decode_cursor_timestamp(cur.get("updated_at"))
        cursor_id = cur.get("id")
        pattern = f"%{q.strip()}%" if q and q.strip() else None
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT id, session_key, chat_id, topic_id, title, current_task_index,
                       participants_count, tasks_queue_count, history_count,
                       last_batch_count, total_tasks, total_votes, batch_completed,
                       is_active, current_batch_id, current_batch_started_at,
                       current_task_id, tasks_version, updated_at
                FROM cms_sessions
                WHERE deleted_at IS NULL
                  AND (
                      $1::text IS NULL
                      OR session_key ILIKE $1
                      OR current_batch_id ILIKE $1
                      OR title ILIKE $1
                  )
                  AND ($2::boolean IS NULL OR is_active = $2)
                  AND ($3::bigint IS NULL OR chat_id = $3)
                  AND ($4::bigint IS NULL OR topic_id IS NOT DISTINCT FROM $4)
                  AND (
                      $5::timestamptz IS NULL
                      OR (updated_at, id) < ($5::timestamptz, $6::bigint)
                  )
                ORDER BY updated_at DESC, id DESC
                LIMIT $7
                """,
                pattern,
                active,
                chat_id,
                topic_id,
                cursor_ts,
                cursor_id,
                limit + 1,
            )
        return self._paged_rows(rows, limit, "updated_at")

    async def get_session(
        self,
        session_id: int,
        *,
        include_deleted: bool = False,
    ) -> Optional[dict[str, Any]]:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT id, session_key, chat_id, topic_id, title, current_task_index,
                       participants_count, tasks_queue_count, history_count,
                       last_batch_count, total_tasks, total_votes, batch_completed,
                       is_active, current_batch_id, current_batch_started_at,
                       current_task_id, tasks_version, updated_at, deleted_at, raw
                FROM cms_sessions
                WHERE id = $1
                  AND ($2::boolean OR deleted_at IS NULL)
                """,
                session_id,
                include_deleted,
            )
        return _row_to_dict(row) if row else None

    async def soft_delete_session(self, session_id: int) -> Optional[tuple[int, Optional[int]]]:
        """Mark a session as deleted. Returns (chat_id, topic_id) for callers
        that need to clean up live Redis state, or None if the row was already
        missing/deleted.

        Children (tasks, votes, participants, web tokens, web participants)
        remain in their tables. They naturally disappear from CMS listings via
        the same ``deleted_at`` filter on the session join.
        """
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                UPDATE cms_sessions
                SET deleted_at = NOW(), is_active = FALSE, updated_at = NOW()
                WHERE id = $1 AND deleted_at IS NULL
                RETURNING chat_id, topic_id
                """,
                session_id,
            )
        if not row:
            return None
        return int(row["chat_id"]), (int(row["topic_id"]) if row["topic_id"] is not None else None)

    async def get_session_by_chat(
        self,
        chat_id: int,
        topic_id: Optional[int],
    ) -> Optional[dict[str, Any]]:
        """Lookup a CMS session row by its live identity (chat+topic). Used
        by the app API when serving manager state to attach the stored title.
        Returns ``None`` for missing or soft-deleted sessions."""
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT id, session_key, chat_id, topic_id, title, is_active,
                       batch_completed, updated_at
                FROM cms_sessions
                WHERE chat_id = $1
                  AND topic_id IS NOT DISTINCT FROM $2
                  AND deleted_at IS NULL
                """,
                chat_id,
                topic_id,
            )
        return _row_to_dict(row) if row else None

    async def set_session_title_by_chat(
        self,
        chat_id: int,
        topic_id: Optional[int],
        title: Optional[str],
        *,
        only_if_empty: bool = True,
    ) -> bool:
        """Write a human-readable title onto the cms_sessions row for the given
        chat+topic. Idempotent — safe to call from session-create paths even
        before the background ``sync_session`` job has materialized the row.

        When ``only_if_empty`` is set (default), an existing title is
        preserved so re-running the create flow never clobbers a manually
        renamed session. Returns True when the title is now stored as
        requested.
        """
        normalized = (title or "").strip()
        if not normalized:
            return False
        key = session_key(chat_id, topic_id)
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO cms_sessions (session_key, chat_id, topic_id, title, raw)
                VALUES ($1, $2, $3, $4, '{}'::jsonb)
                ON CONFLICT (session_key) DO UPDATE SET
                    title = CASE
                        WHEN $5::boolean = FALSE THEN EXCLUDED.title
                        WHEN cms_sessions.title IS NULL OR cms_sessions.title = ''
                            THEN EXCLUDED.title
                        ELSE cms_sessions.title
                    END,
                    updated_at = NOW()
                WHERE cms_sessions.deleted_at IS NULL
                RETURNING id
                """,
                key,
                chat_id,
                topic_id,
                normalized,
                only_if_empty,
            )
        return row is not None

    async def rename_session(
        self,
        session_id: int,
        title: Optional[str],
    ) -> Optional[tuple[int, Optional[int], Optional[str]]]:
        """Update or clear the title on a CMS session row. Returns
        ``(chat_id, topic_id, new_title)`` for callers that audit the change,
        or ``None`` if the row is missing/deleted."""
        normalized = (title or "").strip() or None
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                UPDATE cms_sessions
                SET title = $2, updated_at = NOW()
                WHERE id = $1 AND deleted_at IS NULL
                RETURNING chat_id, topic_id, title
                """,
                session_id,
                normalized,
            )
        if not row:
            return None
        return (
            int(row["chat_id"]),
            (int(row["topic_id"]) if row["topic_id"] is not None else None),
            row["title"],
        )

    async def revoke_web_token(self, token_id: int) -> Optional[str]:
        """Force-expire a web invite token. Returns the token_hash so the
        caller can also wipe the Redis ``web:<token>`` key when known."""
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                UPDATE cms_web_tokens
                SET expires_at = NOW() - INTERVAL '1 second',
                    last_seen_at = NOW()
                WHERE id = $1 AND expires_at > NOW()
                RETURNING token_hash
                """,
                token_id,
            )
        return row["token_hash"] if row else None

    async def list_session_participants(
        self,
        session_id: int,
        limit: int,
        cursor: Optional[str] = None,
    ) -> dict[str, Any]:
        limit = clamp_limit(limit)
        cur = decode_cursor(cursor)
        cursor_user_id = cur.get("user_id")
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT session_id, user_id, name, role, source, first_seen_at, last_seen_at
                FROM cms_session_participants
                WHERE session_id = $1
                  AND ($2::bigint IS NULL OR user_id > $2)
                ORDER BY user_id ASC
                LIMIT $3
                """,
                session_id,
                cursor_user_id,
                limit + 1,
            )
        return self._paged_rows(rows, limit, "user_id")

    async def list_session_tasks(
        self,
        session_id: int,
        limit: int,
        cursor: Optional[str] = None,
        bucket: Optional[str] = None,
        q: Optional[str] = None,
    ) -> dict[str, Any]:
        limit = clamp_limit(limit)
        cur = decode_cursor(cursor)
        cursor_id = cur.get("id")
        pattern = f"%{q.strip()}%" if q and q.strip() else None
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT id, session_id, task_uid, bucket, bucket_index, jira_key,
                       summary, url, story_points, source, votes_count,
                       numeric_avg, numeric_max, completed_at, jql,
                       created_at_text, domain_updated_at, updated_at
                FROM cms_tasks
                WHERE session_id = $1
                  AND ($2::text IS NULL OR bucket = $2)
                  AND ($3::bigint IS NULL OR id > $3)
                  AND (
                      $4::text IS NULL
                      OR task_uid ILIKE $4
                      OR jira_key ILIKE $4
                      OR summary ILIKE $4
                  )
                ORDER BY
                    CASE bucket
                        WHEN 'tasks_queue' THEN 1
                        WHEN 'history' THEN 2
                        WHEN 'last_batch' THEN 3
                        ELSE 4
                    END,
                    bucket_index ASC,
                    id ASC
                LIMIT $5
                """,
                session_id,
                bucket,
                cursor_id,
                pattern,
                limit + 1,
            )
        return self._paged_rows(rows, limit, "id")

    async def list_users(
        self,
        limit: int,
        cursor: Optional[str] = None,
        q: Optional[str] = None,
        role: Optional[str] = None,
    ) -> dict[str, Any]:
        limit = clamp_limit(limit)
        cur = decode_cursor(cursor)
        cursor_ts = _decode_cursor_timestamp(cur.get("last_seen_at"))
        cursor_user_id = cur.get("user_id")
        pattern = f"%{q.strip()}%" if q and q.strip() else None
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT user_id, name, role, is_web, first_seen_at, last_seen_at
                FROM cms_users
                WHERE ($1::text IS NULL OR name ILIKE $1 OR user_id::text ILIKE $1)
                  AND ($2::text IS NULL OR role = $2)
                  AND (
                      $3::timestamptz IS NULL
                      OR (last_seen_at, user_id) < ($3::timestamptz, $4::bigint)
                  )
                ORDER BY last_seen_at DESC, user_id DESC
                LIMIT $5
                """,
                pattern,
                role,
                cursor_ts,
                cursor_user_id,
                limit + 1,
            )
        return self._paged_rows(rows, limit, "last_seen_at")

    async def hard_delete_user(self, user_id: int, confirm_name: str) -> Optional[dict[str, Any]]:
        """Hard-delete a participant from the CMS read model.

        This intentionally removes the aggregate user row plus CMS-only traces
        that point to the same user_id. It does not mutate live session state in
        Redis, so a participant who joins again can be backfilled as a new CMS
        record later.
        """
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                user = await conn.fetchrow(
                    """
                    SELECT user_id, name, role, is_web, first_seen_at, last_seen_at
                    FROM cms_users
                    WHERE user_id = $1
                    """,
                    user_id,
                )
                if not user:
                    return None
                if confirm_name.strip() != str(user["name"]):
                    raise ValueError("participant name confirmation mismatch")

                task_rows = await conn.fetch(
                    "SELECT DISTINCT task_id FROM cms_votes WHERE user_id = $1",
                    user_id,
                )
                affected_task_ids = [int(row["task_id"]) for row in task_rows]

                votes_deleted = await conn.fetchval(
                    "WITH deleted AS (DELETE FROM cms_votes WHERE user_id = $1 RETURNING 1) SELECT COUNT(*) FROM deleted",
                    user_id,
                )
                session_participants_deleted = await conn.fetchval(
                    "WITH deleted AS (DELETE FROM cms_session_participants WHERE user_id = $1 RETURNING 1) SELECT COUNT(*) FROM deleted",
                    user_id,
                )
                web_participants_deleted = await conn.fetchval(
                    "WITH deleted AS (DELETE FROM cms_web_participants WHERE user_id = $1 RETURNING 1) SELECT COUNT(*) FROM deleted",
                    user_id,
                )
                await conn.execute("DELETE FROM cms_users WHERE user_id = $1", user_id)

                if affected_task_ids:
                    await conn.execute(
                        """
                        WITH affected(task_id) AS (
                            SELECT unnest($1::bigint[])
                        ),
                        agg AS (
                            SELECT
                                task_id,
                                COUNT(*)::integer AS votes_count,
                                AVG(numeric_value) FILTER (WHERE is_numeric)::numeric AS numeric_avg,
                                MAX(numeric_value) FILTER (WHERE is_numeric)::integer AS numeric_max
                            FROM cms_votes
                            WHERE task_id = ANY($1::bigint[])
                            GROUP BY task_id
                        )
                        UPDATE cms_tasks AS task
                        SET
                            votes_count = COALESCE(agg.votes_count, 0),
                            numeric_avg = agg.numeric_avg,
                            numeric_max = agg.numeric_max,
                            updated_at = NOW()
                        FROM affected
                        LEFT JOIN agg ON agg.task_id = affected.task_id
                        WHERE task.id = affected.task_id
                        """,
                        affected_task_ids,
                    )

        data = _row_to_dict(user)
        data["votes_deleted"] = int(votes_deleted or 0)
        data["session_participants_deleted"] = int(session_participants_deleted or 0)
        data["web_participants_deleted"] = int(web_participants_deleted or 0)
        return data

    async def list_web_tokens(
        self,
        limit: int,
        cursor: Optional[str] = None,
        active: Optional[bool] = None,
    ) -> dict[str, Any]:
        limit = clamp_limit(limit)
        cur = decode_cursor(cursor)
        cursor_id = cur.get("id")
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT id, token_prefix, token_hash, chat_id, topic_id, session_key,
                       participants_joined, created_at, expires_at, last_seen_at,
                       expires_at > NOW() AS is_active
                FROM cms_web_tokens
                WHERE ($1::boolean IS NULL OR (expires_at > NOW()) = $1)
                  AND ($2::bigint IS NULL OR id < $2)
                ORDER BY id DESC
                LIMIT $3
                """,
                active,
                cursor_id,
                limit + 1,
            )
        return self._paged_rows(rows, limit, "id")

    async def list_web_participants(
        self,
        limit: int,
        cursor: Optional[str] = None,
        token_hash_filter: Optional[str] = None,
        active: Optional[bool] = None,
    ) -> dict[str, Any]:
        limit = clamp_limit(limit)
        cur = decode_cursor(cursor)
        cursor_id = cur.get("id")
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT id, token_hash, participant_id, user_id, name, role,
                       chat_id, topic_id, joined_at, expires_at,
                       expires_at > NOW() AS is_active
                FROM cms_web_participants
                WHERE ($1::text IS NULL OR token_hash = $1)
                  AND ($2::boolean IS NULL OR (expires_at > NOW()) = $2)
                  AND ($3::bigint IS NULL OR id < $3)
                ORDER BY id DESC
                LIMIT $4
                """,
                token_hash_filter,
                active,
                cursor_id,
                limit + 1,
            )
        return self._paged_rows(rows, limit, "id")

    async def list_votes(
        self,
        limit: int,
        cursor: Optional[str] = None,
        session_id: Optional[int] = None,
        task_id: Optional[int] = None,
        user_id: Optional[int] = None,
    ) -> dict[str, Any]:
        limit = clamp_limit(limit)
        cur = decode_cursor(cursor)
        cursor_id = cur.get("id")
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT v.id, v.task_id, v.session_id, v.user_id, v.value,
                       v.is_numeric, v.numeric_value, v.created_at,
                       u.name AS user_name, u.role AS user_role,
                       t.jira_key, t.summary, t.bucket,
                       s.chat_id, s.topic_id, s.session_key
                FROM cms_votes v
                JOIN cms_tasks t ON t.id = v.task_id
                JOIN cms_sessions s ON s.id = v.session_id
                LEFT JOIN cms_users u ON u.user_id = v.user_id
                WHERE ($1::bigint IS NULL OR v.session_id = $1)
                  AND ($2::bigint IS NULL OR v.task_id = $2)
                  AND ($3::bigint IS NULL OR v.user_id = $3)
                  AND ($4::bigint IS NULL OR v.id < $4)
                ORDER BY v.id DESC
                LIMIT $5
                """,
                session_id,
                task_id,
                user_id,
                cursor_id,
                limit + 1,
            )
        return self._paged_rows(rows, limit, "id")

    async def list_audit_events(
        self,
        limit: int,
        cursor: Optional[str] = None,
        action: Optional[str] = None,
        status: Optional[str] = None,
        actor: Optional[str] = None,
    ) -> dict[str, Any]:
        limit = clamp_limit(limit)
        cur = decode_cursor(cursor)
        cursor_ts = _decode_cursor_timestamp(cur.get("ts"))
        cursor_id = cur.get("id")
        normalized_actor = actor.strip() if actor and actor.strip() else None
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT id, ts, action, actor, status, ip, payload
                FROM cms_audit_events
                WHERE ($1::text IS NULL OR action = $1)
                  AND ($2::text IS NULL OR status = $2)
                  AND ($6::text IS NULL OR actor = $6)
                  AND (
                      $3::timestamptz IS NULL
                      OR (ts, id) < ($3::timestamptz, $4::bigint)
                  )
                ORDER BY ts DESC, id DESC
                LIMIT $5
                """,
                action,
                status,
                cursor_ts,
                cursor_id,
                limit + 1,
                normalized_actor,
            )
        return self._paged_rows(rows, limit, "ts")

    def _paged_rows(self, rows: list[asyncpg.Record], limit: int, cursor_field: str) -> dict[str, Any]:
        has_more = len(rows) > limit
        page_rows = rows[:limit]
        items = [_row_to_dict(row) for row in page_rows]
        next_cursor = None
        if has_more and page_rows:
            last = items[-1]
            payload = {"id": last.get("id")}
            if "user_id" in last:
                payload["user_id"] = last.get("user_id")
            if cursor_field in last:
                payload[cursor_field] = last[cursor_field]
            elif cursor_field == "user_id":
                payload["user_id"] = last.get("user_id")
            next_cursor = encode_cursor(payload)
        return {"items": items, "next_cursor": next_cursor, "limit": limit}

    async def close(self) -> None:
        await self.pool.close()
