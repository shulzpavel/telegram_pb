"""Health check endpoints for Jira Service."""

from fastapi import APIRouter
from pydantic import BaseModel

from services.jira_service.client import JiraServiceClient

router = APIRouter()


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str


@router.get("/", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """Basic liveness."""
    return HealthResponse(status="healthy", service="jira-service", version="1.0.0")


@router.get("/ready")
async def readiness_check() -> dict:
    """Readiness: попытка создать/закрыть клиент."""
    try:
        client = JiraServiceClient()
        await client.close()
        return {"status": "ready"}
    except Exception as exc:  # noqa: BLE001
        return {"status": "not_ready", "error": str(exc)}


@router.get("/live")
async def liveness_check() -> dict:
    """Liveness endpoint."""
    return {"status": "alive"}
