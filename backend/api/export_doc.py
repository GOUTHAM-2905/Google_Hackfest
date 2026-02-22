"""GET /api/export/{service_name}/{table_name} — return documentation artifacts."""
import logging
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import PlainTextResponse

from api.generate import get_cached_doc
from api.profile import get_cached_profile
from core.export_builder import build_json, build_markdown
from models.documentation import DocumentationArtifact

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/export/{service_name}/{table_name}")
def export_table(
    service_name: str,
    table_name: str,
    format: str = Query("json", pattern="^(json|markdown|both)$"),
):
    artifact = get_cached_doc(service_name, table_name)
    profile = get_cached_profile(service_name, table_name)

    if not artifact and not profile:
        raise HTTPException(
            status_code=404,
            detail=f"No data found for '{table_name}' in service '{service_name}'. Run /api/profile or /api/generate first.",
        )

    if not artifact:
        # Create a placeholder artifact to allow exporting profile even if doc isn't generated
        from datetime import datetime
        from core.db_connector import reflect_schema
        from api.ingest import get_connection
        
        try:
            conn_req = get_connection(service_name)
            tables = reflect_schema(conn_req)
            table_meta = next((t for t in tables if t.table_name == table_name), None)
            cols = [c.dict() for c in table_meta.columns] if table_meta else [{"name": c.column_name, "data_type": (c.statistics.data_type if c.statistics else "")} for c in profile.columns]
        except Exception:
            cols = [{"name": c.column_name, "data_type": c.statistics.data_type if c.statistics else ""} for c in profile.columns] if profile else []

        artifact = DocumentationArtifact(
            table_name=table_name,
            business_summary="Documentation pending generation...",
            usage_recommendations="No recommendations available.",
            quality_score=profile.aggregate_score if profile else 0.0,
            generated_at=datetime.utcnow(),
            columns=cols
        )

    if format == "json":
        return build_json(artifact, profile)
    elif format == "markdown":
        md = build_markdown(artifact, profile)
        return PlainTextResponse(content=md, media_type="text/markdown")
    else:  # both
        return {
            "json": build_json(artifact, profile),
            "markdown": build_markdown(artifact, profile),
        }
