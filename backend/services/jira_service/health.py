"""Health check endpoints for Jira Service."""

import os

from fastapi import APIRouter, Response
from pydantic import BaseModel

from services.jira_service.client import JiraServiceClient

router = APIRouter()
health_router = router  # backward compatibility


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str


@router.get("/", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """Basic liveness."""
    return HealthResponse(status="healthy", service="jira-service", version="1.0.0")


def _env_present(name: str) -> bool:
    return bool(os.getenv(name, "").strip())


def _demo_fallback_enabled() -> bool:
    return os.getenv("JIRA_DEMO_FALLBACK", "false").strip().lower() in {"1", "true", "yes", "on"}


@router.get("/ready")
async def readiness_check(response: Response) -> dict:
    """Readiness without leaking Jira credentials."""
    jira_configured = _env_present("JIRA_URL") and _env_present("JIRA_USERNAME") and _env_present("JIRA_API_TOKEN")
    story_points_field = os.getenv("STORY_POINTS_FIELD", "").strip()
    demo_fallback = _demo_fallback_enabled()

    try:
        client = JiraServiceClient()
        await client.close()
        status = "ready" if jira_configured or demo_fallback else "not_ready"
        if status != "ready":
            response.status_code = 503
        return {
            "status": status,
            "jira_configured": jira_configured,
            "demo_fallback_enabled": demo_fallback,
            "story_points_field": story_points_field or None,
        }
    except Exception as exc:  # noqa: BLE001
        response.status_code = 503
        return {
            "status": "not_ready",
            "jira_configured": jira_configured,
            "demo_fallback_enabled": demo_fallback,
            "story_points_field": story_points_field or None,
            "error": str(exc),
        }


@router.get("/live")
async def liveness_check() -> dict:
    """Liveness endpoint."""
    return {"status": "alive"}
