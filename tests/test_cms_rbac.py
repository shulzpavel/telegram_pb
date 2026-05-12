import pytest
from fastapi import HTTPException

from services.voting_service import cms_api
from services.voting_service.cms_api import CmsPrincipal, require_permission
from services.voting_service.cms_rbac import (
    ALL_PERMISSION_KEYS,
    CMS_PAGE_DEFINITIONS,
    CMS_PERMISSION_DEFINITIONS,
    PERM_ACCESS_MANAGE,
    PERM_USERS_VIEW,
    hash_password,
    verify_password,
)


def test_password_hash_verification_round_trip():
    encoded = hash_password("correct horse battery staple")

    assert encoded.startswith("pbkdf2_sha256$")
    assert verify_password("correct horse battery staple", encoded)
    assert not verify_password("wrong", encoded)


def test_every_cms_page_references_known_permission():
    permission_keys = {permission["key"] for permission in CMS_PERMISSION_DEFINITIONS}

    assert set(ALL_PERMISSION_KEYS) == permission_keys
    assert CMS_PAGE_DEFINITIONS
    for page in CMS_PAGE_DEFINITIONS:
        assert page["permission_key"] in permission_keys
        assert page["path"].startswith("/cms")


@pytest.mark.asyncio
async def test_require_permission_allows_only_matching_permission_or_superuser():
    checker = require_permission(PERM_USERS_VIEW)
    allowed = CmsPrincipal(
        id=1,
        username="users-viewer",
        display_name=None,
        is_superuser=False,
        permissions=frozenset({PERM_USERS_VIEW}),
        roles=(),
        pages=(),
    )
    denied = CmsPrincipal(
        id=2,
        username="access-manager",
        display_name=None,
        is_superuser=False,
        permissions=frozenset({PERM_ACCESS_MANAGE}),
        roles=(),
        pages=(),
    )
    superuser = CmsPrincipal(
        id=3,
        username="root",
        display_name=None,
        is_superuser=True,
        permissions=frozenset(),
        roles=(),
        pages=(),
    )

    assert await checker(allowed) is allowed
    assert await checker(superuser) is superuser
    with pytest.raises(HTTPException) as exc_info:
        await checker(denied)
    assert exc_info.value.status_code == 403


class FakeRedis:
    def __init__(self) -> None:
        self.values: dict[str, int] = {}
        self.expirations: dict[str, int] = {}

    async def get(self, key: str):
        return self.values.get(key)

    async def incr(self, key: str):
        self.values[key] = self.values.get(key, 0) + 1
        return self.values[key]

    async def expire(self, key: str, seconds: int):
        self.expirations[key] = seconds


@pytest.mark.asyncio
async def test_login_rate_limit_blocks_after_configured_failures():
    redis = FakeRedis()
    key = await cms_api._ensure_login_not_limited(redis, "admin", "127.0.0.1")

    for _ in range(cms_api.CMS_LOGIN_MAX_ATTEMPTS):
        await cms_api._record_login_failure(redis, key)

    assert redis.expirations[key] == cms_api.CMS_LOGIN_WINDOW_SECONDS
    with pytest.raises(HTTPException) as exc_info:
        await cms_api._ensure_login_not_limited(redis, "admin", "127.0.0.1")
    assert exc_info.value.status_code == 429
