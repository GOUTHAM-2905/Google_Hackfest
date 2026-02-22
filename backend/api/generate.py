"""POST /api/generate — AI documentation generation for undocumented tables."""
import logging
import time
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from core.db_connector import reflect_schema
from core.doc_generator import generate_table_documentation
from api.ingest import get_connection
from api.profile import get_cached_profile
from integrations.openmetadata_client import OpenMetadataClient
from integrations.ollama_client import OllamaClient
from models.documentation import GenerationResponse, GenerationResult, DocumentationArtifact

router = APIRouter()
logger = logging.getLogger(__name__)

# In-memory cache: service_name → {table_name → DocumentationArtifact}
_doc_cache: dict[str, dict[str, DocumentationArtifact]] = {}


class GenerateRequest(BaseModel):
    service_name: str
    table_name: Optional[str] = None   # None = generate for all undocumented tables


@router.post("/generate", response_model=GenerationResponse)
def generate(req: GenerateRequest):
    conn_req = get_connection(req.service_name)
    t0 = time.time()
    ollama = OllamaClient()
    db_name = conn_req.database or "local"

    # Figure out which tables to document
    try:
        all_tables = reflect_schema(conn_req)
    except Exception as e:
        raise HTTPException(500, detail=str(e))

    if req.table_name:
        tables = [t for t in all_tables if t.table_name == req.table_name]
        if not tables:
            raise HTTPException(404, detail=f"Table '{req.table_name}' not found")
    else:
        # Skip already-documented tables (simple check via doc cache)
        documented = set(_doc_cache.get(req.service_name, {}).keys())
        tables = [t for t in all_tables if t.table_name not in documented]

    results: list[GenerationResult] = []
    with OpenMetadataClient() as om:
        for table in tables:
            profile = get_cached_profile(req.service_name, table.table_name)
            result = generate_table_documentation(
                table=table,
                profile=profile,
                ollama=ollama,
                om_client=om,
                service_name=req.service_name,
                db_name=db_name,
            )
            if result.status == "success":
                from datetime import datetime
                _doc_cache.setdefault(req.service_name, {})[table.table_name] = DocumentationArtifact(
                    table_name=table.table_name,
                    fully_qualified_name=table.fully_qualified_name,
                    business_summary=result.business_summary or "",
                    usage_recommendations=result.usage_recommendations or "",
                    quality_score=result.quality_score or 0.0,
                    generated_at=datetime.utcnow(),
                    columns=[c.dict() for c in table.columns],
                )
            results.append(result)

    success_count = sum(1 for r in results if r.status == "success")
    return GenerationResponse(
        service_name=req.service_name,
        tables_documented=success_count,
        duration_seconds=round(time.time() - t0, 2),
        results=results,
    )


def get_cached_doc(service_name: str, table_name: str) -> Optional[DocumentationArtifact]:
    return _doc_cache.get(service_name, {}).get(table_name)
