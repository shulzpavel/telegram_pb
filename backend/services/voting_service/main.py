#!/usr/bin/env python3
"""Voting Service - FastAPI microservice for session and voting management."""

import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

from services.voting_service.api import router
from services.voting_service.app_api import app_router
from services.voting_service.health import health_router
from services.voting_service.metrics import metrics_router
from services.voting_service.cms_api import cms_router
from services.voting_service.web_api import web_router, REDIS_URL
from services.common.cors import ALLOWED_CORS_HEADERS, ALLOWED_CORS_METHODS, cors_origins
from services.voting_service.security import CSRFMiddleware


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup/shutdown."""
    import asyncio
    import redis.asyncio as aioredis

    print("🚀 Voting Service starting...")
    from services.voting_service.repository import get_repository
    repo = await get_repository()
    app.state.repository = repo

    cms_store = None
    postgres_dsn = os.getenv("POSTGRES_DSN")
    if postgres_dsn:
        try:
            from services.voting_service.cms_store import PostgresCmsStore
            cms_store = await PostgresCmsStore.create(postgres_dsn)
            await cms_store.ensure_access_defaults(
                os.getenv("CMS_USERNAME", "admin"),
                os.getenv("CMS_PASSWORD", ""),
            )
            if hasattr(repo, "set_cms_store"):
                repo.set_cms_store(cms_store)
        except Exception as exc:
            print(f"[CMS] Postgres read model unavailable: {exc!r}")
    app.state.cms_store = cms_store

    web_redis = await aioredis.from_url(REDIS_URL, decode_responses=True)
    app.state.web_redis = web_redis

    app.state.cms_backfill_task = None
    if cms_store:
        from services.voting_service.cms_store import backfill_cms_from_redis
        app.state.cms_backfill_task = asyncio.create_task(
            backfill_cms_from_redis(web_redis, cms_store)
        )

    yield

    print("🛑 Voting Service shutting down...")
    if getattr(app.state, "cms_backfill_task", None):
        app.state.cms_backfill_task.cancel()
        try:
            await app.state.cms_backfill_task
        except asyncio.CancelledError:
            pass
    if hasattr(app.state, "repository"):
        await app.state.repository.close()
    if getattr(app.state, "cms_store", None):
        await app.state.cms_store.close()
    if hasattr(app.state, "web_redis"):
        await app.state.web_redis.aclose()


app = FastAPI(
    title="Voting Service",
    description="Microservice for Planning Poker session and voting management",
    version="1.0.0",
    lifespan=lifespan,
)


app.add_middleware(CSRFMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins("CORS_ORIGINS", "WEB_UI_URL"),
    allow_credentials=True,
    allow_methods=ALLOWED_CORS_METHODS,
    allow_headers=ALLOWED_CORS_HEADERS,
)

# Include routers
app.include_router(health_router, prefix="/health", tags=["health"])
app.include_router(metrics_router, prefix="/metrics", tags=["metrics"])
app.include_router(router, prefix="/api/v1", tags=["voting"])
app.include_router(app_router, prefix="/api/v1", tags=["app"])
app.include_router(web_router, prefix="/api/v1", tags=["web"])
app.include_router(cms_router, prefix="/api/v1", tags=["cms"])


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("VOTING_SERVICE_PORT", "8002"))
    uvicorn.run(app, host="0.0.0.0", port=port)
