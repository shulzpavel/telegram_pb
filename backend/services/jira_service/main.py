#!/usr/bin/env python3
"""Jira Service - FastAPI microservice for Jira API operations."""

import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

from services.jira_service.api import router
from services.jira_service.health import health_router
from services.jira_service.metrics import metrics_router
from services.common.cors import ALLOWED_CORS_HEADERS, ALLOWED_CORS_METHODS, cors_origins


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup/shutdown."""
    # Startup
    print("🚀 Jira Service starting...")
    yield
    # Shutdown
    print("🛑 Jira Service shutting down...")


app = FastAPI(
    title="Jira Service",
    description="Microservice for Jira API operations with caching and retries",
    version="1.0.0",
    lifespan=lifespan,
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins("JIRA_SERVICE_CORS_ORIGINS", "CORS_ORIGINS"),
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
