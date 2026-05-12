from __future__ import annotations

import importlib
import os
import subprocess
import sys

from fastapi.testclient import TestClient
from starlette.requests import Request

from services.voting_service.security import (
    APP_DEMO_SESSION_PATH,
    CMS_LOGIN_PATH,
    csrf_cookie_auth_is_valid,
    csrf_is_valid,
    csrf_required,
)
from services.voting_service.web_api import _stable_user_id


def _request(method: str, path: str, *, csrf_cookie: str | None = None, csrf_header: str | None = None) -> Request:
    headers: list[tuple[bytes, bytes]] = []
    cookies = []
    if csrf_cookie is not None:
        cookies.append(f"cms_csrf={csrf_cookie}")
    if csrf_header is not None:
        headers.append((b"x-csrf-token", csrf_header.encode("ascii")))
    if cookies:
        headers.append((b"cookie", "; ".join(cookies).encode("ascii")))
    return Request(
        {
            "type": "http",
            "method": method,
            "path": path,
            "headers": headers,
            "query_string": b"",
            "server": ("testserver", 80),
            "scheme": "http",
        }
    )


def test_stable_user_id_is_deterministic_in_current_process():
    assert _stable_user_id("participant-123") == _stable_user_id("participant-123")
    assert _stable_user_id("participant-123") != _stable_user_id("participant-456")
    assert _stable_user_id("participant-123") < 0


def test_stable_user_id_is_independent_from_python_hash_seed():
    script = "from services.voting_service.web_api import _stable_user_id; print(_stable_user_id('participant-123'))"
    env = os.environ.copy()
    env["PYTHONPATH"] = "backend"
    env["PYTHONHASHSEED"] = "1"
    first = subprocess.check_output([sys.executable, "-c", script], text=True, env=env).strip()
    env["PYTHONHASHSEED"] = "2"
    second = subprocess.check_output([sys.executable, "-c", script], text=True, env=env).strip()

    assert first == second == str(_stable_user_id("participant-123"))


def test_csrf_required_only_for_unsafe_cookie_auth_routes():
    assert not csrf_required(_request("GET", "/api/v1/cms/users"))
    assert not csrf_required(_request("POST", CMS_LOGIN_PATH))
    assert not csrf_required(_request("POST", APP_DEMO_SESSION_PATH))
    assert csrf_required(_request("POST", "/api/v1/cms/access/admins"))
    assert csrf_required(_request("PATCH", "/api/v1/app/sessions/1/tasks/abc"))


def test_csrf_validation_uses_double_submit_cookie_and_header():
    assert csrf_is_valid(_request("POST", "/api/v1/cms/access/admins", csrf_cookie="same", csrf_header="same"))
    assert not csrf_is_valid(_request("POST", "/api/v1/cms/access/admins", csrf_cookie="same", csrf_header="other"))
    assert not csrf_is_valid(_request("POST", "/api/v1/cms/access/admins", csrf_cookie="same"))


def test_csrf_cookie_auth_validation_only_enforces_when_auth_cookie_exists():
    no_auth_cookie = _request("POST", "/api/v1/cms/access/admins")
    assert csrf_cookie_auth_is_valid(no_auth_cookie)

    with_auth_cookie = Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/api/v1/cms/access/admins",
            "headers": [(b"cookie", b"cms_token=auth; cms_csrf=same"), (b"x-csrf-token", b"same")],
            "query_string": b"",
            "server": ("testserver", 80),
            "scheme": "http",
        }
    )
    assert csrf_cookie_auth_is_valid(with_auth_cookie)

    invalid = Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/api/v1/cms/access/admins",
            "headers": [(b"cookie", b"cms_token=auth; cms_csrf=same"), (b"x-csrf-token", b"other")],
            "query_string": b"",
            "server": ("testserver", 80),
            "scheme": "http",
        }
    )
    assert not csrf_cookie_auth_is_valid(invalid)


def test_csrf_middleware_runs_with_cors_preflight_and_cookie_auth_paths(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", "http://localhost:3001")
    main = importlib.import_module("services.voting_service.main")
    main = importlib.reload(main)
    client = TestClient(main.app)

    preflight = client.options(
        "/api/v1/app/sessions",
        headers={
            "Origin": "http://localhost:3001",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type,x-csrf-token",
        },
    )
    assert preflight.status_code == 200
    assert preflight.headers["access-control-allow-origin"] == "http://localhost:3001"

    no_cookie = client.post("/api/v1/app/sessions", json={"title": "No auth"})
    assert no_cookie.status_code == 401

    client.cookies.set("cms_token", "fake")
    client.cookies.set("cms_csrf", "expected")
    bad_csrf = client.post(
        "/api/v1/app/sessions",
        json={"title": "Bad csrf"},
        headers={"X-CSRF-Token": "actual"},
    )
    assert bad_csrf.status_code == 403
    assert bad_csrf.json()["detail"] == "CSRF token missing or invalid"
