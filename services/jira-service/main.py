#!/usr/bin/env python3
"""Jira Service - FastAPI microservice for Jira API operations."""

import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from services.jira_service.api import router
from services.jira_service.health import health_router
from services.jira_service.metrics import metrics_router


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

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(health_router, prefix="/health", tags=["health"])
app.include_router(metrics_router, prefix="/metrics", tags=["metrics"])
app.include_router(router, prefix="/api/v1", tags=["jira"])


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("JIRA_SERVICE_PORT", "8001"))
    uvicorn.run(app, host="0.0.0.0", port=port)
