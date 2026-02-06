#!/usr/bin/env python3
"""Voting Service - FastAPI microservice for session and voting management."""

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

from services.voting_service.api import router
from services.voting_service.health import health_router
from services.voting_service.metrics import metrics_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup/shutdown."""
    # Startup
    print("🚀 Voting Service starting...")
    # Initialize repository connections
    from services.voting_service.repository import get_repository
    repo = await get_repository()
    app.state.repository = repo
    yield
    # Shutdown
    print("🛑 Voting Service shutting down...")
    if hasattr(app.state, "repository"):
        await app.state.repository.close()


app = FastAPI(
    title="Voting Service",
    description="Microservice for Planning Poker session and voting management",
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
app.include_router(router, prefix="/api/v1", tags=["voting"])


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("VOTING_SERVICE_PORT", "8002"))
    uvicorn.run(app, host="0.0.0.0", port=port)
