"""Metrics endpoints."""

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class MetricsResponse(BaseModel):
    """Metrics response."""

    cache_size: int
    cache_hits: int
    cache_misses: int


@router.get("/", response_model=dict)
async def get_metrics() -> dict:
    """Get service metrics."""
    # TODO: Implement actual metrics collection
    return {
        "cache_size": 0,
        "cache_hits": 0,
        "cache_misses": 0,
    }
