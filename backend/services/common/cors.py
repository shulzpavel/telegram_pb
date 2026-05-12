"""CORS settings shared by FastAPI services."""

from __future__ import annotations

import os

DEFAULT_DEV_ORIGINS = [
    "http://localhost:3001",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

ALLOWED_CORS_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
ALLOWED_CORS_HEADERS = [
    "Accept",
    "Authorization",
    "Content-Type",
    "Origin",
    "X-CSRF-Token",
    "X-Requested-With",
]


def cors_origins(*env_names: str) -> list[str]:
    for env_name in env_names:
        raw = os.getenv(env_name, "")
        origins = [origin.strip() for origin in raw.split(",") if origin.strip()]
        if origins:
            return origins
    return DEFAULT_DEV_ORIGINS
