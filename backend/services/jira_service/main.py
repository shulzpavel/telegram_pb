#!/usr/bin/env python3
"""Jira Service - FastAPI microservice for Jira API operations."""

import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

from services.jira_service.api import router
from services.jira_service.client import JiraServiceClient
from services.jira_service.health import health_router
from services.jira_service.metrics import metrics_router

ALLOWED_CORS_METHODS = ["GET", "POST", "PATCH", "DELETE", "OPTIONS"]
ALLOWED_CORS_HEADERS = ["Authorization", "Content-Type", "X-Requested-With"]


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup/shutdown.

    The Jira HTTP client used to be instantiated per request, which defeated
    its in-memory issue cache (``OrderedDict``) and forced a brand-new
    ``aiohttp.ClientSession`` for every Jira call. We now create a single
    client on startup and tear it down on shutdown; ``api.get_jira_client``
    yields this instance to every request handler.
    """
    print("🚀 Jira Service starting...")
    app.state.jira_client = JiraServiceClient()
    try:
        yield
    finally:
        print("🛑 Jira Service shutting down...")
        await app.state.jira_client.close()


app = FastAPI(
    title="Jira Service",
    description="Microservice for Jira API operations with caching and retries",
    version="1.0.0",
    lifespan=lifespan,
)


def _cors_origins() -> list[str]:
    raw = os.getenv("JIRA_SERVICE_CORS_ORIGINS") or os.getenv("CORS_ORIGINS") or ""
    origins = [origin.strip() for origin in raw.split(",") if origin.strip()]
    if origins:
        return origins
    return [
        "http://localhost:3001",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]


# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_credentials=True,
    allow_methods=ALLOWED_CORS_METHODS,
    allow_headers=ALLOWED_CORS_HEADERS,
)

# Include routers
app.include_router(health_router, prefix="/health", tags=["health"])
app.include_router(metrics_router, prefix="/metrics", tags=["metrics"])
app.include_router(router, prefix="/api/v1", tags=["jira"])


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("JIRA_SERVICE_PORT", "8001"))
    uvicorn.run(app, host="0.0.0.0", port=port)
