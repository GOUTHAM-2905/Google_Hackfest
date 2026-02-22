"""GET /api/health — system dependency check."""
import logging
import httpx
from fastapi import APIRouter
from config import settings

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/health")
def health_check():
    ollama_status = _check_ollama()
    om_status     = _check_openmetadata()
    overall = "ok" if ollama_status["status"] == "up" and om_status["status"] == "up" else "degraded"
    return {
        "status": overall,
        "services": {
            "ollama":        ollama_status,
            "openmetadata":  om_status,
        },
    }


def _check_ollama() -> dict:
    try:
        resp = httpx.get(f"{settings.OLLAMA_HOST}/api/version", timeout=5)
        resp.raise_for_status()
        return {"status": "up", "model": settings.OLLAMA_MODEL, "url": settings.OLLAMA_HOST}
    except Exception as e:
        return {"status": "down", "error": str(e)}


def _check_openmetadata() -> dict:
    try:
        resp = httpx.get(f"{settings.OPENMETADATA_HOST}/api/v1/system/config/jwks", timeout=5)
        resp.raise_for_status()
        return {"status": "up", "url": settings.OPENMETADATA_HOST}
    except Exception as e:
        return {"status": "down", "error": str(e)}
