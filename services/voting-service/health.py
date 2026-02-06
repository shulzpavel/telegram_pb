"""Health check endpoints."""

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class HealthResponse(BaseModel):
    """Health check response."""

    status: str
    service: str
    version: str


@router.get("/", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """Basic health check."""
    return HealthResponse(
        status="healthy",
        service="voting-service",
        version="1.0.0",
    )


@router.get("/ready")
async def readiness_check() -> dict:
    """Readiness check - verify database connection."""
    try:
        import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from services.voting_service.repository import get_repository
        repo = await get_repository()
        # Try a simple operation
        # For file-based, just check if it exists
        await repo.close()
        return {"status": "ready"}
    except Exception as e:
        return {"status": "not_ready", "error": str(e)}


@router.get("/live")
async def liveness_check() -> dict:
    """Liveness check."""
    return {"status": "alive"}
