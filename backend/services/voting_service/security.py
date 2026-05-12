"""Shared security settings for Voting Service HTTP APIs."""

from __future__ import annotations

import os
import secrets

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

CMS_COOKIE_NAME = "cms_token"
CMS_CSRF_COOKIE_NAME = "cms_csrf"
CMS_CSRF_HEADER_NAME = "x-csrf-token"

API_PREFIX = "/api/v1"
CMS_API_PREFIX = f"{API_PREFIX}/cms/"
APP_API_PREFIX = f"{API_PREFIX}/app/"
CMS_LOGIN_PATH = f"{API_PREFIX}/cms/auth/login"
APP_DEMO_SESSION_PATH = f"{API_PREFIX}/app/demo-session"

SAFE_HTTP_METHODS = {"GET", "HEAD", "OPTIONS", "TRACE"}
CSRF_PROTECTED_PREFIXES = (CMS_API_PREFIX, APP_API_PREFIX)
CSRF_EXEMPT_PATHS = {
    CMS_LOGIN_PATH,
    APP_DEMO_SESSION_PATH,
}


def env_flag(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.lower() in {"1", "true", "yes", "on"}


def new_csrf_token() -> str:
    return secrets.token_urlsafe(32)


def csrf_required(request: Request) -> bool:
    if request.method.upper() in SAFE_HTTP_METHODS:
        return False
    path = request.url.path
    return path not in CSRF_EXEMPT_PATHS and path.startswith(CSRF_PROTECTED_PREFIXES)


def csrf_is_valid(request: Request) -> bool:
    cookie_value = request.cookies.get(CMS_CSRF_COOKIE_NAME)
    header_value = request.headers.get(CMS_CSRF_HEADER_NAME)
    if not cookie_value or not header_value:
        return False
    return secrets.compare_digest(cookie_value, header_value)


def csrf_cookie_auth_is_valid(request: Request) -> bool:
    if not request.cookies.get(CMS_COOKIE_NAME):
        return True
    return csrf_is_valid(request)


class CSRFMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if csrf_required(request) and not csrf_cookie_auth_is_valid(request):
            return JSONResponse({"detail": "CSRF token missing or invalid"}, status_code=403)
        return await call_next(request)
