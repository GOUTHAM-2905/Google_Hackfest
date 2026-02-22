"""POST /api/profile — run SQL pushdown quality analysis for one or all tables."""
import logging
import time
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from core.quality_profiler import profile_table
from core.db_connector import reflect_schema
from api.ingest import get_connection
from api.alerts import record_profile
from models.quality import TableQualityProfile

router = APIRouter()
logger = logging.getLogger(__name__)

# In-memory profile cache: service_name → {table_name → TableQualityProfile}
_profile_cache: dict[str, dict[str, TableQualityProfile]] = {}


class ProfileRequest(BaseModel):
    service_name: str
    table_name: Optional[str] = None   # None = profile all tables


class ProfileBatchResponse(BaseModel):
    service_name: str
    tables_profiled: int
    duration_seconds: float
    profiles: list[TableQualityProfile]


@router.post("/profile")
def profile(req: ProfileRequest):
    conn_req = get_connection(req.service_name)
    t0 = time.time()

    if req.table_name:
        # Single table
        try:
            result = profile_table(conn_req, req.table_name)
        except Exception as e:
            raise HTTPException(500, detail=f"Profiling failed for {req.table_name}: {e}")
        _profile_cache.setdefault(req.service_name, {})[req.table_name] = result
        record_profile(req.service_name, req.table_name, result.aggregate_score, result.grade)
        return result
    else:
        # All tables
        try:
            tables = reflect_schema(conn_req)
        except Exception as e:
            raise HTTPException(500, detail=str(e))

        results: list[TableQualityProfile] = []
        for t in tables:
            try:
                p = profile_table(conn_req, t.table_name)
                _profile_cache.setdefault(req.service_name, {})[t.table_name] = p
                record_profile(req.service_name, t.table_name, p.aggregate_score, p.grade)
                results.append(p)
            except Exception as e:
                logger.warning("Profiling error for %s: %s", t.table_name, e)

        return ProfileBatchResponse(
            service_name=req.service_name,
            tables_profiled=len(results),
            duration_seconds=round(time.time() - t0, 2),
            profiles=results,
        )


def get_cached_profile(service_name: str, table_name: str) -> Optional[TableQualityProfile]:
    return _profile_cache.get(service_name, {}).get(table_name)
