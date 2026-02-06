"""Metrics endpoints."""

from fastapi import APIRouter

router = APIRouter()


@router.get("/", response_model=dict)
async def get_metrics() -> dict:
    """Get service metrics."""
    # TODO: Implement actual metrics collection
    return {
        "sessions_count": 0,
        "active_sessions": 0,
        "total_votes": 0,
    }
